import { useMutation } from '@tanstack/react-query';
import type { Locale, UpdateProfileInput } from '@wasla/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { meApi } from '../src/api/endpoints';
import { Screen } from '../src/components/Screen';
import { Card, Divider, Notice, Row, Segmented, T, ToggleRow } from '../src/components/ui';
import { setLanguage } from '../src/i18n';
import { useAuth } from '../src/stores/auth';
import { space } from '../src/theme';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
  const signOut = useAuth((s) => s.signOut);
  const [error, setError] = useState<string | undefined>();

  const update = useMutation({
    mutationFn: (input: UpdateProfileInput) => meApi.updateProfile(input),
    onSuccess: setMe,
    onError: (e) => setError(e.message),
  });

  const changeLanguage = async (lang: Locale) => {
    if (lang === i18n.language) return;
    try {
      // Save on the server first so SMS and notifications follow the new language.
      setMe(await meApi.updateProfile({ locale: lang }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    await setLanguage(lang); // reloads the app when the direction changes
  };

  const logout = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <Screen title={t('settings.title')} back>
      {error ? <Notice tone="error" icon="close" text={error} /> : null}
      <T variant="label" muted>{t('settings.language')}</T>
      <Segmented<Locale>
        options={[
          { value: 'ar', label: 'العربية' },
          { value: 'en', label: 'English' },
        ]}
        value={i18n.language === 'en' ? 'en' : 'ar'}
        onChange={changeLanguage}
      />
      <T variant="caption" muted>{t('settings.languageRestart')}</T>

      <T variant="label" muted style={{ marginTop: space.sm }}>{t('settings.privacy')}</T>
      <Card style={{ paddingVertical: 4 }}>
        <ToggleRow
          label={t('settings.showFullLastName')}
          hint={t('settings.showFullLastNameHint')}
          value={me.profile!.showFullLastName}
          onChange={(v) => update.mutate({ showFullLastName: v })}
          disabled={update.isPending}
        />
        <Divider />
        <ToggleRow label={t('settings.showGender')} value={me.profile!.showGender} onChange={(v) => update.mutate({ showGender: v })} disabled={update.isPending} />
      </Card>

      <Card style={{ paddingVertical: 2, marginTop: space.sm }}>
        <Row icon="logout" title={t('settings.logout')} onPress={logout} danger trailing={null} />
      </Card>
      <T variant="caption" muted style={{ textAlign: 'center' }}>{t('settings.version', { version: Constants.expoConfig?.version ?? '' })}</T>
    </Screen>
  );
}
