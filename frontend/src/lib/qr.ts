// Minimal, self-contained QR code generator (byte mode, EC level M, versions 1-10).
// No external network / no dependencies. Returns a boolean matrix (true = dark),
// excluding the quiet zone. Implements ISO/IEC 18004: Reed-Solomon over GF(256),
// data/EC interleaving, function-pattern placement, all 8 masks + penalty scoring,
// and BCH format/version information.
//
// Capacity note: v10-M holds ~213 bytes — far more than any pairing URL.

// ---- Galois field GF(256), primitive polynomial 0x11d ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Reed-Solomon generator polynomial of the given degree.
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// EC codewords for one data block.
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i], factor);
  }
  return res;
}

// ---- Per-version tables (EC level M, versions 1-10) ----
// [ecCodewordsPerBlock, blocksG1, dataCwG1, blocksG2, dataCwG2]
const EC_BLOCKS_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const ALIGN_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// Remainder bits per version (1-10).
const REMAINDER: Record<number, number> = {
  1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0,
};

const MAX_VERSION = 10;

function totalDataCodewords(version: number): number {
  const [, b1, d1, b2, d2] = EC_BLOCKS_M[version];
  return b1 * d1 + b2 * d2;
}

function charCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

function byteCapacity(version: number): number {
  const bits = totalDataCodewords(version) * 8 - 4 - charCountBits(version);
  return Math.floor(bits / 8);
}

function chooseVersion(len: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (byteCapacity(v) >= len) return v;
  }
  throw new Error('QR: data too long for supported versions');
}

// ---- Bit buffer ----
class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

// ---- Assemble the full codeword stream (data + EC, interleaved) ----
function buildCodewords(text: string, version: number): number[] {
  const data = utf8Bytes(text);
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte mode
  buf.put(data.length, charCountBits(version));
  for (const b of data) buf.put(b, 8);

  const capacityBits = totalDataCodewords(version) * 8;
  // Terminator (up to 4 zero bits).
  const term = Math.min(4, capacityBits - buf.length);
  if (term > 0) buf.put(0, term);
  // Pad to a byte boundary.
  while (buf.length % 8 !== 0) buf.bits.push(0);

  const dataCodewords: number[] = [];
  for (let i = 0; i < buf.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    dataCodewords.push(byte);
  }
  // Pad bytes.
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (dataCodewords.length < totalDataCodewords(version)) {
    dataCodewords.push(padBytes[pi % 2]);
    pi++;
  }

  // Split into blocks.
  const [ecLen, b1, d1, b2, d2] = EC_BLOCKS_M[version];
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  for (let i = 0; i < b1; i++) {
    const d = dataCodewords.slice(offset, offset + d1);
    offset += d1;
    blocks.push({ data: d, ec: rsEncode(d, ecLen) });
  }
  for (let i = 0; i < b2; i++) {
    const d = dataCodewords.slice(offset, offset + d2);
    offset += d2;
    blocks.push({ data: d, ec: rsEncode(d, ecLen) });
  }

  // Interleave data, then EC.
  const result: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) {
    for (const blk of blocks) if (i < blk.data.length) result.push(blk.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const blk of blocks) result.push(blk.ec[i]);
  }
  return result;
}

// ---- Matrix construction ----
type Grid = (boolean | null)[][];

function makeGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(grid: Grid, reserved: boolean[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= grid.length || cc >= grid.length) continue;
      const inRing =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[rr][cc] = inRing || inCenter;
      reserved[rr][cc] = true;
    }
  }
}

function placeAlignment(grid: Grid, reserved: boolean[][], version: number) {
  const positions = ALIGN_POS[version];
  for (const r of positions) {
    for (const c of positions) {
      // Skip if overlapping a finder pattern.
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark =
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          grid[r + dr][c + dc] = isDark;
          reserved[r + dr][c + dc] = true;
        }
      }
    }
  }
}

function placeTiming(grid: Grid, reserved: boolean[][]) {
  const size = grid.length;
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!reserved[6][i]) {
      grid[6][i] = dark;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      grid[i][6] = dark;
      reserved[i][6] = true;
    }
  }
}

function reserveFormatAreas(reserved: boolean[][], version: number) {
  const size = reserved.length;
  // Dark module.
  reserved[4 * version + 9][8] = true;
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  // Version info blocks (version >= 7).
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        reserved[r][size - 11 + c] = true;
        reserved[size - 11 + c][r] = true;
      }
    }
  }
}

