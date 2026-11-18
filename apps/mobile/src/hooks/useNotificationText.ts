import type { NotificationDto } from '@wasla/shared';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../format';

/** The notification text, filled in the app's language from the stored values. */
export function useNotificationText() {
  const { t } = useTranslation();
  const f = useFormat();
  return (n: NotificationDto) => {
    const from = (f.ar ? n.data.fromAr : n.data.fromEn) ?? '';
    const to = (f.ar ? n.data.toAr : n.data.toEn) ?? '';
    return t(`notifications.${n.type}`, {
      name: n.data.name ?? '',
      route: `${from} – ${to}`,
      time: n.data.departureAt ? f.dayTime(n.data.departureAt) : '',
    });
  };
}

