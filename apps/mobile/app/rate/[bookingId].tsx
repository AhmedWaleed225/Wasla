import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DRIVER_ONLY_RATING_TAGS, RATING_TAGS, TRUST_RULES, type RatingTag } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { trustApi } from '../../src/api/endpoints';
import { Screen } from '../../src/components/Screen';
import { Avatar, Button, Card, Chip, Field, Notice, T } from '../../src/components/ui';
import { useFormat } from '../../src/format';
import { colors, space } from '../../src/theme';

const STAR = 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';

/** Five tappable stars (always left-to-right, like the numbers they stand for). */
function Stars({ value, onChange, size = 40 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', direction: 'ltr', gap: 6, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: value }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          onPress={() => onChange?.(n)}
          accessibilityRole="button"
          accessibilityLabel={t('rating.stars', { count: n })}
          accessibilityState={{ selected: n <= value }}
          hitSlop={4}
        >
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={STAR} fill={n <= value ? colors.accent : 'none'} stroke={n <= value ? colors.accent : colors.lineStrong} strokeWidth={1.6} strokeLinejoin="round" />
          </Svg>
        </Pressable>
      ))}
    </View>
  );
}

export default function Rate() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rating', bookingId], queryFn: () => trustApi.ratingStatus(bookingId) });
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [comment, setComment] = useState('');

  const send = useMutation({
    mutationFn: () => trustApi.rate(bookingId, { stars, tags, comment: comment.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rating', bookingId] });
      void qc.invalidateQueries({ queryKey: ['ride'] });
    },
  });

  if (q.isPending) {
    return (
      <Screen title={t('rating.title')} back>
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }
  if (q.error) {
    return (
      <Screen title={t('rating.title')} back>
        <Notice tone="error" icon="close" text={q.error.message} />
      </Screen>
    );
  }

  const s = q.data;
  const rateeIsDriver = s.role === 'driver';
  const available = RATING_TAGS.filter((tag) => rateeIsDriver || !DRIVER_ONLY_RATING_TAGS.includes(tag));
  const toggle = (tag: RatingTag) =>
    setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : cur.length < TRUST_RULES.maxRatingTags ? [...cur, tag] : cur));

  const header = (
    <View style={{ alignItems: 'center', gap: 8, paddingTop: space.sm }}>
      <Avatar name={s.ratee.displayName} size={64} />
      <T variant="h2" style={{ textAlign: 'center' }}>{t('rating.howWas', { name: s.ratee.displayName })}</T>
    </View>
  );

  if (s.mine) {
    return (
      <Screen title={t('rating.title')} back>
        {header}
        <Stars value={s.mine.stars} />
        <T muted style={{ textAlign: 'center' }}>{t('rating.youRated', { stars: f.number(s.mine.stars) })}</T>
        {send.isSuccess ? <Notice tone="info" icon="check" text={t('rating.thanks')} /> : null}
        {s.mine.tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {s.mine.tags.map((tag) => <Chip key={tag} label={t(`rating.tags.${tag}`)} selected />)}
          </View>
        ) : null}
        <Button title={t('common.back')} kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!s.canRate) {
    return (
      <Screen title={t('rating.title')} back>
        {header}
        <Notice tone="neutral" icon="clock" text={s.deadline ? t('rating.closed') : t('rating.notYet')} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('rating.title')}
      back
      footer={<Button title={t('rating.submit')} icon="star" disabled={stars === 0} loading={send.isPending} onPress={() => send.mutate()} />}
    >
      {header}
      <Stars value={stars} onChange={setStars} />
      {s.deadline ? <T variant="caption" muted style={{ textAlign: 'center' }}>{t('rating.until', { date: f.day(s.deadline) })}</T> : null}
      <Card style={{ gap: 10 }}>
        <T variant="label" color={colors.textTertiary}>{t('rating.whatWent')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {available.map((tag) => (
            <Chip key={tag} label={t(`rating.tags.${tag}`)} selected={tags.includes(tag)} onPress={() => toggle(tag)} />
          ))}
        </View>
        <Field
          label={t('rating.comment')}
          placeholder={t('rating.commentPlaceholder')}
          value={comment}
          onChangeText={setComment}
          maxLength={TRUST_RULES.ratingCommentMax}
          multiline
        />
      </Card>
      {send.error ? <Notice tone="error" icon="close" text={send.error.message} /> : null}
    </Screen>
  );
}
