import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'purple';

const tones: Record<Tone, string> = {
  neutral:
    'bg-[rgb(var(--surface-2))] text-[rgb(var(--text-muted))] border-[rgb(var(--border))]',
  accent: 'bg-accent-50 text-accent-700 border-accent-100 dark:bg-accent-500/10 dark:text-accent-300 dark:border-accent-500/20',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  danger: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20',
  purple: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Match-score chip, colored by score. */
export function MatchChip({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-[13px] text-subtle">—</span>;
  }
  const tone: Tone = score >= 80 ? 'success' : score >= 60 ? 'accent' : score >= 40 ? 'warning' : 'neutral';
  return (
    <Badge tone={tone} className="tabular-nums font-semibold">
      {score}
    </Badge>
  );
}

/** Deterministic source badge. */
export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge tone="neutral" className="capitalize">
      {source || 'unknown'}
    </Badge>
  );
}
