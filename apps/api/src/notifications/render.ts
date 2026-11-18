import { ar, en, type Locale, type NotificationDto, type NotificationType } from '@wasla/shared';

/** Fills a notification template in the reader's language (used for push; the app renders its own). */
export function renderNotification(type: NotificationType, data: NotificationDto['data'], locale: Locale): string {
  const strings = locale === 'ar' ? ar : en;
  const from = (locale === 'ar' ? data.fromAr : data.fromEn) ?? '';
  const to = (locale === 'ar' ? data.toAr : data.toEn) ?? '';
  const time = data.departureAt
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        timeZone: 'Africa/Cairo',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(data.departureAt))
    : '';
  const values: Record<string, string> = { name: data.name ?? '', route: `${from} – ${to}`, time };
  return strings.notifications[type].replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '');
}

export function renderNewMessageTitle(name: string, locale: Locale): string {
  return (locale === 'ar' ? ar : en).notifications.newMessage.replace('{{name}}', name);
}
