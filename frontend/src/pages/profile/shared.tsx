import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconCheck } from '@/components/icons';
import { Spinner } from '@/components/ui/Spinner';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-colors',
        status === 'error' ? 'text-danger' : status === 'saving' ? 'text-subtle' : 'text-success',
      )}
      role="status"
      aria-live="polite"
    >
      {status === 'saving' && <Spinner className="h-3.5 w-3.5" />}
      {status === 'saved' && <IconCheck className="h-3.5 w-3.5" />}
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed'}
    </span>
  );
}

/**
 * Debounced autosave for a single object (e.g. the profile). Accumulates partial
 * changes and flushes them together after `delay` ms.
 */
export function useAutosave<T extends object>(
  save: (patch: Partial<T>) => Promise<unknown>,
  delay = 650,
): { status: SaveStatus; queue: (patch: Partial<T>) => void; flushNow: () => void } {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const pending = useRef<Partial<T>>({});
  const timer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setStatus('saving');
    try {
      await saveRef.current(patch);
      setStatus('saved');
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('error');
    }
  }, []);

  const queue = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('saving');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  return { status, queue, flushNow: () => void flush() };
}

/** Per-item debounced saver keyed by id — used by repeatable sections. */
export function useItemSaver<In>(
  save: (id: string, body: In) => Promise<unknown>,
  onStatus?: (status: SaveStatus) => void,
  delay = 650,
) {
  const timers = useRef<Record<string, number>>({});
  const saveRef = useRef(save);
  saveRef.current = save;

  const queue = useCallback(
    (id: string, body: In) => {
      onStatus?.('saving');
      if (timers.current[id]) window.clearTimeout(timers.current[id]);
      timers.current[id] = window.setTimeout(async () => {
        try {
          await saveRef.current(id, body);
          onStatus?.('saved');
        } catch {
          onStatus?.('error');
        }
      }, delay);
    },
    [delay, onStatus],
  );

  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  return queue;
}

export function SectionTitle({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-1">
      <h3 className="text-sm font-semibold tracking-tightest">{children}</h3>
      {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
    </div>
  );
}

export function ItemCard({
  children,
  onRemove,
  dragHandle,
  className,
  ...rest
}: {
  children: ReactNode;
  onRemove?: () => void;
  dragHandle?: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-soft', className)}
      {...rest}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-subtle">{dragHandle}</div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-red-50 hover:text-danger dark:hover:bg-red-950/30"
            aria-label="Remove"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
