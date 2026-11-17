import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Icon, LogoMark, type IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, T } from '../../src/components/ui';
import { colors, space } from '../../src/theme';

function Point({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={colors.primary} />
      </View>
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export default function Welcome() {
  const { t } = useTranslation();
  return (
    <Screen footer={<Button title={t('welcome.getStarted')} onPress={() => router.push('/phone')} />}>
      <View style={{ alignItems: 'center', paddingVertical: space.xxxl, gap: space.sm }}>
        <LogoMark size={88} />
        <T variant="h1" color={colors.primary}>{t('brand.name')}</T>
      </View>
      <T variant="h1">{t('welcome.title')}</T>
      <Point icon="search" text={t('welcome.point1')} />
      <Point icon="pin" text={t('welcome.point2')} />
      <Point icon="cash" text={t('welcome.point3')} />
    </Screen>
  );
}
