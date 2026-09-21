import 'server-only';

/**
 * Server-side client for the NestJS API. Only Server Actions import this, so
 * the browser never talks to the API directly: the API address stays private
 * (API_URL is NOT a NEXT_PUBLIC_ variable), no CORS surface is needed, and
 * every request passes through our own validation first.
 */
const API_URL = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | ApiErrorBody | null;
}

export interface ApiErrorBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
  details?: { field: string; errors: string[] }[];
  reasons?: { code: string; message: string }[];
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error(`[api] POST ${path} failed`, err);
    return { ok: false, status: 0, data: null };
  }
  const data = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  return { ok: res.ok, status: res.status, data };
}

export function isErrorBody(x: unknown): x is ApiErrorBody {
  return typeof x === 'object' && x !== null && ('error' in x || 'statusCode' in x);
}

export function fieldErrorsFrom(body: ApiErrorBody | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of body?.details ?? []) out[d.field] = d.errors[0] ?? 'Invalid value';
  return out;
}
