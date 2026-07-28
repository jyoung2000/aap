// Shared type definitions for the JobPilot extension.
// These mirror the FastAPI backend contracts (app/api/ext_api.py, extension.py).

/** Persisted pairing/device state (browser.storage.local). */
export interface PairState {
  apiBase: string;
  wsUrl: string;
  deviceToken: string;
  userEmail: string;
}

/** Runtime flags kept alongside PairState in storage.local. */
export interface RuntimeFlags {
  autoRun: boolean;
  linkConnected: boolean;
}

/** Response from POST /api/extension/pair. */
export interface PairResponse {
  device_token: string;
  user_email: string;
  ws_url: string;
  api_base: string;
}

/** A queued application handed to the extension by GET /api/ext/queue/next. */
export interface QueueApp {
  id: string;
  job_id: string;
  apply_url: string;
  title: string;
  company: string;
  source: string;
  mode: string;
  humanized: boolean;
  review_first: boolean;
}

export interface QueueResponse {
  application: QueueApp | null;
  reason?: 'empty' | 'rate_limited' | string;
  retry_after?: number;
  remaining_this_hour?: number;
  remaining?: number;
}

/** A form field detected in the page, sent to /resolve-fields. */
export interface FieldDescriptor {
  label: string;
  type: string;
  options: string[];
  screenshot?: string;
}

/** A resolved field value returned by /resolve-fields. */
export interface ResolvedField {
  label: string;
  type: string;
  value: string;
  confidence: number;
  source: string;
  needs_human: boolean;
  is_knockout?: boolean;
  intervention_id?: string;
}

/** A human-in-the-loop request. */
export interface InterventionItem {
  id: string;
  application_id?: string;
  kind: string; // field | captcha | login | confirm
  label?: string;
  field_label?: string;
  field_type?: string;
  options?: string[];
  question?: string;
  screenshot?: string;
  is_knockout?: boolean;
}

export interface ResolveResult {
  resolved: ResolvedField[];
  interventions: InterventionItem[];
}

export type ResultStatus = 'submitted' | 'failed' | 'needs_human' | 'skipped';

export interface ResultReport {
  status: ResultStatus;
  field_snapshot?: Record<string, string>;
  confirmation_screenshot?: string;
  error?: string;
}

/** Extension-info response (update nudge). */
export interface ExtensionInfo {
  version: string;
  api_base: string;
  ws_url: string;
  chrome_available?: boolean;
  firefox_available?: boolean;
}

// --- Internal background <-> popup state ---

export interface RunActivity {
  applicationId: string;
  title: string;
  company: string;
  url: string;
  status: string; // filling | needs_human | submitting ...
  step: number;
}

export interface RecentResult {
  applicationId: string;
  title: string;
  company: string;
  status: ResultStatus | string;
  at: number;
  error?: string;
}

export interface BackgroundState {
  paired: boolean;
  linkConnected: boolean;
  running: boolean;
  autoRun: boolean;
  userEmail: string;
  apiBase: string;
  builtinVersion: string;
  current: RunActivity | null;
  recent: RecentResult[];
  interventions: InterventionItem[];
  debuggerAvailable: boolean;
}

/** Params the background passes to the content script to begin a run. */
export interface StartFillingPayload {
  applicationId: string;
  mode: string;
  humanized: boolean;
  reviewFirst: boolean;
}
