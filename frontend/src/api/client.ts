// Hand-written fetch wrapper. Single origin, session-cookie auth, CSRF
// double-submit (jp_csrf cookie -> X-CSRF-Token header) on every non-GET.

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Read a non-httpOnly cookie by name (used for the CSRF token). */
export function readCookie(name: string): string {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : '';
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Callback invoked whenever the API returns 401 (unauthenticated). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Pass a FormData instance for multipart uploads (no JSON encoding). */
  form?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the global 401 -> /signin redirect (used by the initial auth probe). */
  skipAuthRedirect?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') || '';
  if (res.status === 204) return null;
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return await res.text();
}

function extractMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  if (typeof body === 'string' && body) return body;
  return `Request failed (${status})`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...options.headers };

  if (!SAFE_METHODS.has(method)) {
    const csrf = readCookie('jp_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form; // browser sets multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Network error — is the server reachable?');
  }

  if (res.status === 401) {
    if (onUnauthorized && !options.skipAuthRedirect) onUnauthorized();
    throw new ApiError(401, 'Not authenticated');
  }

  const parsed = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(res.status, parsed), parsed);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
};

/** Build a query string from a params object, skipping undefined/empty values. */
export function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
