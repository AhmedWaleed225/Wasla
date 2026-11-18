import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Icon, type IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, Card, T } from '../../src/components/ui';
import { colors, space } from '../../src/theme';

type PermState = 'unknown' | 'granted' | 'denied';

function PermissionCard({ icon, title, body, action, state, onRequest, tint }: { icon: IconName; title: string; body: string; action: string; state: PermState; onRequest: () => void; tint: [string, string] }) {
  const { t } = useTranslation();
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint[0], alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} color={tint[1]} />
        </View>
        <T variant="h3" style={{ flex: 1 }}>{title}</T>
        {state === 'granted' ? <Icon name="check" color={colors.success} /> : null}
      </View>
      <T variant="meta" color={colors.textTertiary}>{body}</T>
      {state === 'unknown' ? (
        <Button title={action} onPress={onRequest} kind={icon === 'pin' ? 'primary' : 'secondary'} />
      ) : (
        <T variant="meta" weight={600} color={state === 'granted' ? colors.success : colors.textSecondary}>
          {state === 'granted' ? t('permissions.granted') : t('permissions.denied')}
        </T>
      )}
    </Card>
  );
}

export default function PermissionsStep() {
  const { t } = useTranslation();
  const [loc, setLoc] = useState<PermState>('unknown');
  const [notif, setNotif] = useState<PermState>('unknown');

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) => p.status !== 'undetermined' && setLoc(p.granted ? 'granted' : 'denied'));
    void Notifications.getPermissionsAsync().then((p) => p.status !== 'undetermined' && setNotif(p.granted ? 'granted' : 'denied'));
  }, []);

  const askLocation = async () => setLoc((await Location.requestForegroundPermissionsAsync()).granted ? 'granted' : 'denied');
  const askNotifications = async () => setNotif((await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied');
  const done = loc !== 'unknown' && notif !== 'unknown';

  return (
    <Screen
      footer={<Button title={done ? t('permissions.done') : t('common.notNow')} kind={done ? 'primary' : 'ghost'} onPress={() => router.replace('/home')} />}
    >
      <View style={{ paddingTop: space.xxl, gap: 6 }}>
        <T variant="h1" accessibilityRole="header">{t('permissions.title')}</T>
        <T muted>{t('permissions.subtitle')}</T>
      </View>
      <PermissionCard icon="pin" title={t('permissions.locationTitle')} body={t('permissions.locationBody')} action={t('permissions.allowLocation')} state={loc} onRequest={askLocation} tint={[colors.primaryTint, colors.primary]} />
      <PermissionCard icon="bell" title={t('permissions.notificationsTitle')} body={t('permissions.notificationsBody')} action={t('permissions.allowNotifications')} state={notif} onRequest={askNotifications} tint={[colors.accentTint, colors.warning]} />
    </Screen>
  );
}
