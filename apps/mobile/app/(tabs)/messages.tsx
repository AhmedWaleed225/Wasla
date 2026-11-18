import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { chatApi } from '../../src/api/endpoints';
import { EmptyState } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Avatar, Button, Card, Notice, T, Tag } from '../../src/components/ui';
import { useFormat } from '../../src/format';
import { colors, space } from '../../src/theme';

export default function Messages() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations, refetchInterval: 15_000 });

  return (
    <Screen scroll={false}>
      <T variant="h1" accessibilityRole="header">{t('chat.title')}</T>
      {q.isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.lg }} />
      ) : q.error ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" icon="close" text={q.error.message} />
          <Button title={t('common.retry')} kind="secondary" onPress={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(c) => c.bookingId}
          contentContainerStyle={{ gap: 10, paddingBottom: space.lg }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="calendar" title={t('chat.empty')} />}
          renderItem={({ item: c }) => (
            <Card
              onPress={() => router.push({ pathname: '/chat/[bookingId]', params: { bookingId: c.bookingId } })}
              accessibilityLabel={`${c.other.displayName}, ${f.place(c.ride.origin)} → ${f.place(c.ride.destination)}${c.unreadCount ? `, ${c.unreadCount}` : ''}`}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
            >
              <Avatar name={c.other.displayName} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T weight={600} style={{ flex: 1 }} numberOfLines={1}>{c.other.displayName}</T>
                  <Tag label={c.role === 'driver' ? t('chat.passenger') : t('chat.driver')} tone="gray" />
                </View>
                <T variant="caption" muted numberOfLines={1}>
                  {f.day(c.ride.departureAt)} · {f.place(c.ride.origin)} → {f.place(c.ride.destination)}
                </T>
                <T variant="meta" numberOfLines={1} color={c.unreadCount ? colors.text : colors.textSecondary} weight={c.unreadCount ? 600 : undefined}>
                  {c.lastMessage ? `${c.lastMessage.mine ? `${t('chat.you')}: ` : ''}${c.lastMessage.body}` : t('chat.noMessages')}
                </T>
              </View>
              {c.unreadCount > 0 ? (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <T variant="caption" color="#fff" weight={700}>{f.number(c.unreadCount)}</T>
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
