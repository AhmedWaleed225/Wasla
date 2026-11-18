import { useTranslation } from 'react-i18next';
import { OfferForm } from '../../src/components/OfferForm';
import { Screen } from '../../src/components/Screen';
import { SearchCard } from '../../src/components/SearchCard';
import { T } from '../../src/components/ui';
import { useAuth } from '../../src/stores/auth';

/** Driver mode: publish a ride. Passenger mode: search for one. */
export default function Explore() {
  const { t } = useTranslation();
  const driver = useAuth((s) => s.me?.activeRole === 'DRIVER');
  return (
    <Screen>
      <T variant="h1" accessibilityRole="header">{driver ? t('offer.title') : t('search.title')}</T>
      {driver ? <OfferForm /> : <SearchCard />}
    </Screen>
  );
}
