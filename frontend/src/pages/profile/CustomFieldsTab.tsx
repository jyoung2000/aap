import { useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { CustomField, CustomFieldIn, CustomFieldType } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CUSTOM_FIELD_TYPES } from '@/lib/constants';
import { IconPlus, IconSettings } from '@/components/icons';
import { ItemCard, SaveBadge, SectionTitle, useItemSaver } from './shared';
import type { SaveStatus } from './shared';

function toIn(c: CustomField): CustomFieldIn {
  const { id: _id, ...rest } = c;
  return rest;
}

export function CustomFieldsTab() {
  const toast = useToast();
  const { data, loading, setData } = useApi<CustomField[]>(() => ProfileApi.listCustomFields(), []);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const queueSave = useItemSaver<CustomFieldIn>((id, body) => ProfileApi.updateCustomField(id, body), setStatus);
  const items = data ?? [];

  const patch = (id: string, partial: Partial<CustomField>) => {
    let updated: CustomField | undefined;
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
      const created = await ProfileApi.addCustomField({
        label: '',
        type: 'text',
        options: [],
        value: '',
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
      await ProfileApi.deleteCustomField(id);
    } catch (err) {
      setData(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle description="Reusable answers to bespoke application questions.">Custom fields</SectionTitle>
        <div className="flex items-center gap-3">
          <SaveBadge status={status} />
          <Button size="sm" onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
            Add field
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
          icon={<IconSettings className="h-6 w-6" />}
          title="No custom fields"
          description="Add fields for questions the standard library doesn't cover."
          action={
            <Button onClick={add} leftIcon={<IconPlus className="h-4 w-4" />}>
              Add field
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((cf) => (
            <ItemCard key={cf.id} onRemove={() => remove(cf.id)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Label (e.g. T-shirt size)" value={cf.label} onChange={(e) => patch(cf.id, { label: e.target.value })} />
                <Select
                  options={CUSTOM_FIELD_TYPES}
                  value={cf.type}
                  onChange={(e) => patch(cf.id, { type: e.target.value as CustomFieldType })}
                />
              </div>

              {cf.type === 'select' && (
                <div className="mt-3">
                  <Label hint="comma-separated">Options</Label>
                  <Input
                    placeholder="Small, Medium, Large"
                    value={cf.options.join(', ')}
                    onChange={(e) =>
                      patch(cf.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                    }
                  />
                </div>
              )}

              <div className="mt-3">
                <Label>Value</Label>
                <CustomValue field={cf} onChange={(value) => patch(cf.id, { value })} />
              </div>
            </ItemCard>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomValue({ field, onChange }: { field: CustomField; onChange: (v: string) => void }) {
  switch (field.type) {
    case 'boolean':
      return (
        <label className="flex items-center gap-2.5 text-[13px]">
          <Toggle checked={field.value === 'yes' || field.value === 'true'} onChange={(v) => onChange(v ? 'yes' : 'no')} label={field.label} />
          <span className="font-medium">{field.value === 'yes' || field.value === 'true' ? 'Yes' : 'No'}</span>
        </label>
      );
    case 'number':
      return <Input type="number" inputMode="numeric" value={field.value} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <Input type="date" value={field.value} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <Select value={field.value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case 'file':
      return <p className="text-[13px] text-muted">File fields are answered from your uploaded documents at apply time.</p>;
    default:
      return <Input value={field.value} onChange={(e) => onChange(e.target.value)} placeholder="Answer" />;
  }
}
