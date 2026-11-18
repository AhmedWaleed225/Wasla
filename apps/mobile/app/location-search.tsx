import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocationDto, SavedLocationLabel } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { locationsApi } from '../src/api/endpoints';
import { Icon, type IconName } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Divider, Field, Notice, T } from '../src/components/ui';
import { savedPlacesKey, usePlaceName } from '../src/hooks/useSavedPlaces';
import { DRAFT_FIELDS, useTripDraft, type DraftField } from '../src/stores/trip-draft';
import { colors } from '../src/theme';

const KIND_ICON: Record<string, IconName> = {
  UNIVERSITY: 'users',
  BUSINESS_DISTRICT: 'briefcase',
  MALL: 'cash',
  GATE: 'pin',
  COMPOUND: 'home',
  TRANSIT: 'car',
};

/**
 * Landmark search. `purpose` decides what happens on selection:
 *   from | to          -> fills the trip draft on Home
 *   offerFrom | offerTo -> fills the driver's Offer form
 *   HOME | WORK | OTHER -> saves the place to the user's account
 */
export default function LocationSearch() {
  const { t } = useTranslation();
  const { purpose } = useLocalSearchParams<{ purpose: string }>();
  const names = usePlaceName();
  const setDraft = useTripDraft((s) => s.set);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const results = useQuery({
    queryKey: ['locations', debounced],
    queryFn: () => locationsApi.search(debounced),
    enabled: debounced.length > 0,
  });

  const save = useMutation({
    mutationFn: (loc: LocationDto) => locationsApi.save({ label: purpose as SavedLocationLabel, locationId: loc.id, customName: purpose === 'OTHER' ? names.name(loc).slice(0, 40) : undefined }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: savedPlacesKey });
      router.back();
    },
  });

  const choose = (loc: LocationDto) => {
    if (DRAFT_FIELDS.includes(purpose as DraftField)) {
      setDraft(purpose as DraftField, loc);
      router.back();
    } else {
      save.mutate(loc);
    }
  };

  return (
    <Screen title={t('locationSearch.title')} back scroll={false}>
      <Field
        value={q}
        onChangeText={setQ}
        placeholder={t('locationSearch.placeholder')}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        prefix={<Icon name="search" color={colors.textSecondary} />}
        suffix={results.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
      />
      {save.error ? <Notice tone="error" icon="close" text={save.error.message} /> : null}
      {results.error ? <Notice tone="error" icon="close" text={results.error.message} /> : null}
      {debounced.length === 0 ? (
        <T variant="meta" muted>{t('locationSearch.hint')}</T>
      ) : results.data && results.data.length === 0 ? (
        <T variant="meta" muted>{t('locationSearch.empty', { q: debounced })}</T>
      ) : null}
      <FlatList
        data={results.data ?? []}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => choose(item)}
            disabled={save.isPending}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={KIND_ICON[item.kind] ?? 'pin'} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight={600}>{names.name(item)}</T>
              <T variant="caption" muted>
                {[names.kind(item), names.parent(item)].filter(Boolean).join(' · ')}
              </T>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
