import { maskEgyptianMobile, toAsciiDigits } from '@wasla/shared';
import Constants from 'expo-constants';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { ApiError } from '../../src/api/client';
import { authApi } from '../../src/api/endpoints';
import { Screen } from '../../src/components/Screen';
import { Notice, T } from '../../src/components/ui';
import { useAuth } from '../../src/stores/auth';
import { colors, fonts, space } from '../../src/theme';

const LENGTH = 6;

export default function OtpScreen() {
  const { t, i18n } = useTranslation();
  const phone = useAuth((s) => s.pendingPhone);
  const initialResend = useAuth((s) => s.resendAfter);
  const setPendingPhone = useAuth((s) => s.setPendingPhone);
  const signIn = useAuth((s) => s.signIn);
  const input = useRef<TextInputInstance>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialResend);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  if (!phone) return <Redirect href="/phone" />;

  const verify = async (value: string) => {
    setVerifying(true);
    setError(undefined);
    try {
      const result = await authApi.verifyOtp(phone, value, Constants.deviceName ?? undefined);
      await signIn(result);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCode('');
      // A locked or expired code needs a new one; let the user resend right away.
      if (e instanceof ApiError && (e.code === 'AUTH_OTP_TOO_MANY_ATTEMPTS' || e.code === 'AUTH_OTP_EXPIRED')) setSecondsLeft(0);
      input.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (v: string) => {
    const digits = toAsciiDigits(v).replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (error) setError(undefined);
    if (digits.length === LENGTH && !verifying) void verify(digits);
  };

  const resend = async () => {
    try {
      const res = await authApi.requestOtp(phone, i18n.language);
      setPendingPhone(phone, res.resendAfter);
      setSecondsLeft(res.resendAfter);
      setError(undefined);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AUTH_OTP_COOLDOWN') setSecondsLeft(Number(e.extra?.resendAfter ?? 45));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen back>
      <T variant="h1" accessibilityRole="header">{t('otp.title')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {/* U+2066/U+2069 isolate the number so it stays left-to-right inside Arabic text. */}
        <T muted>{t('otp.sentTo', { phone: `⁦${maskEgyptianMobile(phone)}⁩` })}</T>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <T weight={600} color={colors.primary}>{t('otp.change')}</T>
        </Pressable>
      </View>

      {/* One real input drives the six boxes, so SMS autofill and paste work. Codes are always LTR. */}
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel={t('otp.title')} style={{ flexDirection: 'row', direction: 'ltr', justifyContent: 'space-between', marginTop: space.sm }}>
        {Array.from({ length: LENGTH }).map((_, i) => {
          const active = i === code.length && !verifying;
          return (
            <View
              key={i}
              style={{
                width: 48,
                height: 58,
                borderRadius: 14,
                borderWidth: 1.5,
                borderColor: error ? colors.danger : active ? colors.primary : colors.lineStrong,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <T style={{ fontFamily: fonts.display[600], fontSize: 24 }}>{code[i] ?? ''}</T>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        autoFocus
        editable={!verifying}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        accessibilityLabel={t('otp.title')}
      />

      {error ? <Notice tone="error" icon="close" text={error} /> : null}
      {verifying ? <T muted>{t('otp.verifying')}</T> : null}

      {secondsLeft > 0 ? (
        <T muted>{t('otp.resendIn', { seconds: secondsLeft })}</T>
      ) : (
        <Pressable accessibilityRole="button" onPress={resend} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <T weight={600} color={colors.primary}>{t('otp.resend')}</T>
        </Pressable>
      )}

      {__DEV__ ? <Notice tone="warn" icon="gear" text={t('otp.devHint')} /> : null}
    </Screen>
  );
}
