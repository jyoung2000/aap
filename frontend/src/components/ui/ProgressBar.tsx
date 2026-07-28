import { cn } from '@/lib/cn';

interface ProgressBarProps {
  /** 0..1. When undefined, shows an indeterminate animation. */
  value?: number;
  className?: string;
  tone?: 'accent' | 'success';
}

export function ProgressBar({ value, className, tone = 'accent' }: ProgressBarProps) {
  const indeterminate = value === undefined;
  const pct = Math.max(0, Math.min(1, value ?? 0)) * 100;
  const barColor = tone === 'success' ? 'bg-success' : 'bg-accent-600';
  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-2))]', className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <div className={cn('absolute inset-y-0 animate-progress-indeterminate rounded-full', barColor)} />
      ) : (
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-spring', barColor)}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
