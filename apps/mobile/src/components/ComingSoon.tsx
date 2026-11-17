import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { colors, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { Screen } from './Screen';
import { T } from './ui';

/** Honest placeholder for tabs whose features are scheduled for a later phase. */
export function ComingSoon({ title, body, icon }: { title: string; body: string; icon: IconName }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <T variant="h1" style={{ paddingTop: space.xs }} accessibilityRole="header">{title}</T>
      <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.xxxl }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={32} color={colors.textSecondary} />
        </View>
        <T variant="h2" style={{ textAlign: 'center' }}>{t('comingSoon.title')}</T>
        <T muted style={{ textAlign: 'center' }}>{body}</T>
      </View>
    </Screen>
  );
}
