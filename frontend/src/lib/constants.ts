import type { SelectOption } from '@/components/ui/Select';

// Job sources supported by the backend (ATS + aggregators + JSON-LD + stubs).
export const SOURCE_GROUPS: { label: string; sources: { id: string; label: string }[] }[] = [
  {
    label: 'ATS boards',
    sources: [
      { id: 'greenhouse', label: 'Greenhouse' },
      { id: 'lever', label: 'Lever' },
      { id: 'ashby', label: 'Ashby' },
      { id: 'workable', label: 'Workable' },
      { id: 'smartrecruiters', label: 'SmartRecruiters' },
      { id: 'recruitee', label: 'Recruitee' },
    ],
  },
  {
    label: 'Aggregators',
    sources: [
      { id: 'remotive', label: 'Remotive' },
      { id: 'arbeitnow', label: 'Arbeitnow' },
      { id: 'themuse', label: 'The Muse' },
      { id: 'usajobs', label: 'USAJobs' },
      { id: 'adzuna', label: 'Adzuna' },
      { id: 'jooble', label: 'Jooble' },
    ],
  },
  {
    label: 'Other',
    sources: [
      { id: 'jsonld', label: 'JSON-LD (company pages)' },
      { id: 'linkedin', label: 'LinkedIn' },
      { id: 'indeed', label: 'Indeed' },
      { id: 'monster', label: 'Monster' },
    ],
  },
];

export const ALL_SOURCE_IDS = SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.id));

export const EDUCATION_LEVELS: SelectOption[] = [
  { value: '', label: 'Any level' },
  { value: 'high_school', label: 'High school' },
  { value: 'associate', label: 'Associate' },
  { value: 'bachelor', label: "Bachelor's" },
  { value: 'master', label: "Master's" },
  { value: 'doctorate', label: 'Doctorate' },
];

export const POSTED_WITHIN: SelectOption[] = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Past 24 hours' },
  { value: '3', label: 'Past 3 days' },
  { value: '7', label: 'Past week' },
  { value: '14', label: 'Past 2 weeks' },
  { value: '30', label: 'Past month' },
];

export const CURRENCIES: SelectOption[] = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'INR', label: 'INR' },
];

export const PAY_PERIODS: SelectOption[] = [
  { value: 'year', label: 'per year' },
  { value: 'month', label: 'per month' },
  { value: 'hour', label: 'per hour' },
];

// 2026 ATS standard-field option sets.
export const YES_NO_UNKNOWN: SelectOption[] = [
  { value: '', label: '—' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export const WORK_MODEL: SelectOption[] = [
  { value: '', label: 'No preference' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

export const VETERAN_STATUS: SelectOption[] = [
  { value: 'decline', label: 'Decline to self-identify' },
  { value: 'not_veteran', label: 'I am not a protected veteran' },
  { value: 'veteran', label: 'I am a protected veteran' },
];

export const DISABILITY_STATUS: SelectOption[] = [
  { value: 'decline', label: 'Decline to self-identify' },
  { value: 'no', label: 'No, I do not have a disability' },
  { value: 'yes', label: 'Yes, I have a disability' },
];

export const GENDER_OPTIONS: SelectOption[] = [
  { value: 'decline', label: 'Decline to self-identify' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonbinary', label: 'Non-binary' },
];

export const RACE_OPTIONS: SelectOption[] = [
  { value: 'decline', label: 'Decline to self-identify' },
  { value: 'american_indian', label: 'American Indian or Alaska Native' },
  { value: 'asian', label: 'Asian' },
  { value: 'black', label: 'Black or African American' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'pacific_islander', label: 'Native Hawaiian or Pacific Islander' },
  { value: 'white', label: 'White' },
  { value: 'two_or_more', label: 'Two or more races' },
];

export const CUSTOM_FIELD_TYPES: SelectOption[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select' },
  { value: 'file', label: 'File' },
];

export const FILE_KINDS: SelectOption[] = [
  { value: 'resume', label: 'Resume' },
  { value: 'cover', label: 'Cover letter' },
  { value: 'cert', label: 'Certificate' },
  { value: 'portfolio', label: 'Portfolio' },
];

export const FUNNEL_OPTIONS: SelectOption[] = [
  { value: '', label: 'No status' },
  { value: 'no_response', label: 'No response' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'recruiter_reply', label: 'Recruiter reply' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
];
