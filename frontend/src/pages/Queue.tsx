import { useCallback, useEffect, useRef, useState } from 'react';
import { ApplicationsApi, QueueApi } from '@/api/endpoints';
import type { ApplicationOut, InterventionOut, WsEvent } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { InterventionCard } from '@/components/InterventionCard';
import { APP_STATUS_META } from '@/lib/status';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { IconCheck, IconQueue, IconRetry, IconSkip } from '@/components/icons';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted shadow-soft">
      {children}
    </kbd>
  );
}

export function Queue() {
  const toast = useToast();
  const { send } = useSocket();

  const queue = useApi<InterventionOut[]>(() => QueueApi.list(), []);
  const apps = useApi<ApplicationOut[]>(() => ApplicationsApi.list(), []);

  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveKb, setSaveKb] = useState<Record<string, boolean>>({});
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const editRef = useRef<(() => void) | null>(null);

  const interventions = queue.data ?? [];

  // Keep activeIndex in range.
  useEffect(() => {
    if (activeIndex >= interventions.length) setActiveIndex(Math.max(0, interventions.length - 1));
  }, [interventions.length, activeIndex]);

  // ---- WebSocket wiring ----
  const reloadAll = useCallback(() => {
    void queue.reload();
    void apps.reload();
  }, [queue, apps]);

  useSocketEvent('intervention.new', reloadAll);
  useSocketEvent('intervention.answered', reloadAll);
  useSocketEvent('intervention.resolved', reloadAll);
  useSocketEvent('queue.updated', reloadAll);
  useSocketEvent('application.update', () => void apps.reload());
  useSocketEvent('screencast.frame', (e: WsEvent) => {
    const appId = String(e.application_id);
    const data = String(e.data || '');
    setFrames((prev) => ({ ...prev, [appId]: data }));
  });

  const setDraft = (id: string, value: string) => setDrafts((p) => ({ ...p, [id]: value }));
  const getSaveKb = (id: string) => saveKb[id] ?? true;

  const submitAnswer = useCallback(
    async (iv: InterventionOut) => {
      const answer = drafts[iv.id] ?? iv.answer ?? '';
      if (iv.kind !== 'confirm' && iv.kind !== 'captcha' && !answer.trim()) {
        toast.error('Enter an answer first');
        return;
      }
      setBusy(iv.id);
      try {
        await QueueApi.answer(iv.id, { answer, save_to_kb: getSaveKb(iv.id) });
        toast.success('Answer sent', getSaveKb(iv.id) ? 'Saved for future applications.' : undefined);
        queue.setData((prev) => (prev ?? []).filter((x) => x.id !== iv.id));
        void apps.reload();
      } catch (err) {
        toast.error('Could not send answer', err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [drafts, saveKb, queue, apps, toast],
  );

  const skipApplication = useCallback(
    async (appId: string) => {
      setBusy(appId);
      try {
        await ApplicationsApi.skip(appId);
        toast.info('Application skipped');
        reloadAll();
      } catch (err) {
        toast.error('Could not skip', err instanceof Error ? err.message : undefined);
      } finally {
        setBusy(null);
      }
    },
    [reloadAll, toast],
  );

  const retryApplication = async (appId: string) => {
    setBusy(appId);
    try {
      await ApplicationsApi.retry(appId);
      toast.success('Re-queued');
      void apps.reload();
    } catch (err) {
      toast.error('Could not retry', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const resumeCaptcha = (appId: string) => {
    send({ type: 'resume', application_id: appId });
    toast.info('Resuming', 'Told the executor to continue.');
  };

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          const iv = interventions[activeIndex];
          if (iv) void submitAnswer(iv);
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (interventions.length === 0) return;
      const iv = interventions[activeIndex];
      switch (e.key) {
        case 'j':
          e.preventDefault();
          setActiveIndex((i) => Math.min(interventions.length - 1, i + 1));
          break;
        case 'k':
          e.preventDefault();
          setActiveIndex((i) => Math.max(0, i - 1));
          break;
        case 'a':
          if (iv) {
            e.preventDefault();
            void submitAnswer(iv);
          }
          break;
        case 'e':
          if (iv) {
            e.preventDefault();
            editRef.current?.();
          }
          break;
        case 's':
          if (iv) {
            e.preventDefault();
            void skipApplication(iv.application_id);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interventions, activeIndex, submitAnswer, skipApplication]);

  const appList = apps.data ?? [];
  const activeApps = appList.filter((a) => ['queued', 'filling', 'needs_human'].includes(a.status));
  const doneApps = appList.filter((a) => !['queued', 'filling', 'needs_human'].includes(a.status));

  return (
    <div>
      <PageHeader
        title="Apply Queue"
        description="Respond to anything that needs you and watch applications progress live."
        actions={
          <div className="hidden items-center gap-1.5 text-[11.5px] text-subtle sm:flex" aria-label="Keyboard shortcuts">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd>
            <span>navigate</span>
            <Kbd>a</Kbd>
            <span>submit</span>
            <Kbd>e</Kbd>
            <span>edit</span>
            <Kbd>s</Kbd>
            <span>skip</span>
          </div>
        }
      />

      {/* Needs you */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-tightest">Needs you</h2>
          {interventions.length > 0 && <Badge tone="warning">{interventions.length}</Badge>}
        </div>

        {queue.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : interventions.length === 0 ? (
          <EmptyState
            icon={<IconCheck className="h-6 w-6" />}
            title="All clear"
            description="Nothing needs your input right now. New questions appear here in real time."
          />
        ) : (
          <div className="space-y-3">
            {interventions.map((iv, i) => (
              <InterventionCard
                key={iv.id}
                intervention={iv}
                active={i === activeIndex}
                index={i}
                draft={drafts[iv.id] ?? iv.answer ?? ''}
                saveToKb={getSaveKb(iv.id)}
                busy={busy === iv.id}
                frame={frames[iv.application_id]}
                onFocus={() => setActiveIndex(i)}
                onDraftChange={(v) => setDraft(iv.id, v)}
                onSaveKbChange={(v) => setSaveKb((p) => ({ ...p, [iv.id]: v }))}
                onSubmit={() => submitAnswer(iv)}
                onSkip={() => skipApplication(iv.application_id)}
                onResume={() => resumeCaptcha(iv.application_id)}
                registerEdit={(fn) => {
                  if (i === activeIndex) editRef.current = fn;
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Applications */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tightest">Applications</h2>
        {apps.loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : appList.length === 0 ? (
          <EmptyState
            icon={<IconQueue className="h-6 w-6" />}
            title="No applications yet"
            description="Queue applications from the Jobs page to see them here."
          />
        ) : (
          <div className="space-y-4">
            {activeApps.length > 0 && (
              <Card className="divide-y divide-[rgb(var(--border))]">
                {activeApps.map((a) => (
                  <ApplicationRow key={a.id} app={a} busy={busy === a.id} onRetry={retryApplication} onSkip={skipApplication} />
                ))}
              </Card>
            )}
            {doneApps.length > 0 && (
              <div>
                <p className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-subtle">History</p>
                <Card className="divide-y divide-[rgb(var(--border))]">
                  {doneApps.map((a) => (
                    <ApplicationRow key={a.id} app={a} busy={busy === a.id} onRetry={retryApplication} onSkip={skipApplication} />
                  ))}
                </Card>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ApplicationRow({
  app,
  busy,
  onRetry,
  onSkip,
}: {
  app: ApplicationOut;
  busy: boolean;
  onRetry: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const meta = APP_STATUS_META[app.status] ?? APP_STATUS_META.queued;
  const canRetry = app.status === 'failed' || app.status === 'skipped';
  const canSkip = ['queued', 'filling', 'needs_human'].includes(app.status);
  return (
    <div className="flex items-center gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{app.job_title || 'Application'}</p>
        <p className="truncate text-[12.5px] text-muted">
          {app.job_company}
          {app.job_source ? ` · ${app.job_source}` : ''} · {app.mode}/{app.executor} · {relativeTime(app.updated_at)}
        </p>
        {app.error && <p className="mt-1 truncate text-[12px] text-danger">{app.error}</p>}
      </div>
      {app.open_interventions > 0 && <Badge tone="warning">{app.open_interventions} open</Badge>}
      <Badge tone={meta.tone} dot={app.status === 'filling'}>
        {meta.label}
      </Badge>
      <div className="flex items-center gap-1">
        {canRetry && (
          <Button variant="ghost" size="icon" aria-label="Retry" disabled={busy} onClick={() => onRetry(app.id)}>
            <IconRetry className="h-4 w-4" />
          </Button>
        )}
        {canSkip && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Skip"
            disabled={busy}
            onClick={() => onSkip(app.id)}
            className={cn('text-subtle hover:text-danger')}
          >
            <IconSkip className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
