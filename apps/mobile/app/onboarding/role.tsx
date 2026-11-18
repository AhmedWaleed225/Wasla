import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { meApi } from '../../src/api/endpoints';
import { Icon, type IconName } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, Chip, Notice, T } from '../../src/components/ui';
import { useAuth } from '../../src/stores/auth';
import { useOnboarding } from '../../src/stores/onboarding';
import { colors, radius, space } from '../../src/theme';

function Choice({ icon, title, hint, selected, onPress, tint }: { icon: IconName; title: string; hint: string; selected: boolean; onPress: () => void; tint: [string, string] }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.line }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint[0], alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={tint[1]} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="h3">{title}</T>
        <T variant="meta" muted>{hint}</T>
      </View>
      {selected ? <Icon name="check" color={colors.primary} /> : null}
    </Pressable>
  );
}

export default function RoleStep() {
  const { t } = useTranslation();
  const draft = useOnboarding();
  const setMe = useAuth((s) => s.setMe);
  const [drive, setDrive] = useState(false);
  const [prefs, setPrefs] = useState({ quietRides: false, musicOk: true, acPreferred: true, smokingOk: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Reached directly (e.g. after an app restart): go back to step 1.
  if (!draft.gender) return <Redirect href="/onboarding/profile" />;

  const finish = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const me = await meApi.createProfile({
        fullName: draft.fullName,
        dateOfBirth: draft.dateOfBirth,
        gender: draft.gender!,
        preferences: prefs,
        wantsToDrive: drive,
      });
      setMe(me);
      router.replace('/onboarding/permissions');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (k: keyof typeof prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <Screen back footer={<Button title={t('roleSetup.finish')} onPress={finish} loading={saving} />}>
      <View style={{ gap: 6 }}>
        <T variant="caption" muted>{t('profileSetup.step', { n: 2, total: 2 })}</T>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
      </View>
      <T variant="h1" accessibilityRole="header">{t('roleSetup.title')}</T>
      <Choice icon="users" title={t('roleSetup.passenger')} hint={t('roleSetup.passengerHint')} selected onPress={() => undefined} tint={[colors.primaryTint, colors.primary]} />
      <Choice icon="car" title={t('roleSetup.driver')} hint={t('roleSetup.driverHint')} selected={drive} onPress={() => setDrive((d) => !d)} tint={[colors.accentTint, colors.warning]} />
      <T variant="caption" muted>{t('roleSetup.switchHint')}</T>
      <T variant="h3" style={{ marginTop: space.xs }}>{t('roleSetup.vibe')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('roleSetup.quiet')} selected={prefs.quietRides} onPress={() => toggle('quietRides')} />
        <Chip label={t('roleSetup.music')} selected={prefs.musicOk} onPress={() => toggle('musicOk')} />
        <Chip label={t('roleSetup.ac')} selected={prefs.acPreferred} onPress={() => toggle('acPreferred')} />
        <Chip label={t('roleSetup.noSmoking')} selected={!prefs.smokingOk} onPress={() => toggle('smokingOk')} />
      </View>
      {error ? <Notice tone="error" icon="close" text={error} /> : null}
    </Screen>
  );
}
