import type {
  AdminAuditRowDto,
  AdminMeDto,
  AdminOverviewDto,
  AdminReportDetailDto,
  AdminReportRowDto,
  AdminRideDetailDto,
  AdminRideRowDto,
  AdminUpdateReportInput,
  AdminUserDetailDto,
  AdminUserRowDto,
  ApiErrorBody,
  Paged,
} from '@wasla/shared';

/** Same-origin API path (proxied to the API in development). */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/v1';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let onSignedOut: (() => void) | undefined;
/** Called when the session cookie is no longer accepted (expired, revoked, disabled). */
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

/**
 * Every call sends the session cookie. Changes also send the CSRF header the
 * API requires, which other websites can't add.
 */
async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
  const qs = query
    ? '?' +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        ...(method !== 'GET' ? { 'X-Wasla-Admin': '1' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', "Can't reach the Wasla API.", 0);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    if (res.status === 401 && !path.startsWith('/admin/auth/login')) onSignedOut?.();
    throw new ApiError(err?.code ?? 'INTERNAL_ERROR', err?.message ?? `Request failed (${res.status})`, res.status);
  }
  return json as T;
}

type Page = { page?: number; q?: string; status?: string };

export const adminApi = {
  login: (email: string, password: string) => call<AdminMeDto>('POST', '/admin/auth/login', { email, password }),
  logout: () => call<void>('POST', '/admin/auth/logout'),
  me: () => call<AdminMeDto>('GET', '/admin/auth/me'),
  overview: () => call<AdminOverviewDto>('GET', '/admin/overview'),
  users: (p: Page) => call<Paged<AdminUserRowDto>>('GET', '/admin/users', undefined, p),
  user: (id: string) => call<AdminUserDetailDto>('GET', `/admin/users/${id}`),
  suspend: (id: string, reason: string) => call<AdminUserDetailDto>('POST', `/admin/users/${id}/suspend`, { reason }),
  reinstate: (id: string, reason: string) => call<AdminUserDetailDto>('POST', `/admin/users/${id}/reinstate`, { reason }),
  rides: (p: Page) => call<Paged<AdminRideRowDto>>('GET', '/admin/rides', undefined, p),
  ride: (id: string) => call<AdminRideDetailDto>('GET', `/admin/rides/${id}`),
  cancelRide: (id: string, reason: string) => call<AdminRideDetailDto>('POST', `/admin/rides/${id}/cancel`, { reason }),
  reports: (p: Page) => call<Paged<AdminReportRowDto>>('GET', '/admin/reports', undefined, p),
  report: (id: string) => call<AdminReportDetailDto>('GET', `/admin/reports/${id}`),
  updateReport: (id: string, input: AdminUpdateReportInput) => call<AdminReportDetailDto>('PATCH', `/admin/reports/${id}`, input),
  audit: (p: Page) => call<Paged<AdminAuditRowDto>>('GET', '/admin/audit', undefined, p),
};
