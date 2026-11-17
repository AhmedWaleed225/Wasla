import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, T } from '../src/components/ui';
import { hasChosenLanguage } from '../src/i18n';
import { useAuth } from '../src/stores/auth';
import { colors, space } from '../src/theme';

/** Decides where the user starts: language → welcome → profile setup → home. */
export default function Index() {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const me = useAuth((s) => s.me);
  const bootstrap = useAuth((s) => s.bootstrap);
  const [languageChosen, setLanguageChosen] = useState<boolean | null>(null);

  useEffect(() => {
    void hasChosenLanguage().then(setLanguageChosen);
  }, []);

  if (status === 'loading' || languageChosen === null) return null;

  if (status === 'offline') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md, backgroundColor: colors.ground }}>
        <T variant="h2" style={{ textAlign: 'center' }}>{t('errors.network')}</T>
        <Button title={t('common.retry')} onPress={() => void bootstrap()} />
      </View>
    );
  }

  if (status === 'signedOut') return <Redirect href={languageChosen ? '/welcome' : '/language'} />;
  if (!me?.profile) return <Redirect href="/onboarding/profile" />;
  return <Redirect href="/home" />;
}
