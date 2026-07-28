import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-xl transition-all duration-150 ease-spring focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-600 text-white shadow-soft hover:bg-accent-700 hover:shadow-card dark:bg-accent-500 dark:hover:bg-accent-600',
  secondary:
    'border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] shadow-soft',
  ghost:
    'text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]',
  subtle:
    'bg-accent-50 text-accent-700 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:bg-accent-500/20',
  danger:
    'bg-danger text-white shadow-soft hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-10 w-10 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leftIcon, rightIcon, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
