import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SavedLocationDto } from '@wasla/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { locationsApi } from '../src/api/endpoints';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { Button, Card, Divider, Notice, Row, T } from '../src/components/ui';
import { savedPlacesKey, usePlaceName, useSavedPlaces } from '../src/hooks/useSavedPlaces';
import { colors } from '../src/theme';

export default function SavedPlaces() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading, error } = useSavedPlaces();
  const names = usePlaceName();
  const remove = useMutation({
    mutationFn: (id: string) => locationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedPlacesKey }),
  });
  const pick = (purpose: 'HOME' | 'WORK' | 'OTHER') => router.push({ pathname: '/location-search', params: { purpose } });

  const slot = (label: 'HOME' | 'WORK') => data?.find((s) => s.label === label);
  const others = data?.filter((s) => s.label === 'OTHER') ?? [];

  const removeButton = (s: SavedLocationDto) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t('places.remove')} onPress={() => remove.mutate(s.id)} hitSlop={8} style={{ padding: 6 }}>
      <Icon name="trash" color={colors.dangerText} size={18} />
    </Pressable>
  );

  return (
    <Screen title={t('places.title')} back footer={<Button title={t('places.add')} icon="plus" kind="secondary" onPress={() => pick('OTHER')} />}>
      {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Notice tone="error" icon="close" text={error.message} /> : null}
      {remove.error ? <Notice tone="error" icon="close" text={remove.error.message} /> : null}
      <Card style={{ paddingVertical: 2 }}>
        {(['HOME', 'WORK'] as const).map((label, i) => {
          const s = slot(label);
          return (
            <View key={label}>
              {i > 0 ? <Divider /> : null}
              <Row
                icon={label === 'HOME' ? 'home' : 'briefcase'}
                title={label === 'HOME' ? t('places.home') : t('places.work')}
                subtitle={s ? names.saved(s) : label === 'HOME' ? t('places.setHome') : t('places.setWork')}
                onPress={() => pick(label)}
                trailing={s ? removeButton(s) : undefined}
              />
            </View>
          );
        })}
      </Card>
      {others.length > 0 ? (
        <Card style={{ paddingVertical: 2 }}>
          {others.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Row icon="pin" title={names.saved(s)} subtitle={s.pickupNote ?? undefined} trailing={removeButton(s)} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
