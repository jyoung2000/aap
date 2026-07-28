import type { ReactNode } from 'react';
import { Field, Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { SelectOption } from '@/components/ui/Select';

export function TextRow({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  help,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  help?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} help={help} hint={hint} className={className}>
      {(id) => (
        <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function NumberRow({
  label,
  value,
  onChange,
  placeholder,
  help,
  hint,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  help?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} help={help} hint={hint} className={className}>
      {(id) => (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )}
    </Field>
  );
}

export function SelectRow({
  label,
  value,
  onChange,
  options,
  help,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  help?: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} help={help} className={className}>
      {(id) => <Select id={id} options={options} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}
