import { useMutation } from '@tanstack/react-query';
import type { LocationDto, UserRole } from '@wasla/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { meApi } from '../../src/api/endpoints';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { SearchCard } from '../../src/components/SearchCard';
import { Avatar, Button, Card, Chip, Notice, Segmented, T } from '../../src/components/ui';
import { usePlaceName, useSavedPlaces } from '../../src/hooks/useSavedPlaces';
import { useUnreadNotifications } from '../../src/hooks/useUnread';
import { useAuth } from '../../src/stores/auth';
import { useTripDraft } from '../../src/stores/trip-draft';
import { colors, space } from '../../src/theme';

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'home.greetingMorning' : h < 18 ? 'home.greetingAfternoon' : 'home.greetingEvening';
}

export default function Home() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
  const { from, to, set } = useTripDraft();
  const { data: saved } = useSavedPlaces();
  const names = usePlaceName();
  const isDriver = me.activeRole === 'DRIVER';
  const unread = useUnreadNotifications();

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


  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: space.xs }}>
        <Avatar name={me.profile?.fullName} size={40} />
        <View style={{ flex: 1 }}>
          <T variant="caption" muted>{t(greetingKey())}</T>
          <T variant="h3">{me.profile?.fullName.split(' ')[0]}</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('notifications.title')}${unread ? `: ${unread}` : ''}`}
          onPress={() => router.push('/notifications')}
          hitSlop={6}
          style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="bell" />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: 6, end: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
              <T variant="caption" color="#fff" weight={700} style={{ fontSize: 10, lineHeight: 14 }}>{unread > 9 ? '9+' : unread}</T>
            </View>
          ) : null}
        </Pressable>
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
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="car" color={colors.primary} />
            <T variant="h3" style={{ flex: 1 }}>{t('home.driverPending')}</T>
          </View>
          <T variant="meta" color={colors.textTertiary}>{t('home.driverHint')}</T>
          <Button title={t('home.offerCta')} icon="plus" onPress={() => router.push('/explore')} />
          <Button title={t('home.myRides')} kind="secondary" icon="calendar" onPress={() => router.push('/trips')} />
        </Card>
      ) : (
        <SearchCard />
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

