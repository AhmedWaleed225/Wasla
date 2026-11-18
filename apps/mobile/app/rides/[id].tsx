import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RIDE_RULES, type DriverBookingDto, type RideDetailDto } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, View } from 'react-native';
import { bookingsApi, ridesApi } from '../../src/api/endpoints';
import { RouteLine, StatusTag, Stepper } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Avatar, Button, Card, Divider, Field, Notice, Tag, T } from '../../src/components/ui';
import { newIdempotencyKey, useFormat } from '../../src/format';
import { colors, fonts, space } from '../../src/theme';

const rideKey = (id: string) => ['ride', id] as const;

/** Lists that change whenever a ride or booking does. */
function useRefreshLists() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['bookings'] });
    void qc.invalidateQueries({ queryKey: ['rides'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };
}

const openChat = (bookingId: string) => router.push({ pathname: '/chat/[bookingId]', params: { bookingId } });

function confirm(title: string, body: string, yes: string, no: string, onYes: () => void) {
  Alert.alert(title, body, [
    { text: no, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({ queryKey: rideKey(id), queryFn: () => ridesApi.get(id) });

  if (q.isPending) {
    return (
      <Screen title={t('ride.title')} back>
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }
  if (q.error) {
    return (
      <Screen title={t('ride.title')} back>
        <Notice tone="error" icon="close" text={q.error.message} />
        <Button title={t('common.retry')} kind="secondary" onPress={() => q.refetch()} />
      </Screen>
    );
  }

  const ride = q.data;
  return (
    <Screen title={t('ride.title')} back>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="h3" style={{ flex: 1 }}>{f.dayTime(ride.departureAt)}</T>
          <StatusTag ride={ride.status} />
        </View>
        <RouteLine ride={ride} showTime={false} />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T muted style={{ flex: 1 }}>{t('ride.pricePerSeat')}</T>
          <T style={{ fontFamily: fonts.display[700], fontSize: 20 }}>{f.money(ride.pricePerSeatPiasters)}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Tag label={t('ride.distance', { km: f.number(ride.distanceKm) })} tone="gray" />
          <Tag label={t('search.seatsLeft', { count: ride.seatsAvailable })} tone="gray" />
          <Tag label={ride.bookingMode === 'INSTANT' ? t('search.instant') : t('search.request')} tone="blue" />
          {ride.womenOnly ? <Tag label={t('search.womenOnly')} tone="sand" /> : null}
        </View>
      </Card>

      {ride.status === 'CANCELLED' ? (
        <Notice tone="error" icon="close" text={ride.cancelReason ? t('ride.cancelledReason', { reason: ride.cancelReason }) : t('ride.closed')} />
      ) : null}

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={ride.driver.displayName} />
          <View style={{ flex: 1 }}>
            <T variant="caption" muted>{t('ride.driver')}</T>
            <T weight={600}>{ride.driver.displayName}</T>
            <T variant="caption" muted>
              {ride.driver.ridesCompleted > 0 ? t('ride.trips', { count: ride.driver.ridesCompleted }) : t('ride.newMember')}
            </T>
          </View>
        </View>
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T variant="caption" muted>{t('ride.car')}</T>
            <T weight={600}>
              {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.color} · {ride.vehicle.year}
            </T>
          </View>
          {ride.vehicle.plate ? (
            <View style={{ borderWidth: 1.5, borderColor: colors.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }} accessibilityLabel={`${t('ride.plate')}: ${ride.vehicle.plate}`}>
              <T weight={700}>{ride.vehicle.plate}</T>
            </View>
          ) : null}
        </View>
        {!ride.vehicle.plate && !ride.isMine ? <T variant="caption" muted>{t('ride.plateHidden')}</T> : null}
      </Card>

      {ride.notes ? (
        <Card style={{ gap: 6 }}>
          <T variant="caption" muted>{t('ride.notes')}</T>
          <T>{ride.notes}</T>
        </Card>
      ) : null}

      <View style={{ gap: 8 }}>
        <T variant="h3">{t('ride.preferences')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ride.preferences.quietRides ? <Tag label={t('ride.prefQuiet')} tone="gray" /> : null}
          {ride.preferences.musicOk ? <Tag label={t('ride.prefMusic')} tone="gray" /> : null}
          {ride.preferences.acPreferred ? <Tag label={t('ride.prefAc')} tone="gray" /> : null}
          <Tag label={ride.preferences.smokingOk ? t('ride.prefSmoking') : t('ride.prefNoSmoking')} tone="gray" />
        </View>
      </View>

      {ride.isMine ? <DriverPanel ride={ride} /> : <PassengerPanel ride={ride} />}
    </Screen>
  );
}

// ---------- Passenger ----------

function PassengerPanel({ ride }: { ride: RideDetailDto }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const refreshLists = useRefreshLists();
  const [seats, setSeats] = useState(1);
  const [note, setNote] = useState('');
  // One key per booking attempt: a network retry reuses it, so the server never books twice.
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);

  const book = useMutation({
    mutationFn: () => bookingsApi.create(ride.id, { seats, pickupNote: note.trim() || undefined }, attemptKey),
    onSuccess: () => {
      setAttemptKey(newIdempotencyKey());
      void qc.invalidateQueries({ queryKey: rideKey(ride.id) });
      refreshLists();
    },
  });
  const cancel = useMutation({
    mutationFn: (bookingId: string) => bookingsApi.cancel(bookingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rideKey(ride.id) });
      refreshLists();
    },
  });

  const mine = ride.myBooking;
  const active = mine && (mine.status === 'PENDING' || mine.status === 'CONFIRMED');

  if (active) {
    const pending = mine.status === 'PENDING';
    return (
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T variant="h3" style={{ flex: 1 }}>{pending ? t('ride.requested') : t('ride.booked')}</T>
          <StatusTag booking={mine.status} />
        </View>
        <T muted>{pending && mine.expiresAt ? t('ride.requestedBody', { time: f.dayTime(mine.expiresAt) }) : t('ride.bookedBody')}</T>
        <View style={{ flexDirection: 'row' }}>
          <T style={{ flex: 1 }}>{t('trips.seatsBooked', { count: mine.seats })}</T>
          <T weight={700}>{f.money(mine.totalPiasters)}</T>
        </View>
        {mine.pickupNote ? <T variant="meta" muted>“{mine.pickupNote}”</T> : null}
        <Notice tone="info" icon="cash" text={t('ride.payCash')} />
        <Button title={t('chat.openChat')} kind="tonal" icon="chat" onPress={() => openChat(mine.id)} />
        {cancel.error ? <Notice tone="error" icon="close" text={cancel.error.message} /> : null}
        <Button
          title={t('ride.cancelBooking')}
          kind="secondary"
          loading={cancel.isPending}
          onPress={() => confirm(t('ride.cancelBooking'), t('ride.cancelBookingConfirm'), t('ride.cancelBooking'), t('common.back'), () => cancel.mutate(mine.id))}
        />
      </Card>
    );
  }

  if (ride.status !== 'SCHEDULED') {
    return (
      <View style={{ gap: 8 }}>
        {mine ? <StatusTag booking={mine.status} /> : null}
        <Notice tone="neutral" icon="lock" text={t('ride.closed')} />
        {mine?.status === 'COMPLETED' ? <Button title={t('chat.openChat')} kind="tonal" icon="chat" onPress={() => openChat(mine.id)} /> : null}
      </View>
    );
  }
  if (ride.seatsAvailable === 0) return <Notice tone="warn" icon="users" text={t('ride.full')} />;

  const maxSeats = Math.min(RIDE_RULES.maxSeatsPerBooking, ride.seatsAvailable);
  return (
    <Card style={{ gap: 12 }}>
      {mine ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <T variant="caption" muted>{t('ride.yourBooking')}:</T>
          <StatusTag booking={mine.status} />
        </View>
      ) : null}
      <Stepper label={t('ride.seats')} value={Math.min(seats, maxSeats)} min={1} max={maxSeats} onChange={setSeats} />
      <Field label={t('ride.pickupNote')} placeholder={t('ride.pickupNotePlaceholder')} value={note} onChangeText={setNote} maxLength={140} />
      <Notice tone="info" icon="cash" text={t('ride.payCash')} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T muted style={{ flex: 1 }}>{t('ride.total')}</T>
        <T style={{ fontFamily: fonts.display[700], fontSize: 20 }}>{f.money(ride.pricePerSeatPiasters * Math.min(seats, maxSeats))}</T>
      </View>
      {book.error ? <Notice tone="error" icon="close" text={book.error.message} /> : null}
      <Button
        title={ride.bookingMode === 'INSTANT' ? t('ride.book') : t('ride.sendRequest')}
        icon="check"
        loading={book.isPending}
        onPress={() => {
          if (seats > maxSeats) setSeats(maxSeats);
          book.mutate();
        }}
      />
    </Card>
  );
}

// ---------- Driver ----------

function DriverPanel({ ride }: { ride: RideDetailDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refreshLists = useRefreshLists();
  const booked = ride.seatsTotal - ride.seatsAvailable;
  const [seats, setSeats] = useState(ride.seatsTotal);
  const open = ride.status === 'SCHEDULED';
  const departed = new Date(ride.departureAt).getTime() <= Date.now();

  const onRide = (updated: RideDetailDto) => {
    qc.setQueryData(rideKey(ride.id), updated);
    refreshLists();
  };
  const update = useMutation({ mutationFn: () => ridesApi.update(ride.id, { seats }), onSuccess: onRide });
  const cancel = useMutation({ mutationFn: () => ridesApi.cancel(ride.id), onSuccess: onRide });
  const complete = useMutation({ mutationFn: () => ridesApi.complete(ride.id), onSuccess: onRide });
  const err = update.error ?? cancel.error ?? complete.error;

  return (
    <View style={{ gap: 14 }}>
      <T variant="h3">{t('ride.passengers')}</T>
      {ride.bookings && ride.bookings.length > 0 ? (
        ride.bookings.map((b) => <PassengerRow key={b.id} booking={b} rideId={ride.id} canAnswer={open} />)
      ) : (
        <T muted>{t('ride.noPassengers')}</T>
      )}

      {err ? <Notice tone="error" icon="close" text={err.message} /> : null}

      {open ? (
        <>
          <Card style={{ gap: 12 }}>
            <Stepper label={t('ride.changeSeats')} value={seats} min={Math.max(1, booked)} max={ride.vehicle.seats} onChange={setSeats} />
            {seats !== ride.seatsTotal ? <Button title={t('ride.saveSeats')} kind="tonal" loading={update.isPending} onPress={() => update.mutate()} /> : null}
          </Card>
          {departed ? (
            <Button title={t('ride.completeRide')} icon="check" loading={complete.isPending} onPress={() => complete.mutate()} />
          ) : (
            <T variant="caption" muted>{t('ride.completeHint')}</T>
          )}
          <Button
            title={t('ride.cancelRide')}
            kind="secondary"
            loading={cancel.isPending}
            onPress={() => confirm(t('ride.cancelRide'), t('ride.cancelRideConfirm'), t('ride.cancelRide'), t('common.back'), () => cancel.mutate())}
          />
        </>
      ) : null}
    </View>
  );
}

function PassengerRow({ booking, rideId, canAnswer }: { booking: DriverBookingDto; rideId: string; canAnswer: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const refreshLists = useRefreshLists();
  const after = () => {
    void qc.invalidateQueries({ queryKey: rideKey(rideId) });
    refreshLists();
  };
  const accept = useMutation({ mutationFn: () => bookingsApi.accept(booking.id), onSuccess: after });
  const decline = useMutation({ mutationFn: () => bookingsApi.decline(booking.id), onSuccess: after });
  const err = accept.error ?? decline.error;

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={booking.passenger.displayName} size={36} />
        <View style={{ flex: 1 }}>
          <T weight={600}>{booking.passenger.displayName}</T>
          <T variant="caption" muted>
            {t('trips.seatsBooked', { count: booking.seats })} · {f.money(booking.totalPiasters)}
          </T>
        </View>
        <StatusTag booking={booking.status} />
      </View>
      {booking.pickupNote ? <T variant="meta" muted>“{booking.pickupNote}”</T> : null}
      {booking.status === 'PENDING' && booking.expiresAt ? <T variant="caption" muted>⏱ {f.dayTime(booking.expiresAt)}</T> : null}
      {err ? <Notice tone="error" icon="close" text={err.message} /> : null}
      {booking.status === 'PENDING' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' ? (
        <Button title={t('chat.openChat')} kind="ghost" icon="chat" onPress={() => openChat(booking.id)} />
      ) : null}
      {canAnswer && booking.status === 'PENDING' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('ride.decline')} kind="secondary" style={{ flex: 1 }} loading={decline.isPending} disabled={accept.isPending} onPress={() => decline.mutate()} />
          <Button title={t('ride.accept')} style={{ flex: 1 }} loading={accept.isPending} disabled={decline.isPending} onPress={() => accept.mutate()} />
        </View>
      ) : null}
    </Card>
  );
}
