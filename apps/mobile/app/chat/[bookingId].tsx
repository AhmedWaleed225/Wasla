import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAT_RULES, type MessageDto } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { chatApi } from '../../src/api/endpoints';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, Notice, T } from '../../src/components/ui';
import { useFormat } from '../../src/format';
import { colors, fonts, radius, space } from '../../src/theme';

const POLL_MS = 4_000;

export default function Chat() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: chatApi.conversations });
  const conv = conversations.data?.find((c) => c.bookingId === bookingId);

  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [open, setOpen] = useState(true);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const lastId = useRef<string | undefined>(undefined);

  const merge = useCallback((incoming: MessageDto[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastId.current = next[next.length - 1]?.id;
      return next;
    });
  }, []);

  const markRead = useCallback(() => {
    void chatApi.markRead(bookingId).then(() => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    });
  }, [bookingId, qc]);

  // First page, then poll for anything newer than the last message we have.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const page = await chatApi.messages(bookingId, lastId.current ? { after: lastId.current } : {});
        if (!alive) return;
        setOpen(page.open);
        setOtherReadAt(page.otherReadAt);
        setLoadError(null);
        if (page.items.some((m) => !m.mine) || !loaded) markRead();
        merge(page.items);
        setLoaded(true);
      } catch (e) {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const send = useMutation({
    mutationFn: (body: string) => chatApi.send(bookingId, body),
    onSuccess: (m) => {
      merge([m]);
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const seen = !!(lastMine && otherReadAt && otherReadAt >= lastMine.createdAt);
  const canSend = open && draft.trim().length > 0 && !send.isPending;

  return (
    <Screen title={conv?.other.displayName ?? t('chat.title')} back scroll={false} contentStyle={{ paddingBottom: 0 }}>
      {conv ? (
        <Pressable onPress={() => router.push({ pathname: '/rides/[id]', params: { id: conv.ride.id } })} accessibilityRole="link">
          <T variant="caption" muted style={{ textAlign: 'center' }} numberOfLines={1}>
            {f.dayTime(conv.ride.departureAt)} · {f.place(conv.ride.origin)} → {f.place(conv.ride.destination)}
          </T>
        </Pressable>
      ) : null}
      <Notice tone="neutral" icon="shield" text={t('chat.safety')} />

      {!loaded && !loadError ? <ActivityIndicator color={colors.primary} /> : null}
      {loadError && !loaded ? (
        <View style={{ gap: 8 }}>
          <Notice tone="error" icon="close" text={loadError} />
          <Button title={t('common.retry')} kind="secondary" onPress={() => router.replace({ pathname: '/chat/[bookingId]', params: { bookingId } })} />
        </View>
      ) : null}

      <FlatList
        inverted
        data={[...messages].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 6, paddingVertical: space.sm }}
        ListFooterComponent={loaded && messages.length === 0 ? <T muted style={{ textAlign: 'center', marginBottom: space.md }}>{t('chat.noMessages')}</T> : undefined}
        renderItem={({ item: m }) => (
          <View style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
            <View
              style={{
                maxWidth: '80%',
                backgroundColor: m.mine ? colors.primary : colors.surface,
                borderWidth: m.mine ? 0 : 1,
                borderColor: colors.line,
                borderRadius: radius.button,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <T color={m.mine ? '#fff' : colors.text}>{m.body}</T>
              <T variant="caption" color={m.mine ? colors.primaryTint : colors.textSecondary} style={{ marginTop: 2 }}>
                {f.time(m.createdAt)}
                {m.id === lastMine?.id && seen ? ` · ${t('chat.seen')}` : ''}
              </T>
            </View>
          </View>
        )}
      />

      {send.error ? <Notice tone="error" icon="close" text={send.error.message} /> : null}
      {open ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: space.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={CHAT_RULES.maxMessageLength}
            accessibilityLabel={t('chat.placeholder')}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderColor: colors.lineStrong,
              borderRadius: radius.button,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontFamily: fonts.body[500],
              fontSize: 15,
              color: colors.text,
              textAlign: f.ar ? 'right' : 'left',
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => send.mutate(draft)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: canSend ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            {send.isPending ? <ActivityIndicator color="#fff" /> : <Icon name="send" color={canSend ? '#fff' : colors.placeholder} />}
          </Pressable>
        </View>
      ) : (
        <Notice tone="neutral" icon="lock" text={t('chat.closed')} />
      )}
    </Screen>
  );
}
