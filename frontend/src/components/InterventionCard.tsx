import { useEffect, useRef } from 'react';
import type { InterventionOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { IconBolt, IconSkip } from '@/components/icons';

const KIND_META: Record<string, { label: string; tone: 'accent' | 'warning' | 'danger' | 'purple' }> = {
  field: { label: 'Question', tone: 'accent' },
  captcha: { label: 'CAPTCHA', tone: 'warning' },
  login: { label: 'Login', tone: 'purple' },
  confirm: { label: 'Confirm', tone: 'accent' },
};

/** Normalize a screenshot/frame value into a usable <img> src. */
function imgSrc(value: string): string {
  if (!value) return '';
  if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) return value;
  return `data:image/jpeg;base64,${value}`;
}

const LONG_TYPES = new Set(['textarea', 'paragraph', 'long', 'longtext', 'multiline']);

export function InterventionCard({
  intervention: iv,
  active,
  index,
  draft,
  saveToKb,
  busy,
  frame,
  onFocus,
  onDraftChange,
  onSaveKbChange,
  onSubmit,
  onSkip,
  onResume,
  onInput,
  onScreencast,
  registerEdit,
}: {
  intervention: InterventionOut;
  active: boolean;
  index: number;
  draft: string;
  saveToKb: boolean;
  busy: boolean;
  frame?: string;
  onFocus: () => void;
  onDraftChange: (v: string) => void;
  onSaveKbChange: (v: boolean) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onResume: () => void;
  onInput: (event: Record<string, unknown>) => void;
  onScreencast: (action: 'start' | 'stop') => void;
  registerEdit: (fn: () => void) => void;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const kind = KIND_META[iv.kind] ?? KIND_META.field;
  const isCaptcha = iv.kind === 'captcha';

  // Let the parent's "e" shortcut focus this card's input when active.
  useEffect(() => {
    if (active) registerEdit(() => inputRef.current?.focus());
  }, [active, registerEdit]);

  useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  // Ask the executor to begin/stop streaming the blocked tab while a CAPTCHA is shown.
  const screencastRef = useRef(onScreencast);
  screencastRef.current = onScreencast;
  useEffect(() => {
    if (!isCaptcha) return;
    screencastRef.current('start');
    return () => screencastRef.current('stop');
  }, [isCaptcha]);

  const moveThrottle = useRef(0);
  const forwardPointer = (e: React.PointerEvent<HTMLImageElement>, type: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    if (type === 'pointermove') {
      const now = Date.now();
      if (now - moveThrottle.current < 60) return;
      moveThrottle.current = now;
    }
    onInput({ type, x, y });
  };

  const options = iv.options ?? [];
  const useRadios = options.length > 0 && options.length <= 6;
  const useSelect = options.length > 6;
  const useBoolean = !options.length && iv.field_type === 'boolean';
  const useTextarea = !options.length && LONG_TYPES.has(iv.field_type);

  return (
    <div
      ref={cardRef}
      onClick={onFocus}
      className={cn(
        'rounded-2xl border bg-[rgb(var(--surface))] p-4 shadow-card transition-all duration-150',
        active ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-[rgb(var(--border))] hover:border-[rgb(var(--border-strong))]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={kind.tone}>{kind.label}</Badge>
            {active && <span className="text-[11px] font-medium text-subtle">#{index + 1}</span>}
          </div>
          <p className="mt-2 text-[15px] font-medium leading-snug">
            {iv.question || iv.field_label || 'Input required'}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {iv.job_title}
            {iv.job_company ? ` · ${iv.job_company}` : ''} · {relativeTime(iv.created_at)}
          </p>
        </div>
      </div>

      {/* Screenshot context */}
      {iv.screenshot && !isCaptcha && (
        <img
          src={imgSrc(iv.screenshot)}
          alt="Form context"
          className="mt-3 max-h-56 w-full rounded-xl border border-[rgb(var(--border))] object-contain"
        />
      )}

      {isCaptcha ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            This site is showing a CAPTCHA. Solve it yourself in the live view below — JobPilot never bypasses
            CAPTCHAs. When you're done, hit Resume.
          </div>
          <div className="grid place-items-center overflow-hidden rounded-xl border border-[rgb(var(--border))] bg-black/90">
            {frame ? (
              <img
                src={imgSrc(frame)}
                alt="Live CAPTCHA view — tap to solve"
                className="max-h-[420px] w-full touch-none select-none object-contain"
                draggable={false}
                onPointerDown={(e) => forwardPointer(e, 'pointerdown')}
                onPointerMove={(e) => forwardPointer(e, 'pointermove')}
                onPointerUp={(e) => forwardPointer(e, 'pointerup')}
                onClick={(e) => forwardPointer(e as unknown as React.PointerEvent<HTMLImageElement>, 'click')}
              />
            ) : (
              <div className="flex h-48 items-center gap-2 text-[13px] text-white/70">
                <span className="h-2 w-2 animate-pulse-dot rounded-full bg-amber-400" />
                Waiting for the live view…
              </div>
            )}
          </div>
          <p className="text-[12px] text-subtle">Tap or drag directly on the image above to solve it yourself.</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onSkip} disabled={busy} leftIcon={<IconSkip className="h-4 w-4" />}>
              Skip
            </Button>
            <Button onClick={onResume} disabled={busy}>
              Resume
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Answer input by type */}
          {useRadios ? (
            <div className="grid gap-1.5" role="radiogroup" aria-label={iv.field_label || 'Options'}>
              {options.map((opt) => (
                <label
                  key={opt}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors',
                    draft === opt
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-500/10'
                      : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]',
                  )}
                >
                  <input
                    type="radio"
                    name={`iv-${iv.id}`}
                    className="sr-only"
                    checked={draft === opt}
                    onChange={() => onDraftChange(opt)}
                  />
                  <span
                    className={cn(
                      'grid h-4 w-4 place-items-center rounded-full border',
                      draft === opt ? 'border-accent-600' : 'border-[rgb(var(--border-strong))]',
                    )}
                  >
                    {draft === opt && <span className="h-2 w-2 rounded-full bg-accent-600" />}
                  </span>
                  {opt}
                </label>
              ))}
            </div>
          ) : useSelect ? (
            <Select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
            >
              <option value="">Select an option…</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          ) : useBoolean ? (
            <div className="flex gap-2">
              {['Yes', 'No'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onDraftChange(opt)}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    draft === opt
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-200'
                      : 'border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : useTextarea ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Type your answer…"
              rows={3}
            />
          ) : iv.kind === 'confirm' ? (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder="Optional note, or just confirm"
            />
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              placeholder={iv.kind === 'login' ? 'Type "done" once you have logged in' : 'Type your answer…'}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox checked={saveToKb} onChange={onSaveKbChange} aria-label="Save for future applications" />
              <span className="text-muted">Save for future applications</span>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onSkip} disabled={busy} leftIcon={<IconSkip className="h-4 w-4" />}>
                Skip
              </Button>
              <Button size="sm" onClick={onSubmit} loading={busy} leftIcon={<IconBolt className="h-4 w-4" />}>
                {iv.kind === 'confirm' ? 'Confirm' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
