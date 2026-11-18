import { useQuery } from '@tanstack/react-query';
import { chatApi, notificationsApi } from '../api/endpoints';

/** Badge counts. Polled while the app is open; push notifications (when configured) prompt sooner refreshes. */
export function useUnreadNotifications() {
  return useQuery({ queryKey: ['notifications', 'unread'], queryFn: notificationsApi.unreadCount, refetchInterval: 30_000 }).data?.unreadCount ?? 0;
}

export function useUnreadMessages() {
  return useQuery({ queryKey: ['conversations', 'unread'], queryFn: chatApi.unreadCount, refetchInterval: 15_000 }).data?.unreadCount ?? 0;
}
