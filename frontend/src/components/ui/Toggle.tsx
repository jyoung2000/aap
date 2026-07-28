import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, label, id, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-[42px] shrink-0 items-center rounded-full transition-colors duration-200 ease-spring focus-visible:outline-none disabled:opacity-50',
        checked ? 'bg-accent-600' : 'bg-[rgb(var(--border-strong))]',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform duration-200 ease-spring',
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  indeterminate?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function Checkbox({ checked, onChange, indeterminate, disabled, className, ...aria }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border transition-all duration-150',
        checked || indeterminate
          ? 'border-accent-600 bg-accent-600 text-white'
          : 'border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] hover:border-accent-400',
        disabled && 'opacity-50',
        className,
      )}
    >
      {indeterminate ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
          <path d="M4 8h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : checked ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
          <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}
