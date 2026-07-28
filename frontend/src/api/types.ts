// TypeScript interfaces mirroring the JobPilot FastAPI backend schemas.
// Hand-written (no codegen) — keep in sync with backend/app/schemas.

export type Theme = 'system' | 'light' | 'dark';

export interface UserOut {
  id: string;
  email: string;
  theme: string;
  humanized_input: boolean;
  max_applications_per_hour: number;
  how_heard_default: string;
  notify_webhook_url: string;
  onboarding_done: boolean;
}

export interface UserSettingsUpdate {
  theme?: string;
  humanized_input?: boolean;
  max_applications_per_hour?: number;
  how_heard_default?: string;
  notify_webhook_url?: string;
  onboarding_done?: boolean;
}

// ---------------- Profile ----------------
export interface ProfileOut {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  linkedin_url: string;
  portfolio_url: string;
  github_url: string;
  website_url: string;
  work_authorized: string;
  requires_sponsorship: string;
  work_model_preference: string;
  willing_to_relocate: string;
  salary_expectation_amount: number | null;
  salary_expectation_currency: string;
  salary_expectation_period: string;
  current_comp_amount: number | null;
  current_comp_currency: string;
  earliest_start_date: string;
  notice_period: string;
  years_experience: number | null;
  skill_years: Record<string, number>;
  previously_worked_here: string;
  referral_name: string;
  over_18: string;
  background_check_consent: string;
  drug_screen_consent: string;
  security_clearance: string;
  agree_privacy_policy: boolean;
  veteran_status: string;
  disability_status: string;
  gender: string;
  race_ethnicity: string;
  parsed_resume: Record<string, unknown>;
}

export type ProfileUpdate = Partial<ProfileOut>;

export interface WorkExperience {
  id: string;
  title: string;
  company: string;
  location: string;
  start_date: string;
  end_date: string;
  current: boolean;
  bullets: string[];
  order: number;
}
export type WorkExperienceIn = Omit<WorkExperience, 'id'>;

export interface Education {
  id: string;
  degree: string;
  field_of_study: string;
  school: string;
  graduation_year: string;
  gpa: string;
  order: number;
}
export type EducationIn = Omit<Education, 'id'>;

export interface Recommendation {
  id: string;
  name: string;
  title: string;
  relationship_to: string;
  contact: string;
  quote: string;
  file_id: string | null;
  order: number;
}
export type RecommendationIn = Omit<Recommendation, 'id'>;

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'file';
export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  value: string;
  file_id: string | null;
  order: number;
}
export type CustomFieldIn = Omit<CustomField, 'id'>;

export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  source: string;
}
export interface SavedAnswerIn {
  question: string;
  answer: string;
}

export type ProfileFileKind = 'resume' | 'cover' | 'cert' | 'portfolio' | string;
export interface ProfileFileOut {
  id: string;
  kind: ProfileFileKind;
  filename: string;
  mime: string;
  size_bytes: number;
  is_default: boolean;
}

export interface ParseResult {
  parsed: Record<string, unknown>;
  review_required: boolean;
}

// ---------------- Search / Jobs ----------------
export type SearchStatus = 'queued' | 'running' | 'done' | 'failed';

export interface SearchCreate {
  keywords: string;
  location: string;
  remote_only: boolean;
  salary_floor?: number | null;
  education_level?: string;
  posted_within_days?: number | null;
  sources: string[];
}

export interface SearchOut {
  id: string;
  keywords: string;
  location: string;
  remote_only: boolean;
  filters: Record<string, unknown>;
  status: SearchStatus;
  progress: number;
  message: string;
  found_count: number;
  new_count: number;
  source_breakdown: Record<string, number>;
  error: string;
  created_at: string;
}

export type JobSort = 'match' | 'date' | 'salary' | 'company' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface JobListItem {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary_text: string;
  education_level: string;
  post_date: string;
  source: string;
  match_score: number | null;
  server_apply_capable: boolean;
  has_application: boolean;
}

