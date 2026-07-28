import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnalyticsApi, ExtensionApi, ProfileApi, SearchApi } from '@/api/endpoints';
import type { DashboardCards, DashboardOut } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useSocketEvent } from '@/hooks/useSocket';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCards } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AreaTrend, SourceBars } from '@/components/charts';
import { titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  IconBolt,
  IconCheck,
  IconChevronRight,
  IconExtension,
  IconFile,
  IconProfile,
  IconSearch,
} from '@/components/icons';

interface Metric {
  key: keyof DashboardCards;
  label: string;
  tone: string;
  icon: (p: { className?: string }) => JSX.Element;
}

const METRICS: Metric[] = [
  { key: 'found_today', label: 'Found today', tone: 'text-accent-600 dark:text-accent-300', icon: IconSearch },
  { key: 'applied_this_week', label: 'Applied this week', tone: 'text-accent-600 dark:text-accent-300', icon: IconBolt },
  { key: 'responses', label: 'Responses', tone: 'text-violet-600 dark:text-violet-300', icon: IconProfile },
  { key: 'interviews', label: 'Interviews', tone: 'text-emerald-600 dark:text-emerald-300', icon: IconCheck },
  { key: 'offers', label: 'Offers', tone: 'text-emerald-600 dark:text-emerald-300', icon: IconCheck },
  { key: 'pending_interventions', label: 'Needs you', tone: 'text-amber-600 dark:text-amber-300', icon: IconExtension },
];

function MetricCard({ metric, value }: { metric: Metric; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-muted">{metric.label}</span>
        <metric.icon className={cn('h-4 w-4', metric.tone)} />
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tightest tabular-nums">{value}</p>
    </Card>
  );
}

interface OnboardingData {
  dashboard: DashboardOut;
  profileFilled: boolean;
  hasResume: boolean;
  hasDevice: boolean;
  hasSearch: boolean;
}

export function Dashboard() {
  const { user, updateSettings } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const state = useApi<OnboardingData>(async () => {
    const [dashboard, profile, files, devices, searches] = await Promise.all([
      AnalyticsApi.dashboard(),
      ProfileApi.get().catch(() => null),
      ProfileApi.listFiles().catch(() => []),
      ExtensionApi.devices().catch(() => []),
      SearchApi.list().catch(() => []),
    ]);
    return {
      dashboard,
      profileFilled: Boolean(profile && profile.first_name && profile.last_name),
      hasResume: files.some((f) => f.kind === 'resume'),
      hasDevice: devices.some((d) => !d.revoked),
      hasSearch: searches.length > 0,
    };
  }, []);

  useSocketEvent('application.update', () => state.reload());
  useSocketEvent('search.done', () => state.reload());

  const steps = useMemo(() => {
    const d = state.data;
    return [
      { done: d?.profileFilled ?? false, label: 'Create your profile', desc: 'Add your name and contact details', to: '/profile', icon: IconProfile },
      { done: d?.hasResume ?? false, label: 'Upload your resume', desc: 'We parse it to fill applications', to: '/profile?tab=files', icon: IconFile },
      { done: d?.hasDevice ?? false, label: 'Pair the browser extension', desc: 'Enables auto-apply on any site', to: '/settings#extension', icon: IconExtension },
      { done: d?.hasSearch ?? false, label: 'Run your first search', desc: 'Find matching roles across sources', to: '/search', icon: IconSearch },
    ];
  }, [state.data]);

  const completed = steps.filter((s) => s.done).length;
  const showOnboarding = user && !user.onboarding_done && !dismissed;

  const finishOnboarding = () => {
    setDismissed(true);
    void updateSettings({ onboarding_done: true }).catch(() => undefined);
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your job search at a glance."
        actions={
          <Link to="/search">
            <Button leftIcon={<IconSearch className="h-4 w-4" />}>New search</Button>
          </Link>
        }
      />

      {showOnboarding && (
        <Card className="mb-6 overflow-hidden animate-fade-in-up">
          <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tightest">Get set up</h3>
              <p className="mt-0.5 text-[13px] text-muted">
                {completed} of {steps.length} steps complete — finish to unlock the full workflow.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[rgb(var(--surface-2))]">
                <div
                  className="h-full rounded-full bg-accent-600 transition-[width] duration-500 ease-spring"
                  style={{ width: `${(completed / steps.length) * 100}%` }}
                />
              </div>
              <button onClick={finishOnboarding} className="text-[12.5px] font-medium text-subtle hover:text-[rgb(var(--text))]">
                {completed === steps.length ? 'Finish' : 'Dismiss'}
              </button>
            </div>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {steps.map((step) => (
              <Link
                key={step.label}
                to={step.to}
                className={cn(
                  'group flex items-center gap-3 rounded-xl p-3 transition-colors',
                  step.done ? 'opacity-70' : 'hover:bg-[rgb(var(--surface-2))]',
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors',
                    step.done ? 'bg-success text-white' : 'bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-300',
                  )}
                >
                  {step.done ? <IconCheck className="h-[18px] w-[18px]" /> : <step.icon className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', step.done && 'line-through decoration-[rgb(var(--border-strong))]')}>
                    {step.label}
                  </p>
                  <p className="truncate text-[12px] text-subtle">{step.desc}</p>
                </div>
                {!step.done && <IconChevronRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5" />}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Metric cards */}
      {state.loading ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {METRICS.map((m) => (
            <MetricCard key={m.key} metric={m} value={state.data?.dashboard.cards[m.key] ?? 0} />
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Applications over time" subtitle="Submitted in the last 30 days" />
          <CardBody>
            {state.loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <AreaTrend data={state.data?.dashboard.applications_over_time ?? []} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Jobs by source" />
          <CardBody>
            {state.loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (state.data?.dashboard.per_source.length ?? 0) === 0 ? (
              <EmptyState
                title="No jobs yet"
                description="Run a search to populate your pipeline."
                action={
                  <Link to="/search">
                    <Button size="sm">Start a search</Button>
                  </Link>
                }
                className="border-0 py-8"
              />
            ) : (
              <SourceBars data={state.data?.dashboard.per_source ?? []} />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Per-search breakdown */}
      <Card className="mt-4">
        <CardHeader
          title="Recent searches"
          subtitle="Results found per saved search"
          action={
            <Link to="/search" className="text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-300">
              View all
            </Link>
          }
        />
        <CardBody>
          {state.loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (state.data?.dashboard.per_search.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No searches yet.</p>
          ) : (
            <div className="divide-y divide-[rgb(var(--border))]">
              {state.data?.dashboard.per_search.map((s) => (
                <Link
                  key={s.id}
                  to={`/jobs?search_id=${s.id}`}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{titleCase(s.keywords) || 'All roles'}</p>
                    {s.location && <p className="truncate text-[12px] text-subtle">{s.location}</p>}
                  </div>
                  <span className="tabular-nums text-sm font-semibold">{s.found}</span>
                  <span className="text-[12px] text-subtle">jobs</span>
                  <IconChevronRight className="h-4 w-4 text-subtle" />
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {state.error && !state.loading && <p className="mt-4 text-center text-sm text-danger">{state.error}</p>}
    </div>
  );
}
