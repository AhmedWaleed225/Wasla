import { carrierOf, normalizeEgyptianMobile } from '@wasla/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ApiError, fieldMessage } from '../../src/api/client';
import { authApi } from '../../src/api/endpoints';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, Field, Notice, T } from '../../src/components/ui';
import { useAuth } from '../../src/stores/auth';
import { colors, space } from '../../src/theme';

const CARRIER_NAMES = { VODAFONE: 'Vodafone', ETISALAT_EAND: 'e&', ORANGE: 'Orange', WE: 'WE' } as const;

/** Egyptian flag drawn with views (no emoji). */
function Flag() {
  return (
    <View style={{ width: 22, height: 15, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }} accessibilityElementsHidden>
      <View style={{ flex: 1, backgroundColor: '#CE1126' }} />
      <View style={{ flex: 1, backgroundColor: '#fff' }} />
      <View style={{ flex: 1, backgroundColor: '#111' }} />
    </View>
  );
}

export default function PhoneScreen() {
  const { t, i18n } = useTranslation();
  const setPendingPhone = useAuth((s) => s.setPendingPhone);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const normalized = normalizeEgyptianMobile(raw);
  const carrier = normalized ? carrierOf(normalized) : null;

  const submit = async () => {
    if (!normalized) {
      setError(fieldMessage('AUTH_INVALID_PHONE'));
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const res = await authApi.requestOtp(normalized, i18n.language);
      setPendingPhone(normalized, res.resendAfter);
      router.push('/otp');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_OTP_COOLDOWN') {
        // A code was sent moments ago — continue to the code screen.
        setPendingPhone(normalized, Number(e.extra?.resendAfter ?? 45));
        router.push('/otp');
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      back
      footer={
        <>
          <Button title={t('phone.sendCode')} onPress={submit} loading={loading} disabled={raw.trim().length < 10} />
          <T variant="caption" muted style={{ textAlign: 'center' }}>{t('phone.terms')}</T>
        </>
      }
    >
      <T variant="h1" accessibilityRole="header">{t('phone.title')}</T>
      <T muted>{t('phone.subtitle')}</T>
      <Field
        label={t('phone.label')}
        value={raw}
        onChangeText={(v) => {
          setRaw(v);
          if (error) setError(undefined);
        }}
        onSubmitEditing={submit}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="010 1234 5678"
        maxLength={16}
        autoFocus
        error={error}
        // Phone numbers are always written left-to-right, even in Arabic.
        style={{ textAlign: 'left', writingDirection: 'ltr', letterSpacing: 0.5 }}
        prefix={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Flag />
            <T weight={600}>+20</T>
          </View>
        }
        suffix={normalized ? <Icon name="check" color={colors.success} /> : null}
      />
      {normalized && carrier ? (
        <T variant="caption" color={colors.success} style={{ marginTop: -8 }}>
          {t('phone.valid')} · {CARRIER_NAMES[carrier]}
        </T>
      ) : null}
      <View style={{ marginTop: space.xs }}>
        <Notice text={t('phone.privacy')} />
      </View>
    </Screen>
  );
}
