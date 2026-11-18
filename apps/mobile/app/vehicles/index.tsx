import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { vehiclesApi } from '../../src/api/endpoints';
import { EmptyState } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Button, Card, Divider, Notice, Row } from '../../src/components/ui';
import { colors } from '../../src/theme';

export default function Vehicles() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['vehicles'], queryFn: vehiclesApi.list });
  return (
    <Screen title={t('vehicle.myCars')} back footer={<Button title={t('offer.addCar')} icon="plus" onPress={() => router.push('/vehicles/edit')} />}>
      {q.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      {q.error ? <Notice tone="error" icon="close" text={q.error.message} /> : null}
      {q.data && q.data.length === 0 ? <EmptyState icon="car" title={t('offer.noCar')} /> : null}
      {q.data && q.data.length > 0 ? (
        <Card style={{ paddingVertical: 4 }}>
          {q.data.map((v, i) => (
            <Fragment key={v.id}>
              {i > 0 ? <Divider /> : null}
              <Row icon="car" title={`${v.make} ${v.model}`} subtitle={`${v.color} · ${v.year} · ${v.plate ?? ''}`} onPress={() => router.push({ pathname: '/vehicles/edit', params: { id: v.id } })} />
            </Fragment>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
