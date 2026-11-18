import { zodResolver } from '@hookform/resolvers/zod';
import { dateOfBirthSchema, fullNameSchema, toAsciiDigits, type Gender } from '@wasla/shared';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';
import { fieldMessage } from '../../src/api/client';
import { Screen } from '../../src/components/Screen';
import { Button, Field, Segmented, T } from '../../src/components/ui';
import { useOnboarding } from '../../src/stores/onboarding';
import { colors, space } from '../../src/theme';

const schema = z.object({
  fullName: fullNameSchema,
  dateOfBirth: z.string().transform((v) => toAsciiDigits(v).trim()).pipe(dateOfBirthSchema),
  gender: z.enum(['FEMALE', 'MALE'], { message: 'VALIDATION_FAILED' }),
});
type Form = z.input<typeof schema>;

/** Auto-inserts dashes while typing a date: 19990314 -> 1999-03-14. */
function formatDob(v: string) {
  const d = toAsciiDigits(v).replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

export default function ProfileStep() {
  const { t } = useTranslation();
  const draft = useOnboarding();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: draft.fullName, dateOfBirth: draft.dateOfBirth, gender: (draft.gender ?? undefined) as Gender | undefined },
  });
  const err = (k: keyof Form) => fieldMessage(formState.errors[k]?.message);

  const onNext = handleSubmit((v) => {
    draft.setIdentity({ fullName: v.fullName, dateOfBirth: toAsciiDigits(v.dateOfBirth), gender: v.gender as Gender });
    router.push('/onboarding/role');
  });

  return (
    <Screen footer={<Button title={t('common.continue')} onPress={onNext} />}>
      <View style={{ paddingTop: space.md, gap: 6 }}>
        <T variant="caption" muted>{t('profileSetup.step', { n: 1, total: 2 })}</T>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
          <View style={{ width: '50%', height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
        </View>
      </View>
      <T variant="h1" accessibilityRole="header">{t('profileSetup.title')}</T>
      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <Field label={t('profileSetup.fullName')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoComplete="name" textContentType="name" error={err('fullName')} />
        )}
      />
      <Controller
        control={control}
        name="dateOfBirth"
        render={({ field }) => (
          <Field
            label={t('profileSetup.dob')}
            value={field.value}
            onChangeText={(v) => field.onChange(formatDob(v))}
            onBlur={field.onBlur}
            placeholder={t('profileSetup.dobPlaceholder')}
            keyboardType="number-pad"
            maxLength={10}
            style={{ textAlign: 'left', writingDirection: 'ltr' }}
            error={err('dateOfBirth')}
            hint={t('profileSetup.dobHint')}
          />
        )}
      />
      <Controller
        control={control}
        name="gender"
        render={({ field }) => (
          <View style={{ gap: 6 }}>
            <T variant="label" color={colors.textTertiary}>{t('profileSetup.gender')}</T>
            <Segmented
              options={[
                { value: 'FEMALE', label: t('profileSetup.female') },
                { value: 'MALE', label: t('profileSetup.male') },
              ]}
              value={(field.value ?? '') as 'FEMALE' | 'MALE'}
              onChange={field.onChange}
            />
            {err('gender') ? <T variant="caption" color={colors.dangerText}>{err('gender')}</T> : <T variant="caption" muted>{t('profileSetup.genderHint')}</T>}
          </View>
        )}
      />
    </Screen>
  );
}
