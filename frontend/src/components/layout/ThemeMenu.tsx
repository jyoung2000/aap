import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { Theme } from '@/api/types';
import { cn } from '@/lib/cn';
import { IconMonitor, IconMoon, IconSun } from '@/components/icons';

const OPTIONS: { value: Theme; icon: (p: { className?: string }) => JSX.Element; label: string }[] = [
  { value: 'system', icon: IconMonitor, label: 'System' },
  { value: 'light', icon: IconSun, label: 'Light' },
  { value: 'dark', icon: IconMoon, label: 'Dark' },
];

/** Theme control that persists locally AND to the user's account (user.theme). */
export function ThemeMenu({ compact }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { user, updateSettings } = useAuth();

  const choose = (t: Theme) => {
    setTheme(t);
    if (user && user.theme !== t) {
      void updateSettings({ theme: t }).catch(() => undefined);
    }
  };

  if (compact) {
    const order: Theme[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    const current = OPTIONS.find((o) => o.value === theme)!;
    return (
      <button
        onClick={() => choose(next)}
        aria-label={`Theme: ${current.label}. Switch theme`}
        className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]"
      >
        <current.icon className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => choose(o.value)}
          className={cn(
            'grid h-8 w-9 place-items-center rounded-[9px] transition-colors duration-150',
            theme === o.value
              ? 'bg-[rgb(var(--surface-2))] text-accent-600 shadow-soft dark:text-accent-300'
              : 'text-subtle hover:text-[rgb(var(--text))]',
          )}
        >
          <o.icon className="h-[17px] w-[17px]" />
        </button>
      ))}
    </div>
  );
}
