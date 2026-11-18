import { useMutation } from '@tanstack/react-query';
import { fullNameSchema } from '@wasla/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { fieldMessage } from '../src/api/client';
import { meApi } from '../src/api/endpoints';
import { Screen } from '../src/components/Screen';
import { Button, Chip, Field, Notice, T } from '../src/components/ui';
import { useAuth } from '../src/stores/auth';
import { space } from '../src/theme';

export default function EditProfile() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.me)!;
  const setMe = useAuth((s) => s.setMe);
  const p = me.profile!;
  const [fullName, setFullName] = useState(p.fullName);
  const [bio, setBio] = useState(p.bio ?? '');
  const [prefs, setPrefs] = useState(p.preferences);
  const [nameError, setNameError] = useState<string | undefined>();

  const save = useMutation({
    mutationFn: () => meApi.updateProfile({ fullName, bio, preferences: prefs }),
    onSuccess: (updated) => {
      setMe(updated);
      router.back();
    },
  });

  const onSave = () => {
    const parsed = fullNameSchema.safeParse(fullName);
    if (!parsed.success) {
      setNameError(fieldMessage(parsed.error.issues[0]?.message));
      return;
    }
    setNameError(undefined);
    save.mutate();
  };
  const toggle = (k: keyof typeof prefs) => setPrefs((v) => ({ ...v, [k]: !v[k] }));

  return (
    <Screen title={t('profile.edit')} back footer={<Button title={t('common.save')} onPress={onSave} loading={save.isPending} />}>
      <Field label={t('profileSetup.fullName')} value={fullName} onChangeText={setFullName} error={nameError} />
      <Field label={t('profile.bio')} value={bio} onChangeText={setBio} placeholder={t('profile.bioPlaceholder')} maxLength={280} multiline />
      <T variant="h3" style={{ marginTop: space.xs }}>{t('roleSetup.vibe')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={t('roleSetup.quiet')} selected={prefs.quietRides} onPress={() => toggle('quietRides')} />
        <Chip label={t('roleSetup.music')} selected={prefs.musicOk} onPress={() => toggle('musicOk')} />
        <Chip label={t('roleSetup.ac')} selected={prefs.acPreferred} onPress={() => toggle('acPreferred')} />
        <Chip label={t('roleSetup.noSmoking')} selected={!prefs.smokingOk} onPress={() => toggle('smokingOk')} />
      </View>
      {save.error ? <Notice tone="error" icon="close" text={save.error.message} /> : null}
    </Screen>
  );
}
