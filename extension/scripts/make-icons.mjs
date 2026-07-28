// Generates JobPilot toolbar/notification icons as PNGs into public/icon/.
// Pure Node (zlib only) — a deep-blue rounded tile with a white paper-plane mark,
// 2x supersampled for clean edges. Run once: `node scripts/make-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'icon');
mkdirSync(OUT, { recursive: true });

const SIZES = [16, 32, 48, 96, 128];

// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function inTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Paper-plane silhouette (two triangles), normalized 0..1.
const PLANE_A = [
  [0.9, 0.16],
  [0.12, 0.52],
  [0.52, 0.58],
];
const PLANE_B = [
  [0.9, 0.16],
  [0.52, 0.58],
  [0.58, 0.9],
];

function renderAt(size) {
  const S = size * 2; // supersample
  const buf = Buffer.alloc(S * S * 4);
  const radius = S * 0.23;
  const inRounded = (x, y) => {
    const rx = Math.min(x, S - 1 - x);
    const ry = Math.min(y, S - 1 - y);
    if (rx >= radius || ry >= radius) return true;
    const dx = radius - rx;
    const dy = radius - ry;
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (!inRounded(x, y)) {
        buf[i + 3] = 0;
        continue;
      }
      const t = y / S;
      let r = Math.round(lerp(37, 96, t));
      let g = Math.round(lerp(99, 165, t));
      let b = Math.round(lerp(235, 250, t));
      const nx = x / S;
      const ny = y / S;
      if (inTriangle(nx, ny, ...PLANE_A) || inTriangle(nx, ny, ...PLANE_B)) {
        r = g = b = 255;
      }
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  // Box downsample 2x -> size
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const si = ((y * 2 + dy) * S + (x * 2 + dx)) * 4;
          r += buf[si];
          g += buf[si + 1];
          b += buf[si + 2];
          a += buf[si + 3];
        }
      }
      const oi = (y * size + x) * 4;
      out[oi] = Math.round(r / 4);
      out[oi + 1] = Math.round(g / 4);
      out[oi + 2] = Math.round(b / 4);
      out[oi + 3] = Math.round(a / 4);
    }
  }
  return out;
}

for (const size of SIZES) {
  const rgba = renderAt(size);
  writeFileSync(join(OUT, `${size}.png`), encodePNG(size, size, rgba));
  console.log(`icon/${size}.png`);
}
