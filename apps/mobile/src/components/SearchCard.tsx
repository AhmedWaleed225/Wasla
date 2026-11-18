import { RIDE_RULES } from '@wasla/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { usePlaceName } from '../hooks/useSavedPlaces';
import { useTripDraft, type DraftField } from '../stores/trip-draft';
import { colors } from '../theme';
import { Icon } from './Icon';
import { DayChips, Stepper } from './rides';
import { Button, Card, T } from './ui';

export function PlaceSlot({ label, placeholder, value, onPress, dot }: { label: string; placeholder: string; value: string | null; onPress: () => void; dot: 'from' | 'to' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ?? placeholder}`} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 3,
          borderColor: dot === 'from' ? colors.primary : colors.accent,
          backgroundColor: dot === 'from' ? '#fff' : colors.accent,
        }}
      />
      <View style={{ flex: 1 }}>
        <T variant="caption" muted>{label}</T>
        <T weight={600} color={value ? colors.text : colors.placeholder} numberOfLines={1}>{value ?? placeholder}</T>
      </View>
    </Pressable>
  );
}

/** From / to / swap, used by the passenger search and the driver's Offer form. */
export function PlacePair({ fromField, toField, labels }: { fromField: DraftField; toField: DraftField; labels: { from: string; to: string; fromPh: string; toPh: string } }) {
  const draft = useTripDraft();
  const names = usePlaceName();
  const from = draft[fromField];
  const to = draft[toField];
  const pick = (purpose: DraftField) => router.push({ pathname: '/location-search', params: { purpose } });
  const swap = fromField === 'from' ? draft.swap : draft.swapOffer;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <PlaceSlot label={labels.from} placeholder={labels.fromPh} value={from ? names.name(from) : null} onPress={() => pick(fromField)} dot="from" />
        <View style={{ height: 1, backgroundColor: colors.line, marginStart: 24 }} />
        <PlaceSlot label={labels.to} placeholder={labels.toPh} value={to ? names.name(to) : null} onPress={() => pick(toField)} dot="to" />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Swap" onPress={swap} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="swap" />
      </Pressable>
    </View>
  );
}

/** Passenger search: places, day and seats, then the results screen. */
export function SearchCard() {
  const { t } = useTranslation();
  const { from, to, date, seats, setDate, setSeats } = useTripDraft();
  const ready = !!from && !!to;
  return (
    <Card style={{ paddingTop: 6, gap: 10 }}>
      <PlacePair
        fromField="from"
        toField="to"
        labels={{ from: t('home.from'), to: t('home.to'), fromPh: t('home.choosePickup'), toPh: t('home.chooseDestination') }}
      />
      <T variant="label" color={colors.textTertiary}>{t('search.when')}</T>
      <DayChips value={date} onChange={setDate} />
      <Stepper label={t('search.seats')} value={seats} min={1} max={RIDE_RULES.maxSeatsPerBooking} onChange={setSeats} />
      <Button title={t('home.searchRides')} icon="search" disabled={!ready} onPress={() => router.push('/rides/results')} style={{ marginTop: 4 }} />
      {!ready ? <T variant="caption" muted style={{ textAlign: 'center' }}>{t('search.choosePlaces')}</T> : null}
    </Card>
  );
}
