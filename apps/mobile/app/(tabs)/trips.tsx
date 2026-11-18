import { useQuery } from '@tanstack/react-query';
import type { ListScope } from '@wasla/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { bookingsApi, ridesApi } from '../../src/api/endpoints';
import { EmptyState, RideCard, StatusTag } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Button, Notice, Segmented, T } from '../../src/components/ui';
import { useFormat } from '../../src/format';
import { useAuth } from '../../src/stores/auth';
import { colors, space } from '../../src/theme';

type Side = 'passenger' | 'driver';

export default function Trips() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAuth((s) => s.me)!;
  const canDrive = me.roles.includes('DRIVER');
  const [side, setSide] = useState<Side>(me.activeRole === 'DRIVER' ? 'driver' : 'passenger');
  const [scope, setScope] = useState<ListScope>('upcoming');
  const showDriver = canDrive && side === 'driver';

  const bookings = useQuery({ queryKey: ['bookings', scope], queryFn: () => bookingsApi.mine(scope), enabled: !showDriver });
  const rides = useQuery({ queryKey: ['rides', 'mine', scope], queryFn: () => ridesApi.mine(scope), enabled: showDriver });
  const active = showDriver ? rides : bookings;
  const open = (id: string) => router.push({ pathname: '/rides/[id]', params: { id } });

  const empty = (
    <EmptyState
      icon="calendar"
      title={scope === 'upcoming' ? t('trips.emptyUpcoming') : t('trips.emptyPast')}
      action={
        scope === 'upcoming' ? (
          <Button
            title={showDriver ? t('trips.offerRide') : t('trips.findRide')}
            kind="secondary"
            onPress={() => router.push('/explore')}
          />
        ) : undefined
      }
    />
  );

  return (
    <Screen scroll={false}>
      <T variant="h1" accessibilityRole="header">{t('trips.title')}</T>
      {canDrive ? (
        <Segmented<Side>
          options={[
            { value: 'passenger', label: t('trips.asPassenger') },
            { value: 'driver', label: t('trips.asDriver') },
          ]}
          value={side}
          onChange={setSide}
        />
      ) : null}
      <Segmented<ListScope>
        options={[
          { value: 'upcoming', label: t('trips.upcoming') },
          { value: 'past', label: t('trips.past') },
        ]}
        value={scope}
        onChange={setScope}
      />
      {active.isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.lg }} />
      ) : active.error ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" icon="close" text={active.error.message} />
          <Button title={t('common.retry')} kind="secondary" onPress={() => active.refetch()} />
        </View>
      ) : showDriver ? (
        <FlatList
          data={rides.data ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ gap: 12, paddingBottom: space.lg }}
          refreshing={rides.isRefetching}
          onRefresh={() => rides.refetch()}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <RideCard
              ride={item}
              onPress={() => open(item.id)}
              footer={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <StatusTag ride={item.status} />
                  <T variant="caption" muted>
                    {t('trips.bookedOf', { booked: f.number(item.seatsTotal - item.seatsAvailable), total: f.number(item.seatsTotal) })}
                  </T>
                </View>
              }
            />
          )}
        />
      ) : (
        <FlatList
          data={bookings.data ?? []}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ gap: 12, paddingBottom: space.lg }}
          refreshing={bookings.isRefetching}
          onRefresh={() => bookings.refetch()}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <RideCard
              ride={item.ride}
              onPress={() => open(item.rideId)}
              footer={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <StatusTag booking={item.status} />
                  <T variant="caption" muted style={{ flex: 1 }}>{t('trips.seatsBooked', { count: item.seats })}</T>
                  <T weight={700}>{f.money(item.totalPiasters)}</T>
                </View>
              }
            />
          )}
        />
      )}
    </Screen>
  );
}
