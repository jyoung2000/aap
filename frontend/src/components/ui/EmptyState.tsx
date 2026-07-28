import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))]/40 px-6 py-14 text-center animate-fade-in',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-300">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold tracking-tightest">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
