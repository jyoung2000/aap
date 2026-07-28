import { useState } from 'react';
import { ApplicationsApi } from '@/api/endpoints';
import type { ApplyMode, Executor, ApplicationOut } from '@/api/types';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';

const MODES: { value: ApplyMode; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', desc: 'Fill and submit automatically' },
  { value: 'reviewed', label: 'Reviewed', desc: 'Pause for your review before submit' },
  { value: 'manual', label: 'Manual', desc: 'Prepare fields, you click submit' },
];

const EXECUTORS: { value: Executor; label: string; desc: string }[] = [
  { value: 'extension', label: 'Browser extension', desc: 'Applies on any site in your browser' },
  { value: 'playwright', label: 'Server (Playwright)', desc: 'Bot-friendly boards only' },
];

export function ApplyModal({
  open,
  onClose,
  jobIds,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  jobIds: string[];
  onApplied?: (apps: ApplicationOut[]) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<ApplyMode>('reviewed');
  const [executor, setExecutor] = useState<Executor>('extension');
  const [humanized, setHumanized] = useState(true);
  const [reviewFirst, setReviewFirst] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const count = jobIds.length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const apps = await ApplicationsApi.create({
        job_ids: jobIds,
        mode,
        executor,
        humanized,
        review_first: reviewFirst,
      });
      toast.success(
        `${apps.length} application${apps.length === 1 ? '' : 's'} queued`,
        'Track progress in the Apply Queue.',
      );
      onApplied?.(apps);
      onClose();
    } catch (err) {
      toast.error('Could not queue applications', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Apply to ${count} job${count === 1 ? '' : 's'}`}
      description="Choose how JobPilot should handle these applications."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Queue {count} application{count === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium">Mode</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  mode === m.value
                    ? 'border-accent-500 bg-accent-50 ring-2 ring-accent-500/20 dark:bg-accent-500/10'
                    : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]',
                )}
              >
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium">Executor</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXECUTORS.map((ex) => (
              <button
                key={ex.value}
                onClick={() => setExecutor(ex.value)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-all',
                  executor === ex.value
                    ? 'border-accent-500 bg-accent-50 ring-2 ring-accent-500/20 dark:bg-accent-500/10'
                    : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]',
                )}
              >
                <p className="text-sm font-semibold">{ex.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">{ex.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[rgb(var(--border))] p-3.5">
          <label className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Humanized input</p>
              <p className="text-[12px] text-muted">Type with natural timing to look human</p>
            </div>
            <Toggle checked={humanized} onChange={setHumanized} label="Humanized input" />
          </label>
          <div className="h-px bg-[rgb(var(--border))]" />
          <label className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Review first</p>
              <p className="text-[12px] text-muted">Preview filled fields before anything submits</p>
            </div>
            <Toggle checked={reviewFirst} onChange={setReviewFirst} label="Review first" />
          </label>
        </div>
      </div>
    </Modal>
  );
}
