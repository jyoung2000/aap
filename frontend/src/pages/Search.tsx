import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchApi } from '@/api/endpoints';
import type { SearchOut, WsEvent } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useSocketEvent } from '@/hooks/useSocket';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle, Checkbox } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SEARCH_STATUS_META } from '@/lib/status';
import { EDUCATION_LEVELS, POSTED_WITHIN, SOURCE_GROUPS } from '@/lib/constants';
import { relativeTime, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import { IconChevronRight, IconSearch } from '@/components/icons';

interface LiveState {
  progress: number;
  message: string;
  status?: SearchOut['status'];
  found?: number;
  new?: number;
}

export function SearchPage() {
  const toast = useToast();
  const searches = useApi<SearchOut[]>(() => SearchApi.list(), []);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  // Form state
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [salaryFloor, setSalaryFloor] = useState('');
  const [education, setEducation] = useState('');
  const [postedWithin, setPostedWithin] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useSocketEvent('search.progress', (e: WsEvent) => {
    const id = String(e.search_id);
    setLive((prev) => ({
      ...prev,
      [id]: { ...prev[id], progress: Number(e.progress) || 0, message: String(e.message || ''), status: 'running' },
    }));
  });
  useSocketEvent('search.done', (e: WsEvent) => {
    const id = String(e.search_id);
    setLive((prev) => ({
      ...prev,
      [id]: { ...prev[id], progress: 1, message: 'Complete', status: 'done', found: Number(e.found), new: Number(e.new) },
    }));
    void searches.reload();
  });
  useSocketEvent('search.failed', (e: WsEvent) => {
    const id = String(e.search_id);
    setLive((prev) => ({
      ...prev,
      [id]: { ...prev[id], progress: 1, message: String(e.error || 'Search failed'), status: 'failed' },
    }));
    void searches.reload();
  });

  const toggleSource = (id: string) => {
    setSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };
  const toggleGroup = (ids: string[], allOn: boolean) => {
    setSources((prev) => (allOn ? prev.filter((s) => !ids.includes(s)) : Array.from(new Set([...prev, ...ids]))));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await SearchApi.create({
        keywords: keywords.trim(),
        location: location.trim(),
        remote_only: remoteOnly,
        salary_floor: salaryFloor ? Number(salaryFloor) : null,
        education_level: education,
        posted_within_days: postedWithin ? Number(postedWithin) : null,
        sources,
      });
      setLive((prev) => ({ ...prev, [created.id]: { progress: 0, message: 'Queued…', status: 'queued' } }));
      searches.setData((prev) => [created, ...(prev ?? [])]);
      toast.success('Search started', 'Live results will stream in below.');
    } catch (err) {
      toast.error('Could not start search', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const list = searches.data ?? [];

  return (
    <div>
      <PageHeader title="Search" description="Discover roles across ATS boards, aggregators, and company pages." />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Form */}
        <Card className="lg:col-span-3">
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Keywords">
                  {(id) => (
                    <Input
                      id={id}
                      autoFocus
                      placeholder="e.g. Senior Frontend Engineer"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Location">
                  {(id) => (
                    <Input
                      id={id}
                      placeholder="e.g. San Francisco or Remote"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Min salary" hint="/yr">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      placeholder="120000"
                      value={salaryFloor}
                      onChange={(e) => setSalaryFloor(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Education">
                  {(id) => (
                    <Select id={id} options={EDUCATION_LEVELS} value={education} onChange={(e) => setEducation(e.target.value)} />
                  )}
                </Field>
                <Field label="Posted within">
                  {(id) => (
                    <Select id={id} options={POSTED_WITHIN} value={postedWithin} onChange={(e) => setPostedWithin(e.target.value)} />
                  )}
                </Field>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3.5 py-2.5">
                <Toggle checked={remoteOnly} onChange={setRemoteOnly} label="Remote only" />
                <span className="text-sm font-medium">Remote only</span>
              </label>

              {/* Sources */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium">Sources</span>
                  <span className="text-[12px] text-subtle">
                    {sources.length === 0 ? 'All sources' : `${sources.length} selected`}
                  </span>
                </div>
                <div className="space-y-3 rounded-xl border border-[rgb(var(--border))] p-3">
                  {SOURCE_GROUPS.map((group) => {
                    const ids = group.sources.map((s) => s.id);
                    const allOn = ids.every((i) => sources.includes(i));
                    return (
                      <div key={group.label}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(ids, allOn)}
                          className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle hover:text-accent-600"
                        >
                          {group.label} · {allOn ? 'clear' : 'all'}
                        </button>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {group.sources.map((s) => (
                            <button
                              type="button"
                              key={s.id}
                              onClick={() => toggleSource(s.id)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors',
                                sources.includes(s.id)
                                  ? 'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200'
                                  : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]',
                              )}
                            >
                              <Checkbox checked={sources.includes(s.id)} onChange={() => toggleSource(s.id)} aria-label={s.label} />
                              <span className="truncate">{s.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {sources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSources([])}
                      className="text-[12px] font-medium text-accent-600 hover:underline"
                    >
                      Reset to all sources
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[12px] text-subtle">Selecting no sources searches everything.</p>
                <Button type="submit" loading={submitting} leftIcon={<IconSearch className="h-4 w-4" />}>
                  Run search
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Recent searches */}
        <Card className="lg:col-span-2">
          <CardHeader title="Recent searches" subtitle="Live progress streams here" />
          <CardBody className="pt-0">
            {searches.loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState title="No searches yet" description="Run your first search to see results here." className="border-0 py-8" />
            ) : (
              <div className="space-y-2">
                {list.map((s) => (
                  <SearchRow key={s.id} search={s} live={live[s.id]} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SearchRow({ search, live }: { search: SearchOut; live?: LiveState }) {
  const status = live?.status ?? search.status;
  const progress = live?.progress ?? search.progress;
  const meta = SEARCH_STATUS_META[status] ?? SEARCH_STATUS_META.queued;
  const running = status === 'running' || status === 'queued';
  const found = live?.found ?? search.found_count;
  const newCount = live?.new ?? search.new_count;

  const breakdown = useMemo(
    () => Object.entries(search.source_breakdown || {}).filter(([, v]) => v > 0),
    [search.source_breakdown],
  );

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{titleCase(search.keywords) || 'All roles'}</p>
          <p className="truncate text-[12px] text-subtle">
            {search.location || 'Any location'}
            {search.remote_only ? ' · Remote' : ''} · {relativeTime(search.created_at)}
          </p>
        </div>
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
      </div>

      {running ? (
        <div className="mt-2.5">
          <ProgressBar value={status === 'queued' ? undefined : progress} />
          <p className="mt-1.5 truncate text-[12px] text-muted">{live?.message || search.message || 'Waiting…'}</p>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="font-semibold tabular-nums">{found}</span>
            <span className="text-subtle">found</span>
            {newCount > 0 && (
              <Badge tone="accent" className="ml-1">
                +{newCount} new
              </Badge>
            )}
          </div>
          {status === 'done' && (
            <Link
              to={`/jobs?search_id=${search.id}`}
              className="flex items-center gap-1 text-[12.5px] font-medium text-accent-600 hover:underline dark:text-accent-300"
            >
              View jobs <IconChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {status === 'failed' && search.error && <p className="mt-1.5 text-[12px] text-danger">{search.error}</p>}

      {!running && breakdown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {breakdown.slice(0, 6).map(([src, count]) => (
            <span key={src} className="rounded-md bg-[rgb(var(--surface-2))] px-1.5 py-0.5 text-[11px] text-muted">
              {titleCase(src)} {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
