import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Button, Card, Row, T } from '../src/components/ui';
import { useFormat } from '../src/format';
import { colors } from '../src/theme';

/** Emergency numbers in Egypt (from the safety design board). */
const NUMBERS = [
  { number: '122', key: 'safety.police' },
  { number: '123', key: 'safety.ambulance' },
] as const;

export default function Safety() {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <Screen title={t('safety.title')} back>
      <T variant="h3">{t('safety.emergency')}</T>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {NUMBERS.map((n) => (
          <Card key={n.number} style={{ flex: 1, alignItems: 'center', gap: 6, borderColor: colors.danger }}>
            <T style={{ fontSize: 28, fontWeight: '700', color: colors.danger }}>{f.number(Number(n.number))}</T>
            <T muted>{t(n.key)}</T>
            <Button
              title={t('safety.call', { number: f.number(Number(n.number)) })}
              kind="danger"
              icon="phone"
              style={{ alignSelf: 'stretch' }}
              onPress={() => void Linking.openURL(`tel:${n.number}`)}
            />
          </Card>
        ))}
      </View>

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="flag" color={colors.primary} />
          <T variant="h3" style={{ flex: 1 }}>{t('safety.reportTitle')}</T>
        </View>
        <T muted>{t('safety.reportBody')}</T>
        <Button title={t('tabs.trips')} kind="tonal" icon="calendar" onPress={() => router.push('/trips')} />
      </Card>

      <Card style={{ gap: 10 }}>
        <T variant="h3">{t('safety.tipsTitle')}</T>
        {(['safety.tip1', 'safety.tip2', 'safety.tip3'] as const).map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="shield" color={colors.primary} />
            <T style={{ flex: 1 }}>{t(k)}</T>
          </View>
        ))}
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <Row icon="lock" title={t('safety.blocked')} onPress={() => router.push('/blocked-users')} />
      </Card>
    </Screen>
  );
}
