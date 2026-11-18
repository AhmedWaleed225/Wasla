import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { ridesApi } from '../../src/api/endpoints';
import { EmptyState, RideCard } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Button, Notice, T } from '../../src/components/ui';
import { useFormat } from '../../src/format';
import { usePlaceName } from '../../src/hooks/useSavedPlaces';
import { useTripDraft } from '../../src/stores/trip-draft';
import { colors, space } from '../../src/theme';

export default function Results() {
  const { t } = useTranslation();
  const f = useFormat();
  const names = usePlaceName();
  const { from, to, date, seats } = useTripDraft();

  const q = useQuery({
    queryKey: ['rides', 'search', from?.id, to?.id, date, seats],
    queryFn: () => ridesApi.search({ fromLocationId: from!.id, toLocationId: to!.id, date, seats }),
    enabled: !!from && !!to,
  });

  const header = (
    <View style={{ gap: 6, marginBottom: space.sm }}>
      <T weight={600} numberOfLines={1}>
        {from ? names.name(from) : '—'} → {to ? names.name(to) : '—'}
      </T>
      <T variant="meta" muted>
        {f.day(`${date}T12:00:00`)} · {t('search.seats')}: {f.number(seats)}
      </T>
      {q.data && q.data.rides.length > 0 ? <T variant="caption" muted>{t('search.resultsCount', { count: q.data.rides.length })}</T> : null}
    </View>
  );

  return (
    <Screen title={t('search.resultsTitle')} back scroll={false}>
      {!from || !to ? (
        <Notice tone="warn" icon="pin" text={t('search.choosePlaces')} />
      ) : q.isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />
      ) : q.error ? (
        <View style={{ gap: 12 }}>
          <Notice tone="error" icon="close" text={q.error.message} />
          <Button title={t('common.retry')} kind="secondary" onPress={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={q.data.rides}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ gap: 12, paddingBottom: space.lg }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title={t('search.noResultsTitle')}
              body={t('search.noResultsBody')}
              action={<Button title={t('search.changeSearch')} kind="secondary" onPress={() => router.back()} />}
            />
          }
          renderItem={({ item }) => <RideCard ride={item} onPress={() => router.push({ pathname: '/rides/[id]', params: { id: item.id } })} />}
        />
      )}
    </Screen>
  );
}
