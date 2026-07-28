import { useEffect, useState } from 'react';
import { JobsApi } from '@/api/endpoints';
import type { JobOut } from '@/api/types';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Badge, MatchChip, SourceBadge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';
import { IconBolt, IconClose, IconExternal, IconQueue, IconRemote } from '@/components/icons';

export function JobDrawer({
  jobId,
  open,
  onClose,
  onApplyNow,
  onAddToQueue,
}: {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  onApplyNow: (jobId: string) => void;
  onAddToQueue: (jobId: string) => void;
}) {
  const [job, setJob] = useState<JobOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);
    setShowFull(false);
    setJob(null);
    let active = true;
    JobsApi.get(jobId)
      .then((j) => active && setJob(j))
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [jobId, open]);

  return (
    <Drawer open={open} onClose={onClose} title={job?.title || 'Job details'}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] p-5">
        <div className="min-w-0">
          {loading || !job ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold leading-tight tracking-tightest">{job.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {job.company}
                {job.location ? ` · ${job.location}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SourceBadge source={job.source} />
                {job.remote && (
                  <Badge tone="accent">
                    <IconRemote className="h-3 w-3" /> Remote
                  </Badge>
                )}
                {job.match_score !== null && (
                  <span className="flex items-center gap-1 text-[12.5px] text-muted">
                    Match <MatchChip score={job.match_score} />
                  </span>
                )}
                {job.education_level && <Badge tone="neutral">{job.education_level}</Badge>}
              </div>
            </>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <IconClose className="h-5 w-5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading || !job ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {(job.salary_text || job.salary_min) && (
              <div className="flex flex-wrap gap-4 rounded-xl bg-[rgb(var(--surface-2))] p-3.5 text-sm">
                <div>
                  <p className="text-[11.5px] uppercase tracking-wide text-subtle">Salary</p>
                  <p className="mt-0.5 font-medium">{job.salary_text || '—'}</p>
                </div>
                {job.post_date && (
                  <div>
                    <p className="text-[11.5px] uppercase tracking-wide text-subtle">Posted</p>
                    <p className="mt-0.5 font-medium">{formatDate(job.post_date) || job.post_date}</p>
                  </div>
                )}
              </div>
            )}

            {job.summary && (
              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-subtle">Summary</h3>
                <p className="text-sm leading-relaxed">{job.summary}</p>
              </section>
            )}

            {job.requirements?.length > 0 && (
              <section>
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">Key requirements</h3>
                <ul className="space-y-1.5">
                  {job.requirements.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {job.match_rationale && (
              <section className="rounded-xl border border-accent-100 bg-accent-50/60 p-3.5 dark:border-accent-500/20 dark:bg-accent-500/10">
                <h3 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-accent-700 dark:text-accent-300">
                  <IconBolt className="h-3.5 w-3.5" /> Why this matches
                </h3>
                <p className="text-sm leading-relaxed text-accent-900/90 dark:text-accent-100/90">{job.match_rationale}</p>
              </section>
            )}

            {job.description && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">Description</h3>
                  <button
                    onClick={() => setShowFull((v) => !v)}
                    className="text-[12.5px] font-medium text-accent-600 hover:underline dark:text-accent-300"
                  >
                    {showFull ? 'Show less' : 'Show full'}
                  </button>
                </div>
                <p className={`whitespace-pre-wrap text-sm leading-relaxed text-muted ${showFull ? '' : 'line-clamp-6'}`}>
                  {job.description}
                </p>
              </section>
            )}

            {(job.canonical_url || job.apply_url) && (
              <a
                href={job.apply_url || job.canonical_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-300"
              >
                View original posting <IconExternal className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-[rgb(var(--border))] p-4">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={!job}
          onClick={() => job && onAddToQueue(job.id)}
          leftIcon={<IconQueue className="h-4 w-4" />}
        >
          Add to queue
        </Button>
        <Button className="flex-1" disabled={!job} onClick={() => job && onApplyNow(job.id)} leftIcon={<IconBolt className="h-4 w-4" />}>
          Apply now
        </Button>
      </div>
    </Drawer>
  );
}
