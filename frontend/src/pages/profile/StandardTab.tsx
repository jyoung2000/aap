import { useState } from 'react';
import type { ProfileOut, ProfileUpdate } from '@/api/types';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Label } from '@/components/ui/Input';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { TextRow, NumberRow, SelectRow } from './fields';
import {
  CURRENCIES,
  DISABILITY_STATUS,
  GENDER_OPTIONS,
  PAY_PERIODS,
  RACE_OPTIONS,
  VETERAN_STATUS,
  WORK_MODEL,
  YES_NO_UNKNOWN,
} from '@/lib/constants';
import { IconPlus } from '@/components/icons';

export function StandardTab({
  profile,
  onChange,
}: {
  profile: ProfileOut;
  onChange: (patch: ProfileUpdate) => void;
}) {
  const setStr = (key: keyof ProfileOut) => (v: string) => onChange({ [key]: v } as ProfileUpdate);
  const setNum = (key: keyof ProfileOut) => (v: number | null) => onChange({ [key]: v } as ProfileUpdate);
  // EEO selects default to "Decline to self-identify" when unset.
  const eeo = (v: string) => v || 'decline';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Work eligibility" subtitle="Common screening questions" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <SelectRow label="Authorized to work" value={profile.work_authorized} onChange={setStr('work_authorized')} options={YES_NO_UNKNOWN} />
          <SelectRow label="Requires sponsorship" value={profile.requires_sponsorship} onChange={setStr('requires_sponsorship')} options={YES_NO_UNKNOWN} />
          <SelectRow label="Work model preference" value={profile.work_model_preference} onChange={setStr('work_model_preference')} options={WORK_MODEL} />
          <SelectRow label="Willing to relocate" value={profile.willing_to_relocate} onChange={setStr('willing_to_relocate')} options={YES_NO_UNKNOWN} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Compensation" subtitle="Left blank = never sent to employers" />
        <CardBody className="space-y-4">
          <div>
            <Label>Salary expectation</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Amount"
                value={profile.salary_expectation_amount ?? ''}
                onChange={(e) => setNum('salary_expectation_amount')(e.target.value === '' ? null : Number(e.target.value))}
              />
              <Select options={CURRENCIES} value={profile.salary_expectation_currency || 'USD'} onChange={(e) => setStr('salary_expectation_currency')(e.target.value)} />
              <Select options={PAY_PERIODS} value={profile.salary_expectation_period || 'year'} onChange={(e) => setStr('salary_expectation_period')(e.target.value)} />
            </div>
          </div>
          <div>
            <Label hint="left blank = never sent">Current compensation</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Amount"
                value={profile.current_comp_amount ?? ''}
                onChange={(e) => setNum('current_comp_amount')(e.target.value === '' ? null : Number(e.target.value))}
              />
              <Select options={CURRENCIES} value={profile.current_comp_currency || 'USD'} onChange={(e) => setStr('current_comp_currency')(e.target.value)} />
              <div />
            </div>
            <p className="mt-1.5 text-[12px] text-subtle">JobPilot never volunteers your current pay unless a field explicitly requires it.</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Availability & experience" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <TextRow label="Earliest start date" type="date" value={profile.earliest_start_date} onChange={setStr('earliest_start_date')} />
          <TextRow label="Notice period" value={profile.notice_period} onChange={setStr('notice_period')} placeholder="e.g. 2 weeks" />
          <NumberRow label="Years of experience" value={profile.years_experience} onChange={setNum('years_experience')} placeholder="8" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Skills & years" subtitle="Per-skill experience used for matching" />
        <CardBody>
          <SkillYearsEditor value={profile.skill_years || {}} onChange={(obj) => onChange({ skill_years: obj })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Background" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextRow label="Previously worked here" value={profile.previously_worked_here} onChange={setStr('previously_worked_here')} placeholder="Company name, if any" />
          <TextRow label="Referral name" value={profile.referral_name} onChange={setStr('referral_name')} placeholder="Who referred you" />
          <SelectRow label="Over 18" value={profile.over_18} onChange={setStr('over_18')} options={YES_NO_UNKNOWN} />
          <TextRow label="Security clearance" value={profile.security_clearance} onChange={setStr('security_clearance')} placeholder="e.g. None / Secret" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Consents" subtitle="Only sent when a form asks" />
        <CardBody className="space-y-3">
          <SelectRow label="Background check consent" value={profile.background_check_consent} onChange={setStr('background_check_consent')} options={YES_NO_UNKNOWN} />
          <SelectRow label="Drug screen consent" value={profile.drug_screen_consent} onChange={setStr('drug_screen_consent')} options={YES_NO_UNKNOWN} />
          <label className="flex items-center justify-between gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3.5 py-2.5">
            <div>
              <p className="text-sm font-medium">Agree to privacy policy</p>
              <p className="text-[12px] text-muted">Accept the employer's data-privacy policy when required.</p>
            </div>
            <Toggle checked={profile.agree_privacy_policy} onChange={(v) => onChange({ agree_privacy_policy: v })} label="Agree to privacy policy" />
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Voluntary self-identification"
          subtitle="Optional EEO fields — default to “Decline to self-identify”"
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Veteran status">
            {(id) => (
              <Select id={id} options={VETERAN_STATUS} value={eeo(profile.veteran_status)} onChange={(e) => setStr('veteran_status')(e.target.value)} />
            )}
          </Field>
          <Field label="Disability status">
            {(id) => (
              <Select id={id} options={DISABILITY_STATUS} value={eeo(profile.disability_status)} onChange={(e) => setStr('disability_status')(e.target.value)} />
            )}
          </Field>
          <Field label="Gender">
            {(id) => (
              <Select id={id} options={GENDER_OPTIONS} value={eeo(profile.gender)} onChange={(e) => setStr('gender')(e.target.value)} />
            )}
          </Field>
          <Field label="Race / ethnicity">
            {(id) => (
              <Select id={id} options={RACE_OPTIONS} value={eeo(profile.race_ethnicity)} onChange={(e) => setStr('race_ethnicity')(e.target.value)} />
            )}
          </Field>
        </CardBody>
      </Card>
    </div>
  );
}

function SkillYearsEditor({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (obj: Record<string, number>) => void;
}) {
  const [rows, setRows] = useState<{ skill: string; years: string }[]>(() =>
    Object.entries(value).map(([skill, years]) => ({ skill, years: String(years) })),
  );

  const commit = (next: { skill: string; years: string }[]) => {
    setRows(next);
    const obj: Record<string, number> = {};
    for (const r of next) {
      const key = r.skill.trim();
      if (key) obj[key] = Number(r.years) || 0;
    }
    onChange(obj);
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-[13px] text-subtle">No skills added yet.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1"
            placeholder="Skill (e.g. React)"
            value={row.skill}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? { ...r, skill: e.target.value } : r)))}
          />
          <Input
            className="w-24"
            type="number"
            inputMode="numeric"
            placeholder="Years"
            value={row.years}
            onChange={(e) => commit(rows.map((r, j) => (j === i ? { ...r, years: e.target.value } : r)))}
          />
          <button
            onClick={() => commit(rows.filter((_, j) => j !== i))}
            className="rounded-lg p-2 text-subtle transition-colors hover:bg-red-50 hover:text-danger dark:hover:bg-red-950/30"
            aria-label="Remove skill"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => commit([...rows, { skill: '', years: '' }])} leftIcon={<IconPlus className="h-4 w-4" />}>
        Add skill
      </Button>
    </div>
  );
}
