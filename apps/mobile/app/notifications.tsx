import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@wasla/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { notificationsApi } from '../src/api/endpoints';
import { Icon, type IconName } from '../src/components/Icon';
import { EmptyState } from '../src/components/rides';
import { Screen } from '../src/components/Screen';
import { Button, Notice, T } from '../src/components/ui';
import { useFormat } from '../src/format';
import { useNotificationText } from '../src/hooks/useNotificationText';
import { colors, space } from '../src/theme';

const ICON: Record<NotificationDto['type'], IconName> = {
  BOOKING_REQUESTED: 'users',
  BOOKING_CONFIRMED: 'check',
  BOOKING_ACCEPTED: 'check',
  BOOKING_DECLINED: 'close',
  BOOKING_EXPIRED: 'clock',
  BOOKING_CANCELLED: 'close',
  RIDE_CANCELLED: 'close',
  RIDE_COMPLETED: 'car',
};

export default function Notifications() {
  const { t } = useTranslation();
  const f = useFormat();
  const text = useNotificationText();
  const qc = useQueryClient();

  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = q.data?.pages[0]?.unreadCount ?? 0;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({ mutationFn: () => notificationsApi.markRead({ all: true }), onSuccess: refresh });
  const markOne = useMutation({ mutationFn: (id: string) => notificationsApi.markRead({ ids: [id] }), onSuccess: refresh });

  const open = (n: NotificationDto) => {
    if (!n.readAt) markOne.mutate(n.id);
    if (n.rideId) router.push({ pathname: '/rides/[id]', params: { id: n.rideId } });
  };

  return (
    <Screen
      title={t('notifications.title')}
      back
      scroll={false}
      right={
        unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => markAll.mutate()} hitSlop={8} style={{ width: 44, alignItems: 'center' }} accessibilityLabel={t('notifications.markAllRead')}>
            <Icon name="check" color={colors.primary} />
          </Pressable>
        ) : undefined
      }
    >
      {q.isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.lg }} />
      ) : q.error ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" icon="close" text={q.error.message} />
          <Button title={t('common.retry')} kind="secondary" onPress={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ gap: 8, paddingBottom: space.lg }}
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => q.refetch()}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<EmptyState icon="calendar" title={t('notifications.empty')} />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : undefined}
          renderItem={({ item: n }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(n)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: 12,
                padding: space.sm,
                borderRadius: 16,
                backgroundColor: n.readAt ? colors.surface : colors.primaryTint,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICON[n.type]} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight={n.readAt ? undefined : 600}>{text(n)}</T>
                <T variant="caption" muted>{f.dayTime(n.createdAt)}</T>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
