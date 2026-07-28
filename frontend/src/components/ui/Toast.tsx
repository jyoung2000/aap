import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastApi {
  toast: (opts: { tone?: ToastTone; title: string; message?: string; duration?: number }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const icons: Record<ToastTone, ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" className="h-5 w-5 text-success" fill="none">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M6 10.5l2.5 2.5L14 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" className="h-5 w-5 text-danger" fill="none">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M10 6v5M10 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" className="h-5 w-5 text-accent-600" fill="none">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      <path d="M10 9v5M10 6h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastApi['toast']>(
    ({ tone = 'info', title, message, duration = 4200 }) => {
      const id = ++counter.current;
      setItems((prev) => [...prev, { id, tone, title, message }]);
      window.setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, message) => toast({ tone: 'success', title, message }),
      error: (title, message) => toast({ tone: 'error', title, message }),
      info: (title, message) => toast({ tone: 'info', title, message }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
          {items.map((t) => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-fade-in-up items-start gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-elevated))] p-3.5 pr-4 shadow-elevated',
              )}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tightest">{t.title}</p>
                {t.message && <p className="mt-0.5 text-[13px] text-muted">{t.message}</p>}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 rounded-md p-0.5 text-subtle transition-colors hover:text-[rgb(var(--text))]"
                aria-label="Dismiss"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
