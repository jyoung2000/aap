import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApplicationsApi, ExportLinks, JobsApi } from '@/api/endpoints';
import type { JobListItem, JobSort, SortOrder } from '@/api/types';
import { useToast } from '@/components/ui/Toast';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle, Checkbox } from '@/components/ui/Toggle';
import { Badge, MatchChip, SourceBadge } from '@/components/ui/Badge';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { JobDrawer } from '@/components/JobDrawer';
import { ApplyModal } from '@/components/ApplyModal';
import { SOURCE_GROUPS } from '@/lib/constants';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { IconChevronRight, IconDownload, IconJobs, IconRemote, IconSearch } from '@/components/icons';

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  ...SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => ({ value: s.id, label: s.label }))),
];
const MIN_MATCH_OPTIONS = [
  { value: '', label: 'Any match' },
  { value: '80', label: '80%+ match' },
  { value: '60', label: '60%+ match' },
  { value: '40', label: '40%+ match' },
];
const SORT_LABEL: Record<JobSort, string> = {
  match: 'Match',
  date: 'Posted',
  salary: 'Salary',
  company: 'Company',
  title: 'Title',
};
const LIMIT = 100;

export function Jobs() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const searchId = params.get('search_id') || '';

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [source, setSource] = useState('');
  const [minMatch, setMinMatch] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sort, setSort] = useState<JobSort>('match');
  const [order, setOrder] = useState<SortOrder>('desc');

  const [drawerJob, setDrawerJob] = useState<string | null>(null);
  const [applyIds, setApplyIds] = useState<string[] | null>(null);

  const reqId = useRef(0);

  const load = useMemo(
    () => async () => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const rows = await JobsApi.list({
          search_id: searchId || undefined,
          source: source || undefined,
          min_match: minMatch ? Number(minMatch) : undefined,
          q: q || undefined,
          remote_only: remoteOnly || undefined,
          sort,
          order,
          limit: LIMIT,
        });
        if (id === reqId.current) setJobs(rows);
      } catch (err) {
        if (id === reqId.current) setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [searchId, source, minMatch, q, remoteOnly, sort, order],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const debouncedSetQ = useDebouncedCallback((v: string) => setQ(v), 300);
  const onSearchInput = (v: string) => {
    setQInput(v);
    debouncedSetQ(v);
  };

  const toggleSort = (col: JobSort) => {
    if (sort === col) setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(col);
      setOrder(col === 'title' || col === 'company' ? 'asc' : 'desc');
    }
  };

  const allSelected = jobs.length > 0 && jobs.every((j) => selected.has(j.id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => {
    setSelected((prev) => {
      if (jobs.every((j) => prev.has(j.id))) {
        const next = new Set(prev);
        jobs.forEach((j) => next.delete(j.id));
        return next;
      }
      return new Set([...prev, ...jobs.map((j) => j.id)]);
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addToQueue = async (jobId: string) => {
    try {
      await ApplicationsApi.create({ job_ids: [jobId], mode: 'reviewed', executor: 'extension', review_first: true });
      toast.success('Added to queue', 'Review it in the Apply Queue.');
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, has_application: true } : j)));
      setDrawerJob(null);
    } catch (err) {
      toast.error('Could not add to queue', err instanceof Error ? err.message : undefined);
    }
  };

  const onApplied = (ids: string[]) => {
    setJobs((prev) => prev.map((j) => (ids.includes(j.id) ? { ...j, has_application: true } : j)));
    setSelected(new Set());
    setDrawerJob(null);
  };

  const clearSearchFilter = () => {
    const next = new URLSearchParams(params);
    next.delete('search_id');
    setParams(next);
  };

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Browse and act on matched roles."
        actions={
          <div className="flex items-center gap-2">
            <a href={ExportLinks.jobsCsv} download>
              <Button variant="secondary" size="sm" leftIcon={<IconDownload className="h-4 w-4" />}>
                CSV
              </Button>
            </a>
            <a href={ExportLinks.jobsJson} download>
              <Button variant="secondary" size="sm" leftIcon={<IconDownload className="h-4 w-4" />}>
                JSON
              </Button>
            </a>
          </div>
        }
      />

      {searchId && (
        <div className="mb-4 flex items-center gap-2">
          <Badge tone="accent">Filtered to one search</Badge>
          <button onClick={clearSearchFilter} className="text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-300">
            Clear
          </button>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              className="pl-9"
              placeholder="Search title or company"
              value={qInput}
              onChange={(e) => onSearchInput(e.target.value)}
              aria-label="Search jobs"
            />
          </div>
          <Select className="w-auto min-w-[140px]" options={SOURCE_OPTIONS} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" />
          <Select className="w-auto min-w-[130px]" options={MIN_MATCH_OPTIONS} value={minMatch} onChange={(e) => setMinMatch(e.target.value)} aria-label="Minimum match" />
          <label className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-[13px]">
            <Toggle checked={remoteOnly} onChange={setRemoteOnly} label="Remote only" />
            <span className="font-medium">Remote</span>
          </label>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] text-left text-[12px] text-subtle">
                <th className="w-10 px-3 py-2.5">
                  <Checkbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} aria-label="Select all" />
                </th>
                <SortHeader label="Role" col="title" sort={sort} order={order} onClick={toggleSort} />
                <SortHeader label="Salary" col="salary" sort={sort} order={order} onClick={toggleSort} className="hidden sm:table-cell" />
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Education</th>
                <SortHeader label="Posted" col="date" sort={sort} order={order} onClick={toggleSort} className="hidden md:table-cell" />
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Source</th>
                <SortHeader label="Match" col="match" sort={sort} order={order} onClick={toggleSort} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-3">
                    <SkeletonRows rows={8} />
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<IconJobs className="h-6 w-6" />}
                      title={error ? 'Could not load jobs' : 'No jobs found'}
                      description={error || 'Try adjusting your filters or run a new search.'}
                      className="border-0"
                    />
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => setDrawerJob(job.id)}
                    className={cn(
                      'group cursor-pointer border-b border-[rgb(var(--border))] transition-colors last:border-0 hover:bg-[rgb(var(--surface-2))]',
                      selected.has(job.id) && 'bg-accent-50/50 dark:bg-accent-500/[0.06]',
                    )}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(job.id)} onChange={() => toggleOne(job.id)} aria-label={`Select ${job.title}`} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{job.title}</p>
                          <p className="truncate text-[12.5px] text-muted">
                            {job.company}
                            {job.location ? ` · ${job.location}` : ''}
                          </p>
                        </div>
                        {job.remote && <IconRemote className="h-3.5 w-3.5 shrink-0 text-accent-500" />}
                        {job.has_application && (
                          <Badge tone="success" className="ml-auto shrink-0">
                            Applied
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-muted sm:table-cell">{job.salary_text || '—'}</td>
                    <td className="hidden px-3 py-3 text-muted lg:table-cell">{job.education_level || '—'}</td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted md:table-cell">
                      {job.post_date ? relativeTime(job.post_date) || job.post_date : '—'}
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <SourceBadge source={job.source} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <MatchChip score={job.match_score} />
                        <IconChevronRight className="h-4 w-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && jobs.length >= LIMIT && (
          <p className="border-t border-[rgb(var(--border))] px-3 py-2 text-center text-[12px] text-subtle">
            Showing the first {LIMIT} results — refine filters to narrow down.
          </p>
        )}
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-64">
          <div className="pointer-events-auto flex animate-fade-in-up items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--bg-elevated))] p-2 pl-4 shadow-elevated">
            <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-[13px] text-subtle hover:text-[rgb(var(--text))]">
              Clear
            </button>
            <Button size="sm" onClick={() => setApplyIds([...selected])}>
              Auto apply to selected
            </Button>
          </div>
        </div>
      )}

      <JobDrawer
        jobId={drawerJob}
        open={drawerJob !== null}
        onClose={() => setDrawerJob(null)}
        onApplyNow={(id) => setApplyIds([id])}
        onAddToQueue={addToQueue}
      />

      <ApplyModal
        open={applyIds !== null}
        onClose={() => setApplyIds(null)}
        jobIds={applyIds ?? []}
        onApplied={(apps) => onApplied(apps.map((a) => a.job_id))}
      />
    </div>
  );
}

function SortHeader({
  label,
  col,
  sort,
  order,
  onClick,
  className,
}: {
  label: string;
  col: JobSort;
  sort: JobSort;
  order: SortOrder;
  onClick: (c: JobSort) => void;
  className?: string;
}) {
  const active = sort === col;
  return (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button
        onClick={() => onClick(col)}
        className={cn('inline-flex items-center gap-1 transition-colors hover:text-[rgb(var(--text))]', active && 'text-accent-600 dark:text-accent-300')}
        aria-label={`Sort by ${SORT_LABEL[col]}`}
      >
        {label}
        <span className={cn('text-[9px] transition-opacity', active ? 'opacity-100' : 'opacity-0')}>
          {order === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </th>
  );
}
