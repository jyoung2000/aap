import type { ReactNode } from 'react';
import { ThemeMenu } from '@/components/layout/ThemeMenu';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[rgb(var(--bg))] px-4 py-10">
      {/* Ambient gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-40"
        style={{
          background:
            'radial-gradient(60rem 40rem at 50% -10%, rgba(59,118,246,0.14), transparent 60%), radial-gradient(40rem 30rem at 90% 100%, rgba(37,99,235,0.10), transparent 60%)',
        }}
      />
      <div className="absolute right-4 top-4">
        <ThemeMenu />
      </div>
      <div className="relative w-full max-w-[400px] animate-fade-in-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-elevated">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M12 4l7 4v8l-7 4-7-4V8z" />
              <path d="M12 12l7-4M12 12v8M12 12L5 8" opacity="0.55" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tightest">JobPilot</h1>
          <p className="mt-1 text-sm text-muted">Self-hosted job search & auto-apply</p>
        </div>
        <div className="rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-elevated sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[Math.min(score, labels.length - 1)] };
}
