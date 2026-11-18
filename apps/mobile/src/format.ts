import { formatEgp, type PlacePointDto } from '@wasla/shared';
import { useTranslation } from 'react-i18next';

/** Dates, times, money and distances in the app's language. Times are shown in the device's zone (Egypt). */
export function useFormat() {
  const { i18n } = useTranslation();
  const ar = i18n.language === 'ar';
  const locale = ar ? 'ar-EG' : 'en-GB';
  const num = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 1 });
  return {
    ar,
    time: (iso: string | Date) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
    day: (iso: string | Date) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)),
    dayTime: (iso: string | Date) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
    money: (piasters: number) => formatEgp(piasters, ar ? 'ar' : 'en'),
    number: (n: number) => num.format(n),
    place: (p: PlacePointDto) => (ar ? p.nameAr : p.nameEn),
  };
}

/** The next `count` days as local YYYY-MM-DD strings plus Date objects, starting today. */
export function nextDays(count: number): { key: string; date: Date }[] {
  const out: { key: string; date: Date }[] = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, '0');
    out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, date: d });
  }
  return out;
}

/** A random key for one booking attempt; reused if that attempt is retried. Not a secret. */
export function newIdempotencyKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
