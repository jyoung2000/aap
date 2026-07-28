import { useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { WorkExperience, WorkExperienceIn } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Label } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { IconDrag, IconJobs, IconPlus } from '@/components/icons';
import { ItemCard, SaveBadge, SectionTitle, useItemSaver } from './shared';
import type { SaveStatus } from './shared';

function toIn(e: WorkExperience): WorkExperienceIn {
  const { id: _id, ...rest } = e;
  return rest;
}

export function ExperienceTab() {
  const toast = useToast();
  const { data, loading, setData } = useApi<WorkExperience[]>(() => ProfileApi.listExperience(), []);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const queueSave = useItemSaver<WorkExperienceIn>((id, body) => ProfileApi.updateExperience(id, body), setStatus);

  const items = data ?? [];

  const patch = (id: string, partial: Partial<WorkExperience>) => {
    let updated: WorkExperience | undefined;
    setData((rows) =>
      (rows ?? []).map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...partial };
        return updated;
      }),
    );
    if (updated) queueSave(id, toIn(updated));
  };

  const add = async () => {
    try {
      const created = await ProfileApi.addExperience({
        title: '',
        company: '',
        location: '',
        start_date: '',
        end_date: '',
        current: false,
        bullets: [],
        order: items.length,
      });
      setData((rows) => [...(rows ?? []), created]);
    } catch (err) {
      toast.error('Could not add', err instanceof Error ? err.message : undefined);
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setData((rows) => (rows ?? []).filter((r) => r.id !== id));
    try {
      await ProfileApi.deleteExperience(id);
    } catch (err) {
      setData(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setData(next);
    try {
      await ProfileApi.reorderExperience(next.map((r) => r.id));
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      toast.error('Could not reorder', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle description="Drag the handle to reorder. Changes save automatically.">Work experience</SectionTitle>
        <div className="flex items-center gap-3">
          <SaveBadge status={status} />
          <Button size="sm" onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
            Add role
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconJobs className="h-6 w-6" />}
          title="No experience added"
          description="Add roles so JobPilot can answer work-history questions."
          action={
            <Button onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
              Add your first role
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((exp, i) => (
            <div
              key={exp.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(i);
              }}
              onDrop={() => {
                if (dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                'transition-all',
                overIndex === i && dragIndex !== null && dragIndex !== i && 'ring-2 ring-accent-400 rounded-2xl',
                dragIndex === i && 'opacity-50',
              )}
            >
              <ItemCard
                onRemove={() => remove(exp.id)}
                dragHandle={
                  <span
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    className="flex cursor-grab items-center gap-1 rounded-md px-1 py-0.5 text-subtle hover:text-[rgb(var(--text))] active:cursor-grabbing"
                    aria-label="Drag to reorder"
                  >
                    <IconDrag className="h-4 w-4" />
                    <span className="text-[12px] font-medium">Role {i + 1}</span>
                  </span>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Job title" value={exp.title} onChange={(e) => patch(exp.id, { title: e.target.value })} />
                  <Input placeholder="Company" value={exp.company} onChange={(e) => patch(exp.id, { company: e.target.value })} />
                  <Input placeholder="Location" value={exp.location} onChange={(e) => patch(exp.id, { location: e.target.value })} className="sm:col-span-2" />
                  <Input placeholder="Start (e.g. 2021)" value={exp.start_date} onChange={(e) => patch(exp.id, { start_date: e.target.value })} />
                  <Input
                    placeholder="End (e.g. 2024)"
                    value={exp.end_date}
                    disabled={exp.current}
                    onChange={(e) => patch(exp.id, { end_date: e.target.value })}
                  />
                </div>
                <label className="mt-3 flex items-center gap-2.5 text-[13px]">
                  <Toggle checked={exp.current} onChange={(v) => patch(exp.id, { current: v, end_date: v ? '' : exp.end_date })} label="Current role" />
                  <span className="font-medium">I currently work here</span>
                </label>

                <div className="mt-4">
                  <Label>Highlights</Label>
                  <BulletList bullets={exp.bullets} onChange={(bullets) => patch(exp.id, { bullets })} />
                </div>
              </ItemCard>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletList({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div className="space-y-2">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
          <Textarea
            rows={1}
            className="min-h-[40px]"
            placeholder="Describe an accomplishment…"
            value={b}
            onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
            className="mt-1.5 rounded-lg p-1.5 text-subtle transition-colors hover:bg-red-50 hover:text-danger dark:hover:bg-red-950/30"
            aria-label="Remove highlight"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...bullets, ''])}
        className="text-[13px] font-medium text-accent-600 hover:underline dark:text-accent-300"
      >
        + Add highlight
      </button>
    </div>
  );
}
