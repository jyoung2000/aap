import { useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { Recommendation, RecommendationIn } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconPlus, IconProfile } from '@/components/icons';
import { ItemCard, SaveBadge, SectionTitle, useItemSaver } from './shared';
import type { SaveStatus } from './shared';

function toIn(r: Recommendation): RecommendationIn {
  const { id: _id, ...rest } = r;
  return rest;
}

export function RecommendationsTab() {
  const toast = useToast();
  const { data, loading, setData } = useApi<Recommendation[]>(() => ProfileApi.listRecommendations(), []);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueSave = useItemSaver<RecommendationIn>((id, body) => ProfileApi.updateRecommendation(id, body), setStatus);
  const items = data ?? [];

  const patch = (id: string, partial: Partial<Recommendation>) => {
    let updated: Recommendation | undefined;
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
      const created = await ProfileApi.addRecommendation({
        name: '',
        title: '',
        relationship_to: '',
        contact: '',
        quote: '',
        file_id: null,
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
      await ProfileApi.deleteRecommendation(id);
    } catch (err) {
      setData(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle description="References who can vouch for you.">Recommendations</SectionTitle>
        <div className="flex items-center gap-3">
          <SaveBadge status={status} />
          <Button size="sm" onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
            Add reference
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconProfile className="h-6 w-6" />}
          title="No references yet"
          description="Add people who can recommend you."
          action={
            <Button onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
              Add reference
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((rec) => (
            <ItemCard key={rec.id} onRemove={() => remove(rec.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Name" value={rec.name} onChange={(e) => patch(rec.id, { name: e.target.value })} />
                <Input placeholder="Title" value={rec.title} onChange={(e) => patch(rec.id, { title: e.target.value })} />
                <Input placeholder="Relationship (e.g. Manager)" value={rec.relationship_to} onChange={(e) => patch(rec.id, { relationship_to: e.target.value })} />
                <Input placeholder="Contact (email or phone)" value={rec.contact} onChange={(e) => patch(rec.id, { contact: e.target.value })} />
              </div>
              <Textarea className="mt-3" rows={2} placeholder="Quote or note (optional)" value={rec.quote} onChange={(e) => patch(rec.id, { quote: e.target.value })} />
            </ItemCard>
          ))}
        </div>
      )}
    </div>
  );
}
