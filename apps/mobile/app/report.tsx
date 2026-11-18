import { useMutation, useQueryClient } from '@tanstack/react-query';
import { REPORT_REASONS, TRUST_RULES, type ReportReason } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { trustApi } from '../src/api/endpoints';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Button, Card, Field, Notice, T, ToggleRow } from '../src/components/ui';
import { colors, radius, space } from '../src/theme';

/** Report someone you shared a trip with. Params: bookingId, userId, name. */
export default function Report() {
  const { bookingId, userId, name } = useLocalSearchParams<{ bookingId: string; userId: string; name: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);

  const send = useMutation({
    mutationFn: () => trustApi.report({ bookingId, reportedUserId: userId, reason: reason!, details: details.trim() || undefined, block }),
    onSuccess: () => {
      // Blocking can end bookings and close chats, so refresh what depends on them.
      for (const key of ['ride', 'rides', 'bookings', 'conversations', 'blocks']) void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  if (send.isSuccess) {
    return (
      <Screen title={t('report.title')} back footer={<Button title={t('common.back')} onPress={() => router.back()} />}>
        <View style={{ alignItems: 'center', gap: 12, paddingTop: space.xl }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={28} color={colors.primary} />
          </View>
          <T variant="h2">{t('report.sent')}</T>
          <T muted style={{ textAlign: 'center' }}>{t('report.sentBody')}</T>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('report.title')}
      back
      footer={<Button title={t('report.submit')} icon="flag" disabled={!reason} loading={send.isPending} onPress={() => send.mutate()} />}
    >
      <T muted>{t('report.about', { name })}</T>
      <Pressable accessibilityRole="button" onPress={() => void Linking.openURL('tel:122')}>
        <Notice tone="error" icon="phone" text={t('report.emergency')} />
      </Pressable>

      <T variant="h3">{t('report.reason')}</T>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {REPORT_REASONS.map((r) => {
          const selected = r === reason;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setReason(r)}
              style={{
                minHeight: 48,
                paddingHorizontal: space.md,
                borderRadius: radius.button,
                borderWidth: 1.5,
                borderColor: selected ? colors.primary : colors.line,
                backgroundColor: selected ? colors.primaryTint : colors.surface,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? colors.primary : colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
              </View>
              <T weight={selected ? 600 : undefined}>{t(`report.reasons.${r}`)}</T>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ gap: 6 }}>
        <Field
          label={t('report.details')}
          placeholder={t('report.detailsPlaceholder')}
          value={details}
          onChangeText={setDetails}
          maxLength={TRUST_RULES.reportDetailsMax}
          multiline
        />
        <ToggleRow label={t('report.block')} hint={t('report.blockHint')} value={block} onChange={setBlock} />
      </Card>
      {send.error ? <Notice tone="error" icon="close" text={send.error.message} /> : null}
    </Screen>
  );
}
