import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RIDE_RULES, distanceKm, priceLimitsEgp, toAsciiDigits, type BookingMode } from '@wasla/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { ApiError, fieldMessage } from '../api/client';
import { ridesApi, vehiclesApi } from '../api/endpoints';
import { localDateString, useTripDraft } from '../stores/trip-draft';
import { useAuth } from '../stores/auth';
import { colors } from '../theme';
import { DayChips, Stepper, TimeChooser } from './rides';
import { PlacePair } from './SearchCard';
import { Button, Card, Chip, Field, Notice, Segmented, T, ToggleRow } from './ui';

function defaultDeparture() {
  const d = new Date(Date.now() + 90 * 60_000); // comfortably past the 30-minute minimum
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

export function OfferForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuth((s) => s.me)!;
  const { offerFrom, offerTo } = useTripDraft();
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: vehiclesApi.list });

  const start = useMemo(defaultDeparture, []);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [day, setDay] = useState(localDateString(start));
  const [hour, setHour] = useState(start.getHours());
  const [minute, setMinute] = useState(start.getMinutes());
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState<BookingMode>('INSTANT');
  const [womenOnly, setWomenOnly] = useState(false);
  const [notes, setNotes] = useState('');

  const vehicle = vehicles.data?.find((v) => v.id === vehicleId) ?? vehicles.data?.[0];
  useEffect(() => {
    if (vehicle && seats > vehicle.seats) setSeats(vehicle.seats);
  }, [vehicle, seats]);

  const limits =
    offerFrom?.lat != null && offerFrom.lng != null && offerTo?.lat != null && offerTo.lng != null
      ? priceLimitsEgp(distanceKm({ lat: offerFrom.lat, lng: offerFrom.lng }, { lat: offerTo.lat, lng: offerTo.lng }))
      : null;
  // Pre-fill the suggested price once a route is chosen; the driver can change it.
  useEffect(() => {
    if (limits && price === '') setPrice(String(limits.suggested));
  }, [limits, price]);

  const departureAt = () => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d, hour, minute).toISOString();
  };

  const publish = useMutation({
    mutationFn: () =>
      ridesApi.publish({
        vehicleId: vehicle!.id,
        origin: { locationId: offerFrom!.id },
        destination: { locationId: offerTo!.id },
        departureAt: departureAt(),
        seats,
        pricePerSeatEgp: Number(toAsciiDigits(price)) || 0,
        bookingMode: mode,
        womenOnly,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (ride) => {
      void qc.invalidateQueries({ queryKey: ['rides'] });
      setNotes('');
      router.push({ pathname: '/rides/[id]', params: { id: ride.id } });
    },
  });
  const fields = publish.error instanceof ApiError ? publish.error.fields : undefined;

  if (vehicles.isPending) return <ActivityIndicator color={colors.primary} />;
  if (vehicles.error) return <Notice tone="error" icon="close" text={vehicles.error.message} />;
  if (!vehicle) {
    return (
      <Card style={{ gap: 12 }}>
        <T variant="h3">{t('offer.noCar')}</T>
        <Button title={t('offer.addCar')} icon="plus" onPress={() => router.push('/vehicles/edit')} />
      </Card>
    );
  }

  const ready = !!offerFrom && !!offerTo && price !== '';
  return (
    <View style={{ gap: 14 }}>
      <Card style={{ paddingTop: 6 }}>
        <PlacePair
          fromField="offerFrom"
          toField="offerTo"
          labels={{ from: t('offer.from'), to: t('offer.to'), fromPh: t('offer.chooseStart'), toPh: t('offer.chooseEnd') }}
        />
      </Card>

      <Card style={{ gap: 12 }}>
        <T variant="label" color={colors.textTertiary}>{t('offer.day')}</T>
        <DayChips value={day} onChange={setDay} days={RIDE_RULES.maxDaysAhead} />
        <T variant="label" color={colors.textTertiary}>{t('offer.time')}</T>
        <TimeChooser hour={hour} minute={minute} onChange={(h, m) => (setHour(h), setMinute(m))} />
        {fields?.departureAt ? <T variant="caption" color={colors.dangerText}>{fieldMessage(fields.departureAt)}</T> : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <T variant="label" color={colors.textTertiary}>{t('offer.car')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {vehicles.data!.map((v) => (
            <Chip key={v.id} icon="car" label={`${v.make} ${v.model}`} selected={v.id === vehicle.id} onPress={() => setVehicleId(v.id)} />
          ))}
          <Chip icon="plus" label={t('offer.addCar')} onPress={() => router.push('/vehicles/edit')} />
        </View>
        <Stepper label={t('offer.seats')} value={seats} min={1} max={vehicle.seats} onChange={setSeats} />
        <Field
          label={t('offer.price')}
          value={price}
          onChangeText={(v) => setPrice(toAsciiDigits(v).replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={4}
          hint={limits ? t('offer.priceHint', { suggested: limits.suggested, max: limits.max }) : undefined}
          error={fieldMessage(fields?.pricePerSeatEgp)}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <T variant="label" color={colors.textTertiary}>{t('offer.mode')}</T>
        <Segmented<BookingMode>
          options={[
            { value: 'INSTANT', label: t('offer.instant') },
            { value: 'REQUEST', label: t('offer.request') },
          ]}
          value={mode}
          onChange={setMode}
        />
        {me.profile?.gender === 'FEMALE' ? (
          <ToggleRow label={t('offer.womenOnly')} hint={t('offer.womenOnlyHint')} value={womenOnly} onChange={setWomenOnly} />
        ) : null}
        <Field label={t('offer.notes')} placeholder={t('offer.notesPlaceholder')} value={notes} onChangeText={setNotes} maxLength={RIDE_RULES.notesMax} multiline />
      </Card>

      {publish.error ? <Notice tone="error" icon="close" text={publish.error.message} /> : null}
      <Button title={t('offer.publish')} icon="check" disabled={!ready} loading={publish.isPending} onPress={() => publish.mutate()} />
      <T variant="caption" muted style={{ textAlign: 'center' }}>{t('offer.verificationNote')}</T>
    </View>
  );
}
