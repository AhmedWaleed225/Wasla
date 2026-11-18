import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, View } from 'react-native';
import { trustApi } from '../src/api/endpoints';
import { EmptyState } from '../src/components/rides';
import { Screen } from '../src/components/Screen';
import { Avatar, Button, Card, Notice, T } from '../src/components/ui';
import { useFormat } from '../src/format';
import { colors } from '../src/theme';

export default function BlockedUsers() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocks'], queryFn: trustApi.blocked });
  const unblock = useMutation({
    mutationFn: (userId: string) => trustApi.unblock(userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['blocks'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <Screen title={t('blocks.title')} back>
      {q.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      {q.error ? <Notice tone="error" icon="close" text={q.error.message} /> : null}
      {unblock.error ? <Notice tone="error" icon="close" text={unblock.error.message} /> : null}
      {q.data && q.data.length === 0 ? <EmptyState icon="search" title={t('blocks.empty')} /> : null}
      {q.data?.map((b) => (
        <Card key={b.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={b.user.displayName} />
          <View style={{ flex: 1 }}>
            <T weight={600}>{b.user.displayName}</T>
            <T variant="caption" muted>{f.day(b.blockedAt)}</T>
          </View>
          <Button
            title={t('blocks.unblock')}
            kind="secondary"
            loading={unblock.isPending && unblock.variables === b.user.id}
            onPress={() =>
              Alert.alert(t('blocks.unblock'), t('blocks.unblockConfirm', { name: b.user.displayName }), [
                { text: t('common.back'), style: 'cancel' },
                { text: t('blocks.unblock'), onPress: () => unblock.mutate(b.user.id) },
              ])
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
