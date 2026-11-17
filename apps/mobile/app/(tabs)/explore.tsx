import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../src/components/ComingSoon';
import { useAuth } from '../../src/stores/auth';

export default function Explore() {
  const { t } = useTranslation();
  const driver = useAuth((s) => s.me?.activeRole === 'DRIVER');
  return driver ? (
    <ComingSoon title={t('tabs.offer')} body={t('home.driverPending')} icon="car" />
  ) : (
    <ComingSoon title={t('tabs.explore')} body={t('comingSoon.explore')} icon="search" />
  );
}
