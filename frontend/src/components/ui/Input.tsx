import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const fieldBase =
  'w-full rounded-xl border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] px-3.5 text-sm text-[rgb(var(--text))] placeholder:text-[rgb(var(--text-subtle))] transition-all duration-150 focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500/25 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'py-2.5 min-h-[80px] resize-y', className)} {...props} />;
  },
);

export function Label({
  children,
  htmlFor,
  className,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  hint?: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('mb-1.5 flex items-center gap-2 text-[13px] font-medium text-[rgb(var(--text))]', className)}
    >
      {children}
      {hint && <span className="font-normal text-subtle">{hint}</span>}
    </label>
  );
}

let fieldId = 0;

export function Field({
  label,
  hint,
  help,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = `f${++fieldId}`;
  return (
    <div className={cn('min-w-0', className)}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      {children(id)}
      {help && <p className="mt-1.5 text-[12px] text-subtle">{help}</p>}
    </div>
  );
}
