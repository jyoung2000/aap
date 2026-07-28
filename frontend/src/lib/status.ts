import type { ApplicationStatus, SearchStatus, FunnelStatus } from '@/api/types';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'purple';

export const APP_STATUS_META: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  filling: { label: 'Filling', tone: 'accent' },
  needs_human: { label: 'Needs you', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export const SEARCH_STATUS_META: Record<SearchStatus, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'accent' },
  done: { label: 'Done', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export const FUNNEL_META: Record<string, { label: string; tone: Tone }> = {
  '': { label: 'No status', tone: 'neutral' },
  no_response: { label: 'No response', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
  recruiter_reply: { label: 'Recruiter reply', tone: 'accent' },
  interview: { label: 'Interview', tone: 'purple' },
  offer: { label: 'Offer', tone: 'success' },
};

export function funnelLabel(status: FunnelStatus): string {
  return FUNNEL_META[status || '']?.label ?? 'No status';
}
