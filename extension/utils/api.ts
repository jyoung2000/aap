import type {
  ExtensionInfo,
  FieldDescriptor,
  InterventionItem,
  PairResponse,
  QueueResponse,
  ResolveResult,
  ResultReport,
} from './types';

/**
 * Device-token API client for the JobPilot container. All /api/ext/* calls carry
 * the Bearer device token. Only runs in the background service worker.
 */
export class Api {
  constructor(
    private apiBase: string,
    private token: string,
  ) {}

  private url(path: string): string {
    return this.apiBase.replace(/\/$/, '') + path;
  }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private async req<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(this.url(path), init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 200)}`);
    }
    const ct = res.headers.get('content-type') || '';
    return (ct.includes('application/json') ? await res.json() : (await res.text())) as T;
  }

  ping(): Promise<{ ok: boolean; humanized_default: boolean }> {
    return this.req('/api/ext/ping', { headers: this.headers(false) });
  }

  queueNext(): Promise<QueueResponse> {
    return this.req('/api/ext/queue/next', { headers: this.headers(false) });
  }

  resolveFields(appId: string, fields: FieldDescriptor[]): Promise<ResolveResult> {
    return this.req(`/api/ext/applications/${appId}/resolve-fields`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ fields }),
    });
  }

  raiseBlocker(
    appId: string,
    kind: string,
    question = '',
    screenshot = '',
  ): Promise<{ intervention_id: string }> {
    const q = new URLSearchParams({ kind, question, screenshot });
    return this.req(`/api/ext/applications/${appId}/intervention?${q.toString()}`, {
      method: 'POST',
      headers: this.headers(false),
    });
  }

  listInterventions(appId?: string): Promise<InterventionItem[]> {
    const q = appId ? `?application_id=${encodeURIComponent(appId)}` : '';
    return this.req(`/api/ext/interventions${q}`, { headers: this.headers(false) });
  }

  answerIntervention(
    ivId: string,
    answer: string,
    saveToKb: boolean,
  ): Promise<{ ok: boolean }> {
    return this.req(`/api/ext/interventions/${ivId}/answer`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ answer, save_to_kb: saveToKb }),
    });
  }

  reportResult(appId: string, report: ResultReport): Promise<{ ok: boolean; status: string }> {
    return this.req(`/api/ext/applications/${appId}/result`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(report),
    });
  }
}

/** Public (token-less) pairing call. */
export async function pairDevice(
  base: string,
  body: { code: string; name: string; browser: string; capabilities: string },
): Promise<PairResponse> {
  const res = await fetch(base.replace(/\/$/, '') + '/api/extension/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      detail = JSON.parse(text).detail || text;
    } catch {
      /* keep raw */
    }
    throw new Error(detail || `Pairing failed (HTTP ${res.status})`);
  }
  return (await res.json()) as PairResponse;
}

/**
 * Fetch the container's advertised extension version. Uses the session cookie
 * (credentials: include) since /api/extension/info is session-authed; degrades
 * silently when the user isn't logged into the web UI in this browser.
 */
export async function fetchExtensionInfo(apiBase: string): Promise<ExtensionInfo | null> {
  try {
    const res = await fetch(apiBase.replace(/\/$/, '') + '/api/extension/info', {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as ExtensionInfo;
  } catch {
    return null;
  }
}
