import { useMemo, useState } from 'react';
import { AnalyticsApi, ApplicationsApi, ExportLinks } from '@/api/endpoints';
import type { ApplicationOut, DashboardOut, FunnelOut, FunnelStatus } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AreaTrend, FunnelBars, SourceBars } from '@/components/charts';
import { APP_STATUS_META, FUNNEL_META } from '@/lib/status';
import { FUNNEL_OPTIONS } from '@/lib/constants';
import { formatDateTime, titleCase } from '@/lib/format';
import { IconAnalytics, IconDownload, IconExternal, IconSearch } from '@/components/icons';

const STATUS_FILTER = [
  { value: '', label: 'All statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'queued', label: 'Queued' },
  { value: 'filling', label: 'Filling' },
  { value: 'needs_human', label: 'Needs you' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

export function Analytics() {
  const toast = useToast();
  const dash = useApi<DashboardOut>(() => AnalyticsApi.dashboard(), []);
  const funnel = useApi<FunnelOut>(() => AnalyticsApi.funnel(), []);
  const apps = useApi<ApplicationOut[]>(() => ApplicationsApi.list(), []);

  const [statusFilter, setStatusFilter] = useState('');
  const [funnelFilter, setFunnelFilter] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const rows = apps.data ?? [];
    const query = q.trim().toLowerCase();
    return rows.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (funnelFilter && (a.funnel_status || '') !== funnelFilter) return false;
      if (query && !`${a.job_title} ${a.job_company} ${a.job_source}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [apps.data, statusFilter, funnelFilter, q]);

  const updateFunnel = async (id: string, value: FunnelStatus) => {
    const prev = apps.data;
    apps.setData((rows) => (rows ?? []).map((a) => (a.id === id ? { ...a, funnel_status: value } : a)));
    try {
      await ApplicationsApi.setFunnel(id, value);
      void funnel.reload();
    } catch (err) {
      apps.setData(prev ?? []);
      toast.error('Could not update status', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Track output, sources, and your funnel over time."
        actions={
          <a href={ExportLinks.applicationsCsv} download>
            <Button variant="secondary" leftIcon={<IconDownload className="h-4 w-4" />}>
              Export applications
            </Button>
          </a>
        }
      />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Applications over time" subtitle="Submitted in the last 30 days" />
          <CardBody>
            {dash.loading ? <Skeleton className="h-[240px] w-full" /> : <AreaTrend data={dash.data?.applications_over_time ?? []} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Funnel" subtitle="Where applications stand" />
          <CardBody>
            {funnel.loading ? <Skeleton className="h-[260px] w-full" /> : <FunnelBars stages={funnel.data?.stages ?? []} />}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Applications by source" />
          <CardBody>
            {dash.loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (dash.data?.per_source.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No data yet.</p>
            ) : (
              <SourceBars data={dash.data?.per_source ?? []} height={220} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Results per search" />
          <CardBody>
            {dash.loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (dash.data?.per_search.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No searches yet.</p>
            ) : (
              <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {dash.data?.per_search.map((s) => {
                  const max = Math.max(1, ...(dash.data?.per_search.map((x) => x.found) ?? [1]));
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-[13px]">{titleCase(s.keywords) || 'All roles'}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--surface-2))]">
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${(s.found / max) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[12.5px] font-medium tabular-nums">{s.found}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Application log */}
      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Application log"
          subtitle="Update funnel status as you hear back"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                <Input className="h-9 w-40 pl-8 text-[13px]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
              </div>
              <Select className="h-9 w-auto text-[13px]" options={STATUS_FILTER} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" />
              <Select className="h-9 w-auto text-[13px]" options={[{ value: '', label: 'All funnel' }, ...FUNNEL_OPTIONS.slice(1)]} value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)} aria-label="Filter by funnel" />
            </div>
          }
        />
        <CardBody className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-y border-[rgb(var(--border))] text-left text-[12px] text-subtle">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Funnel</th>
                  <th className="px-4 py-2.5 text-right font-medium">Proof</th>
                </tr>
              </thead>
              <tbody>
                {apps.loading ? (
                  <tr>
                    <td colSpan={7} className="p-4">
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={<IconAnalytics className="h-6 w-6" />}
                        title={(apps.data?.length ?? 0) === 0 ? 'No applications yet' : 'No matches'}
                        description={(apps.data?.length ?? 0) === 0 ? 'Applications appear here once you start applying.' : 'Try different filters.'}
                        className="border-0"
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => {
                    const meta = APP_STATUS_META[a.status] ?? APP_STATUS_META.queued;
                    return (
                      <tr key={a.id} className="border-b border-[rgb(var(--border))] last:border-0 hover:bg-[rgb(var(--surface-2))]">
                        <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-muted">
                          {formatDateTime(a.submitted_at || a.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="truncate font-medium">{a.job_title || '—'}</p>
                          <p className="truncate text-[12px] text-subtle">{a.job_company}</p>
                        </td>
                        <td className="px-4 py-3 text-muted">{titleCase(a.job_source) || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-muted">
                          {a.mode}/{a.executor}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            className="h-8 w-auto min-w-[130px] text-[12.5px]"
                            options={FUNNEL_OPTIONS}
                            value={a.funnel_status || ''}
                            onChange={(e) => void updateFunnel(a.id, e.target.value as FunnelStatus)}
                            aria-label="Funnel status"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a.confirmation_screenshot ? (
                            <a
                              href={a.confirmation_screenshot}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-600 hover:underline dark:text-accent-300"
                            >
                              View <IconExternal className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <p className="mt-3 text-center text-[12px] text-subtle">
        Funnel legend:{' '}
        {Object.entries(FUNNEL_META)
          .filter(([k]) => k)
          .map(([, v]) => v.label)
          .join(' · ')}
      </p>
    </div>
  );
}
