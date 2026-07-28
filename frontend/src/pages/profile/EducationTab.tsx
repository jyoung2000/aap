import { useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { Education, EducationIn } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconPlus, IconProfile } from '@/components/icons';
import { ItemCard, SaveBadge, SectionTitle, useItemSaver } from './shared';
import type { SaveStatus } from './shared';

function toIn(e: Education): EducationIn {
  const { id: _id, ...rest } = e;
  return rest;
}

export function EducationTab() {
  const toast = useToast();
  const { data, loading, setData } = useApi<Education[]>(() => ProfileApi.listEducation(), []);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueSave = useItemSaver<EducationIn>((id, body) => ProfileApi.updateEducation(id, body), setStatus);
  const items = data ?? [];

  const patch = (id: string, partial: Partial<Education>) => {
    let updated: Education | undefined;
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
      const created = await ProfileApi.addEducation({
        degree: '',
        field_of_study: '',
        school: '',
        graduation_year: '',
        gpa: '',
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
      await ProfileApi.deleteEducation(id);
    } catch (err) {
      setData(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle description="Degrees and schools. Changes save automatically.">Education</SectionTitle>
        <div className="flex items-center gap-3">
          <SaveBadge status={status} />
          <Button size="sm" onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
            Add education
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconProfile className="h-6 w-6" />}
          title="No education added"
          description="Add your degrees and schools."
          action={
            <Button onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
              Add education
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((ed) => (
            <ItemCard key={ed.id} onRemove={() => remove(ed.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Degree (e.g. B.S.)" value={ed.degree} onChange={(e) => patch(ed.id, { degree: e.target.value })} />
                <Input placeholder="Field of study" value={ed.field_of_study} onChange={(e) => patch(ed.id, { field_of_study: e.target.value })} />
                <Input placeholder="School" value={ed.school} onChange={(e) => patch(ed.id, { school: e.target.value })} className="sm:col-span-2" />
                <Input placeholder="Graduation year" value={ed.graduation_year} onChange={(e) => patch(ed.id, { graduation_year: e.target.value })} />
                <Input placeholder="GPA (optional)" value={ed.gpa} onChange={(e) => patch(ed.id, { gpa: e.target.value })} />
              </div>
            </ItemCard>
          ))}
        </div>
      )}
    </div>
  );
}
