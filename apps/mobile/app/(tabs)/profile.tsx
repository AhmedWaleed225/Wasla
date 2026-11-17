import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Screen } from '../../src/components/Screen';
import { Avatar, Card, Divider, Row, T, Tag } from '../../src/components/ui';
import { useAuth } from '../../src/stores/auth';
import { colors, space } from '../../src/theme';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T variant="price">{value}</T>
      <T variant="caption" muted>{label}</T>
    </View>
  );
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const me = useAuth((s) => s.me)!;
  const p = me.profile!;
  const since = new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', year: 'numeric' }).format(new Date(me.createdAt));
  const fmt = new Intl.NumberFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB');

  return (
    <Screen>
      <T variant="h1" style={{ paddingTop: space.xs }} accessibilityRole="header">{t('profile.title')}</T>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={p.fullName} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="h2">{p.displayName}</T>
            <T variant="meta" muted>{t('profile.memberSince', { date: since })}</T>
          </View>
        </View>
        <Divider />
        <View style={{ flexDirection: 'row' }}>
          <Stat value={me.stats.ratingAverage !== null ? fmt.format(me.stats.ratingAverage) : t('profile.noRating')} label={t('profile.rating')} />
          <Stat value={fmt.format(me.stats.ridesCompleted)} label={t('profile.rides')} />
        </View>
        <Tag label={t('profile.phoneVerified')} />
      </Card>
      <Card style={{ paddingVertical: 2 }}>
        <Row icon="user" title={t('profile.personalInfo')} onPress={() => router.push('/edit-profile')} />
        <Divider />
        <Row icon="pin" title={t('profile.savedPlaces')} onPress={() => router.push('/saved-places')} />
        <Divider />
        <Row icon="gear" title={t('profile.settings')} onPress={() => router.push('/settings')} />
      </Card>
      {me.roles.includes('DRIVER') ? <T variant="caption" color={colors.textSecondary}>{t('home.driverPending')}</T> : null}
    </Screen>
  );
}
