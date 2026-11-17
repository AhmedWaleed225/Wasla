import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { Icon, type IconName } from '../../src/components/Icon';
import { useAuth } from '../../src/stores/auth';
import { colors, fonts } from '../../src/theme';

const icon = (name: IconName) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} />;
  };

export default function TabsLayout() {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const me = useAuth((s) => s.me);
  if (status !== 'signedIn') return <Redirect href="/" />;
  if (!me?.profile) return <Redirect href="/onboarding/profile" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: fonts.body[600], fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.ground },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="explore" options={{ title: me.activeRole === 'DRIVER' ? t('tabs.offer') : t('tabs.explore'), tabBarIcon: icon(me.activeRole === 'DRIVER' ? 'plus' : 'search') }} />
      <Tabs.Screen name="trips" options={{ title: t('tabs.trips'), tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages'), tabBarIcon: icon('chat') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
