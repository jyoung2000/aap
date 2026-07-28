import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ExtensionApi, QueueApi } from '@/api/endpoints';
import { initials } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ThemeMenu } from './ThemeMenu';
import {
  IconAnalytics,
  IconDashboard,
  IconExtension,
  IconJobs,
  IconMenu,
  IconProfile,
  IconQueue,
  IconSearch,
  IconSettings,
  IconSignOut,
} from '@/components/icons';

interface NavEntry {
  to: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  badge?: number;
}

function useNav(pending: number): NavEntry[] {
  return [
    { to: '/', label: 'Dashboard', icon: IconDashboard },
    { to: '/search', label: 'Search', icon: IconSearch },
    { to: '/jobs', label: 'Jobs', icon: IconJobs },
    { to: '/queue', label: 'Apply Queue', icon: IconQueue, badge: pending },
    { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
    { to: '/profile', label: 'Profile', icon: IconProfile },
    { to: '/settings', label: 'Settings', icon: IconSettings },
  ];
}

function ExtStatus({ online }: { online: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
      <IconExtension className="h-4 w-4 text-muted" />
      <span className="text-[12.5px] font-medium">Extension</span>
      <span className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            online ? 'bg-success animate-pulse-dot' : 'bg-[rgb(var(--border-strong))]',
          )}
        />
        <span className={cn('text-[11.5px]', online ? 'text-success' : 'text-subtle')}>
          {online ? 'Linked' : 'Offline'}
        </span>
      </span>
    </div>
  );
}

function NavItems({ entries, onNavigate }: { entries: NavEntry[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {entries.map((e) => (
        <NavLink
          key={e.to}
          to={e.to}
          end={e.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150',
              isActive
                ? 'bg-accent-600 text-white shadow-soft'
                : 'text-muted hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]',
            )
          }
        >
          {({ isActive }) => (
            <>
              <e.icon className={cn('h-[18px] w-[18px]', isActive ? 'text-white' : 'text-subtle group-hover:text-[rgb(var(--text))]')} />
              <span className="flex-1">{e.label}</span>
              {e.badge ? (
                <span
                  className={cn(
                    'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    isActive ? 'bg-white/25 text-white' : 'bg-warning/15 text-warning',
                  )}
                >
                  {e.badge}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-soft">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 4l7 4v8l-7 4-7-4V8z" />
          <path d="M12 12l7-4M12 12v8M12 12L5 8" opacity="0.55" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-tightest">JobPilot</span>
    </div>
  );
}

export function AppShell() {
  const { user, signout } = useAuth();
  const { extOnline } = useSocket();
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [recentDevice, setRecentDevice] = useState(false);
  const location = useLocation();

  const refreshPending = useCallback(async () => {
    try {
      const q = await QueueApi.list();
      setPending(q.length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  // Initial extension-online heuristic from devices' last_seen.
  useEffect(() => {
    ExtensionApi.devices()
      .then((devices) => {
        const recent = devices.some(
          (d) => !d.revoked && d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 120000,
        );
        setRecentDevice(recent);
      })
      .catch(() => undefined);
  }, []);

  useSocketEvent('queue.updated', refreshPending);
  useSocketEvent('intervention.new', () => setPending((p) => p + 1));
  useSocketEvent('intervention.resolved', refreshPending);
  useSocketEvent('intervention.answered', refreshPending);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const entries = useNav(pending);
  const linked = extOnline || recentDevice;

  const sidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="px-2 pt-1">
        <Brand />
      </div>
      <NavItems entries={entries} onNavigate={onNavigate} />
      <div className="mt-auto space-y-3">
        {!isMobile && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-medium text-subtle">Appearance</span>
            <ThemeMenu />
          </div>
        )}
        <ExtStatus online={linked} />
        <div className="flex items-center gap-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-600 text-[12px] font-semibold text-white">
            {user ? initials(user.email) : '··'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium">{user?.email}</p>
          </div>
          <button
            onClick={() => void signout()}
            aria-label="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-danger"
          >
            <IconSignOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--bg))]">
      {/* Desktop sidebar */}
      {!isMobile && (
        <aside className="glass fixed inset-y-0 left-0 z-30 w-64 border-r border-[rgb(var(--border))]">
          {sidebarContent()}
        </aside>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
          <Brand />
          <div className="flex items-center gap-1.5">
            <ThemeMenu compact />
            <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
              <IconMenu className="h-5 w-5" />
            </Button>
          </div>
        </header>
      )}

      {/* Mobile drawer */}
      {isMobile && drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="glass absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-right border-r border-[rgb(var(--border))]">
            {sidebarContent(() => setDrawerOpen(false))}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className={cn(!isMobile && 'pl-64')}>
        <main className={cn('mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8', isMobile && 'pb-24')}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom bar */}
      {isMobile && (
        <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[rgb(var(--border))] px-1 pt-1.5">
          {entries.slice(0, 5).map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              end={e.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10.5px] font-medium transition-colors',
                  isActive ? 'text-accent-600 dark:text-accent-300' : 'text-subtle',
                )
              }
            >
              <e.icon className="h-[22px] w-[22px]" />
              <span>{e.label === 'Apply Queue' ? 'Queue' : e.label}</span>
              {e.badge ? (
                <span className="absolute right-3 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[9px] font-bold text-white">
                  {e.badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
