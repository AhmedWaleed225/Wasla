import type { Locale } from '@wasla/shared';

/** Picks ar/en from Accept-Language. Arabic is the default for Egypt. */
export function localeFromHeader(header: string | string[] | undefined): Locale {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return 'ar';
  const first = value.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('en') ? 'en' : 'ar';
}