export interface JobOut extends JobListItem {
  search_id: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_period: string;
  canonical_url: string;
  apply_url: string;
  description: string;
  summary: string;
  requirements: string[];
  match_rationale: string;
  enriched: boolean;
  created_at: string;
}

export interface JobQuery {
  search_id?: string;
  source?: string;
  min_match?: number;
  q?: string;
  remote_only?: boolean;
  sort?: JobSort;
  order?: SortOrder;
  limit?: number;
  offset?: number;
}

// ---------------- Applications ----------------
export type ApplyMode = 'auto' | 'reviewed' | 'manual';
export type Executor = 'extension' | 'playwright';
export type ApplicationStatus =
  | 'queued'
  | 'filling'
  | 'needs_human'
  | 'submitted'
  | 'failed'
  | 'skipped';
export type FunnelStatus =
  | ''
  | 'no_response'
  | 'rejected'
  | 'recruiter_reply'
  | 'interview'
  | 'offer';

export interface ApplicationCreate {
  job_ids: string[];
  mode: ApplyMode;
  executor: Executor;
  humanized?: boolean;
  review_first?: boolean;
}

export interface ApplicationEvent {
  from_state: string;
  to_state: string;
  at: string;
  note: string;
}

export interface ApplicationOut {
  id: string;
  job_id: string;
  job_title: string;
  job_company: string;
  job_source: string;
  apply_url: string;
  status: ApplicationStatus;
  mode: ApplyMode;
  executor: Executor;
  humanized: boolean;
  review_first: boolean;
  field_snapshot: Record<string, unknown>;
  confirmation_screenshot: string;
  error: string;
  submitted_at: string | null;
  funnel_status: FunnelStatus;
  created_at: string;
  updated_at: string;
  events: ApplicationEvent[];
  open_interventions: number;
}

export type InterventionKind = 'field' | 'captcha' | 'login' | 'confirm';
export interface InterventionOut {
  id: string;
  application_id: string;
  kind: InterventionKind;
  field_label: string;
  field_type: string;
  options: string[];
  question: string;
  screenshot: string;
  answer: string;
  resolved: boolean;
  save_to_kb: boolean;
  created_at: string;
  job_title: string;
  job_company: string;
}

export interface InterventionAnswer {
  answer: string;
  save_to_kb: boolean;
}

// ---------------- Extension ----------------
export interface PairingOut {
  code: string;
  expires_at: string;
  pair_url: string;
  base_url: string;
}

export interface DeviceOut {
  id: string;
  name: string;
  browser: string;
  revoked: boolean;
  last_seen: string | null;
  capabilities: string;
}

export interface ExtensionInfo {
  version: string;
  chrome_download: string;
  firefox_download: string;
  chrome_available: boolean;
  firefox_available: boolean;
  ws_url: string;
  api_base: string;
}

// ---------------- Analytics ----------------
export interface DashboardCards {
  found_today: number;
  applied_this_week: number;
  responses: number;
  interviews: number;
  offers: number;
  pending_interventions: number;
  total_applications: number;
  total_jobs: number;
}

export interface TimePoint {
  date: string;
  count: number;
}
export interface SourceCount {
  source: string;
  count: number;
}
export interface SearchSummary {
  id: string;
  keywords: string;
  location: string;
  found: number;
}
export interface StatusCount {
  status: string;
  count: number;
}

export interface DashboardOut {
  cards: DashboardCards;
  applications_over_time: TimePoint[];
  per_source: SourceCount[];
  per_search: SearchSummary[];
  status_breakdown: StatusCount[];
}

export interface FunnelStage {
  stage: string;
  count: number;
}
export interface FunnelOut {
  stages: FunnelStage[];
}

// ---------------- Import ----------------
export interface ImportProfileResult {
  preview?: Record<string, number>;
  applied?: boolean;
  error?: string;
}
export interface ImportJobsResult {
  imported: number;
}

// ---------------- WebSocket events ----------------
export interface WsEvent {
  type: string;
  [key: string]: unknown;
}
