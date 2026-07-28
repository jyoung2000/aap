import { useMemo } from 'react';
import { encodeQR } from '@/lib/qr';

interface QRCodeProps {
  value: string;
  size?: number;
  /** Quiet-zone modules around the code (spec minimum is 4). */
  quietZone?: number;
  className?: string;
  title?: string;
}

/** Renders a QR code as crisp SVG rectangles. Fully self-contained (no network). */
export function QRCode({ value, size = 200, quietZone = 4, className, title }: QRCodeProps) {
  const matrix = useMemo(() => {
    try {
      return encodeQR(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div
        className="grid place-items-center rounded-xl bg-red-50 text-xs text-danger dark:bg-red-950/40"
        style={{ width: size, height: size }}
      >
        QR unavailable
      </div>
    );
  }

  const count = matrix.length;
  const total = count + quietZone * 2;
  // Merge horizontal runs of dark modules into single rects to keep the SVG small.
  const rects: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < count; r++) {
    let run = 0;
    for (let c = 0; c <= count; c++) {
      const dark = c < count && matrix[r][c];
      if (dark) {
        run++;
      } else if (run > 0) {
        rects.push({ x: c - run + quietZone, y: r + quietZone, w: run });
        run = 0;
      }
    }
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={title || 'QR code'}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" rx={1} />
      <g fill="#0b0f17">
        {rects.map((rect, i) => (
          <rect key={i} x={rect.x} y={rect.y} width={rect.w} height={1} />
        ))}
      </g>
    </svg>
  );
}
