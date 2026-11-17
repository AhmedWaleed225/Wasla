import { errorMessage, isErrorCode, type ApiErrorBody, type AuthTokensDto, type ErrorCode } from '@wasla/shared';
import * as SecureStore from 'expo-secure-store';
import i18n from '../i18n';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/v1').replace(/\/$/, '');
const REFRESH_KEY = 'wasla.refreshToken';

/** An error from the API (or the network), with a stable code and a localized message. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly status: number,
    readonly fields?: Record<string, ErrorCode>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export const tokenStore = {
  async save(tokens: AuthTokensDto) {
    accessToken = tokens.accessToken;
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  },
  async clear() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
  hasRefreshToken: async () => (await SecureStore.getItemAsync(REFRESH_KEY)) !== null,
  /** Called when the refresh token is rejected (logged out elsewhere, revoked, expired). */
  onSessionLost(fn: () => void) {
    onSessionLost = fn;
  },
};

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        await tokenStore.clear();
        onSessionLost?.();
      }
      return false;
    }
    await tokenStore.save((await res.json()) as AuthTokensDto);
    return true;
  } catch {
    return false; // network problem — keep the refresh token for later
  }
}

/** Only one refresh at a time; parallel 401s wait for the same result. */
export function ensureFreshSession(): Promise<boolean> {
  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  if (opts.auth !== false && !accessToken && !retried) await ensureFreshSession();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}${qs}`, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Language': lang,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth !== false && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK', i18n.t('errors.network'), 0);
  }

  if (res.status === 401 && opts.auth !== false && !retried) {
    accessToken = null;
    if (await ensureFreshSession()) return api<T>(path, opts, true);
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as (ApiErrorBody & { error: Record<string, unknown> }) | T | null;

  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    const code: ErrorCode = err && isErrorCode(err.code) ? err.code : 'INTERNAL_ERROR';
    const { code: _c, message, fields, requestId: _r, ...extra } = (err ?? {}) as Record<string, unknown>;
    throw new ApiError(code, (message as string) ?? errorMessage(code, lang), res.status, fields as Record<string, ErrorCode>, extra);
  }
  return json as T;
}

/** Localized message for a field-level error code returned by the API or by local validation. */
export function fieldMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return errorMessage(code, i18n.language === 'en' ? 'en' : 'ar');
}
