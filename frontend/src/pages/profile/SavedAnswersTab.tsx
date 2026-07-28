import { useEffect, useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { SavedAnswer } from '@/api/types';
import { useToast } from '@/components/ui/Toast';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconPlus, IconQueue, IconSearch } from '@/components/icons';
import { ItemCard, SaveBadge, SectionTitle, useItemSaver } from './shared';
import type { SaveStatus } from './shared';

export function SavedAnswersTab() {
  const toast = useToast();
  const [items, setItems] = useState<SavedAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueSave = useItemSaver<{ question: string; answer: string }>(
    (id, body) => ProfileApi.updateSavedAnswer(id, body),
    setStatus,
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    ProfileApi.listSavedAnswers(q)
      .then((rows) => active && setItems(rows))
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [q]);

  const debouncedQ = useDebouncedCallback((v: string) => setQ(v), 300);

  const patch = (id: string, partial: Partial<SavedAnswer>) => {
    let updated: SavedAnswer | undefined;
    setItems((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...partial };
        return updated;
      }),
    );
    if (updated) queueSave(id, { question: updated.question, answer: updated.answer });
  };

  const add = async () => {
    try {
      const created = await ProfileApi.addSavedAnswer({ question: '', answer: '' });
      setItems((rows) => [created, ...rows]);
    } catch (err) {
      toast.error('Could not add', err instanceof Error ? err.message : undefined);
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems((rows) => rows.filter((r) => r.id !== id));
    try {
      await ProfileApi.deleteSavedAnswer(id);
    } catch (err) {
      setItems(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle description="A reusable knowledge base of answers JobPilot draws from.">Saved answers</SectionTitle>
        <div className="flex items-center gap-3">
          <SaveBadge status={status} />
          <Button size="sm" onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
            Add answer
          </Button>
        </div>
      </div>

      <div className="relative mb-3 max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          className="pl-9"
          placeholder="Search questions and answers"
          value={qInput}
          onChange={(e) => {
            setQInput(e.target.value);
            debouncedQ(e.target.value);
          }}
          aria-label="Search saved answers"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconQueue className="h-6 w-6" />}
          title={q ? 'No matches' : 'No saved answers yet'}
          description={q ? 'Try a different search.' : 'Answers you give during applications are saved here automatically.'}
          action={
            !q ? (
              <Button onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
                Add answer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((sa) => (
            <ItemCard
              key={sa.id}
              onRemove={() => remove(sa.id)}
              dragHandle={sa.source && sa.source !== 'manual' ? <Badge tone="neutral">{sa.source}</Badge> : undefined}
            >
              <div className="space-y-2">
                <Input placeholder="Question" value={sa.question} onChange={(e) => patch(sa.id, { question: e.target.value })} className="font-medium" />
                <Textarea rows={2} placeholder="Answer" value={sa.answer} onChange={(e) => patch(sa.id, { answer: e.target.value })} />
              </div>
            </ItemCard>
          ))}
        </div>
      )}
    </div>
  );
}
