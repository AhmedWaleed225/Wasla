import { useMutation } from '@tanstack/react-query';
import type { LocationDto, UserRole } from '@wasla/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { meApi } from '../../src/api/endpoints';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Avatar, Button, Card, Chip, Notice, Segmented, T } from '../../src/components/ui';
import { usePlaceName, useSavedPlaces } from '../../src/hooks/useSavedPlaces';
import { useAuth } from '../../src/stores/auth';
import { useTripDraft } from '../../src/stores/trip-draft';
import { colors, space } from '../../src/theme';

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'home.greetingMorning' : h < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';
}

function PlaceSlot({ label, placeholder, value, onPress, dot }: { label: string; placeholder: string; value: string | null; onPress: () => void; dot: 'from' | 'to' }) {
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

export default function Home() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
  const { from, to, set, swap } = useTripDraft();
  const { data: saved } = useSavedPlaces();
  const names = usePlaceName();
  const isDriver = me.activeRole === 'DRIVER';

  // Prefill Home → Work the first time saved places arrive.
  useEffect(() => {
    if (!saved || from || to) return;
    const home = saved.find((s) => s.label === 'HOME')?.location;
    const work = saved.find((s) => s.label === 'WORK')?.location;
    if (home) set('from', home);
    if (work) set('to', work);
  }, [saved, from, to, set]);

  const switchRole = useMutation({
    mutationFn: (role: UserRole) => meApi.setActiveRole(role),
    onSuccess: setMe,
  });
  const enableDriving = useMutation({
    mutationFn: async () => {
      await meApi.enableDriving();
      return meApi.setActiveRole('DRIVER');
    },
    onSuccess: setMe,
  });

  // Shown when someone taps "Offer a ride" before opting in to driving.
  const [driverPrompt, setDriverPrompt] = useState(false);

  const onRoleChange = (role: UserRole) => {
    if (role === 'PASSENGER') setDriverPrompt(false);
    if (role === me.activeRole) return;
    if (role === 'DRIVER' && !me.roles.includes('DRIVER')) {
      enableDriving.reset();
      setDriverPrompt(true);
      return;
    }
    switchRole.mutate(role);
  };

  const pick = (field: 'from' | 'to') => router.push({ pathname: '/location-search', params: { purpose: field } });
  const fromName = from ? names.name(from) : null;
  const toName = to ? names.name(to) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: space.xs }}>
        <Avatar name={me.profile?.fullName} size={40} />
        <View style={{ flex: 1 }}>
          <T variant="caption" muted>{t(greetingKey())}</T>
          <T variant="h3">{me.profile?.fullName.split(' ')[0]}</T>
        </View>
      </View>

      <Segmented<UserRole>
        options={[
          { value: 'PASSENGER', label: t('home.findRide') },
          { value: 'DRIVER', label: t('home.offerRide') },
        ]}
        value={driverPrompt ? 'DRIVER' : me.activeRole}
        onChange={onRoleChange}
      />
      {switchRole.error ? <Notice tone="error" icon="close" text={switchRole.error.message} /> : null}

      {driverPrompt && !me.roles.includes('DRIVER') ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="car" color={colors.warning} />
            <T variant="h3" style={{ flex: 1 }}>{t('home.driverOff')}</T>
          </View>
          <T variant="meta" color={colors.textTertiary}>{t('home.driverOffBody')}</T>
          <Button title={t('home.enableDriving')} onPress={() => enableDriving.mutate(undefined, { onSuccess: () => setDriverPrompt(false) })} loading={enableDriving.isPending} />
          {enableDriving.error ? <Notice tone="error" icon="close" text={enableDriving.error.message} /> : null}
        </Card>
      ) : isDriver ? (
        <Notice tone="warn" icon="car" text={t('home.driverPending')} />
      ) : (
        <Card style={{ paddingTop: 6, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <PlaceSlot label={t('home.from')} placeholder={t('home.choosePickup')} value={fromName} onPress={() => pick('from')} dot="from" />
              <View style={{ height: 1, backgroundColor: colors.line, marginStart: 24 }} />
              <PlaceSlot label={t('home.to')} placeholder={t('home.chooseDestination')} value={toName} onPress={() => pick('to')} dot="to" />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Swap" onPress={swap} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="swap" />
            </Pressable>
          </View>
          <Button title={t('home.searchRides')} icon="search" disabled style={{ marginTop: 8 }} />
          <T variant="caption" muted style={{ textAlign: 'center' }}>{t('home.searchSoon')}</T>
        </Card>
      )}

      {!isDriver && saved && saved.length > 0 ? (
        <View style={{ gap: 8 }}>
          <T variant="h3">{t('home.savedPlaces')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {saved
              .filter((s) => s.location)
              .map((s) => (
                <Chip
                  key={s.id}
                  icon={s.label === 'HOME' ? 'home' : s.label === 'WORK' ? 'briefcase' : 'pin'}
                  label={names.saved(s)}
                  onPress={() => set(from ? 'to' : 'from', s.location as LocationDto)}
                />
              ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

