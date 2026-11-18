/** Minimal cookie handling for the admin console's session cookie (no extra dependency). */

export const ADMIN_COOKIE = 'wasla_admin';
export const ADMIN_COOKIE_PATH = '/v1/admin';

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/**
 * HttpOnly (scripts can't read it), SameSite=Strict (other sites can't send it),
 * scoped to the admin API path, Secure outside development.
 */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    `Path=${ADMIN_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedCookie(secure: boolean): string {
  return sessionCookie('', 0, secure);
}