function placeData(grid: Grid, reserved: boolean[][], codewords: number[], remainder: number) {
  const size = grid.length;
  const bits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  for (let i = 0; i < remainder; i++) bits.push(0);

  let idx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip the vertical timing column
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        grid[row][cc] = idx < bits.length ? bits[idx] === 1 : false;
        idx++;
      }
    }
    upward = !upward;
  }
}

function maskFn(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function applyMask(grid: Grid, reserved: boolean[][], mask: number): boolean[][] {
  const size = grid.length;
  const out = grid.map((row) => row.map((v) => v === true));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && maskFn(mask, r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}

// BCH-15,5 format information (EC level M = 0b00).
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= g << (i - 10);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0b101010000010010;
}

function placeFormat(matrix: boolean[][], mask: number) {
  const size = matrix.length;
  const bits = formatBits(mask);
  const get = (i: number) => ((bits >>> i) & 1) === 1;
  // Around top-left finder.
  for (let i = 0; i <= 5; i++) matrix[8][i] = get(i);
  matrix[8][7] = get(6);
  matrix[8][8] = get(7);
  matrix[7][8] = get(8);
  for (let i = 9; i <= 14; i++) matrix[14 - i][8] = get(i);
  // Around the other two finders + dark module.
  for (let i = 0; i <= 7; i++) matrix[size - 1 - i][8] = get(i);
  for (let i = 8; i <= 14; i++) matrix[8][size - 15 + i] = get(i);
  matrix[size - 8][8] = true; // dark module
}

// BCH-18,6 version information (version >= 7).
function versionBits(version: number): number {
  let rem = version << 12;
  const g = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= g << (i - 12);
  }
  return (version << 12) | (rem & 0xfff);
}

function placeVersion(matrix: boolean[][], version: number) {
  if (version < 7) return;
  const size = matrix.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    matrix[r][size - 11 + c] = bit;
    matrix[size - 11 + c][r] = bit;
  }
}

function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  // Rule 1: runs of 5+ same-color in rows/cols.
  const runScore = (line: boolean[]) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run++;
        if (run === 5) s += 3;
        else if (run > 5) s += 1;
      } else run = 1;
    }
    return s;
  };
  for (let r = 0; r < size; r++) score += runScore(m[r]);
  for (let c = 0; c < size; c++) score += runScore(m.map((row) => row[c]));
  // Rule 2: 2x2 blocks.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (line: boolean[], i: number, pat: boolean[]) => {
    for (let k = 0; k < pat.length; k++) if (line[i + k] !== pat[k]) return false;
    return true;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      if (matches(m[r], c, pat1) || matches(m[r], c, pat2)) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    const col = m.map((row) => row[c]);
    for (let r = 0; r <= size - 11; r++) {
      if (matches(col, r, pat1) || matches(col, r, pat2)) score += 40;
    }
  }
  // Rule 4: dark/light balance.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
  const ratio = (dark / (size * size)) * 100;
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

/** Encode text into a QR module matrix (true = dark). No quiet zone included. */
export function encodeQR(text: string): boolean[][] {
  const version = chooseVersion(utf8Bytes(text).length);
  const size = version * 4 + 17;
  const codewords = buildCodewords(text, version);

  const grid = makeGrid(size);
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  placeFinder(grid, reserved, 0, 0);
  placeFinder(grid, reserved, 0, size - 7);
  placeFinder(grid, reserved, size - 7, 0);
  placeAlignment(grid, reserved, version);
  placeTiming(grid, reserved);
  reserveFormatAreas(reserved, version);
  // Dark module.
  grid[4 * version + 9][8] = true;

  placeData(grid, reserved, codewords, REMAINDER[version]);

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(grid, reserved, mask);
    placeFormat(masked, mask);
    placeVersion(masked, version);
    const p = penalty(masked);
    if (p < bestScore) {
      bestScore = p;
      best = masked;
      bestMask = mask;
    }
  }
  // Re-render the chosen mask cleanly.
  const masked = applyMask(grid, reserved, bestMask);
  placeFormat(masked, bestMask);
  placeVersion(masked, version);
  best = masked;
  return best;
}
