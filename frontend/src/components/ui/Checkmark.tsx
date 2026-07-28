import { cn } from '@/lib/cn';

/** Spring-y green checkmark used on successful submits. */
export function Checkmark({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-grid animate-check-pop place-items-center rounded-full bg-success/12', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 52 52" width={size * 0.62} height={size * 0.62} fill="none" aria-hidden="true">
        <path
          d="M14 27l8 8 16-18"
          stroke="#16a34a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 60,
            strokeDashoffset: 60,
            animation: 'draw-check 0.45s 0.1s cubic-bezier(0.22,1,0.36,1) forwards',
          }}
        />
      </svg>
      <style>{`@keyframes draw-check{to{stroke-dashoffset:0}}`}</style>
    </span>
  );
}
