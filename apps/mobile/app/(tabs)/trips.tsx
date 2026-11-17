import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../src/components/ComingSoon';

export default function Trips() {
  const { t } = useTranslation();
  return <ComingSoon title={t('tabs.trips')} body={t('comingSoon.trips')} icon="calendar" />;
}
