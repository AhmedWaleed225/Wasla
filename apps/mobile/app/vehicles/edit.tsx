import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RIDE_RULES, type VehicleInput } from '@wasla/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { ApiError, fieldMessage } from '../../src/api/client';
import { vehiclesApi } from '../../src/api/endpoints';
import { Stepper } from '../../src/components/rides';
import { Screen } from '../../src/components/Screen';
import { Button, Card, Field, Notice } from '../../src/components/ui';

const vehiclesKey = ['vehicles'] as const;

/** Add a car (no id) or edit one (id). */
export default function EditVehicle() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: vehiclesKey, queryFn: vehiclesApi.list, enabled: !!id });
  const existing = id ? list.data?.find((v) => v.id === id) : undefined;
  const [plateLetters, plateDigits] = existing?.plate ? [existing.plate.replace(/\s*\d+$/, ''), existing.plate.match(/\d+$/)?.[0] ?? ''] : ['', ''];

  const [form, setForm] = useState<VehicleInput>({
    make: existing?.make ?? '',
    model: existing?.model ?? '',
    color: existing?.color ?? '',
    year: existing?.year ?? new Date().getFullYear() - 3,
    seats: existing?.seats ?? 3,
    plateLetters,
    plateDigits,
  });
  const [loadedFor, setLoadedFor] = useState<string | undefined>(existing?.id);
  if (existing && loadedFor !== existing.id) {
    setLoadedFor(existing.id);
    setForm({ make: existing.make, model: existing.model, color: existing.color, year: existing.year, seats: existing.seats, plateLetters, plateDigits });
  }
  const set = <K extends keyof VehicleInput>(k: K) => (v: VehicleInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const done = async () => {
    await qc.invalidateQueries({ queryKey: vehiclesKey });
    router.back();
  };
  const save = useMutation({ mutationFn: () => (id ? vehiclesApi.update(id, form) : vehiclesApi.add(form)), onSuccess: done });
  const remove = useMutation({ mutationFn: () => vehiclesApi.remove(id!), onSuccess: done });

  const fields = save.error instanceof ApiError ? save.error.fields : undefined;
  const err = (k: string) => fieldMessage(fields?.[k]);

  return (
    <Screen
      title={id ? t('vehicle.editTitle') : t('vehicle.addTitle')}
      back
      footer={<Button title={t('vehicle.save')} loading={save.isPending} onPress={() => save.mutate()} />}
    >
      <Card style={{ gap: 14 }}>
        <Field label={t('vehicle.make')} placeholder={t('vehicle.makePlaceholder')} value={form.make} onChangeText={set('make')} error={err('make')} maxLength={30} />
        <Field label={t('vehicle.model')} placeholder={t('vehicle.modelPlaceholder')} value={form.model} onChangeText={set('model')} error={err('model')} maxLength={30} />
        <Field label={t('vehicle.color')} placeholder={t('vehicle.colorPlaceholder')} value={form.color} onChangeText={set('color')} error={err('color')} maxLength={20} />
        <Field
          label={t('vehicle.year')}
          value={String(form.year)}
          onChangeText={(v) => set('year')(Number(v.replace(/\D/g, '')) || 0)}
          keyboardType="number-pad"
          maxLength={4}
          error={err('year')}
        />
        <Stepper label={t('vehicle.seats')} value={Number(form.seats)} min={1} max={RIDE_RULES.maxSeats} onChange={set('seats')} />
      </Card>
      <Card style={{ gap: 14 }}>
        <Field label={t('vehicle.plateLetters')} hint={t('vehicle.plateLettersHint')} value={form.plateLetters} onChangeText={set('plateLetters')} error={err('plateLetters')} maxLength={8} />
        <Field label={t('vehicle.plateDigits')} value={form.plateDigits} onChangeText={set('plateDigits')} keyboardType="number-pad" maxLength={4} error={err('plateDigits')} />
      </Card>
      {save.error ? <Notice tone="error" icon="close" text={save.error.message} /> : null}
      {remove.error ? <Notice tone="error" icon="close" text={remove.error.message} /> : null}
      {id ? (
        <Button
          title={t('vehicle.remove')}
          kind="ghost"
          icon="trash"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert(t('vehicle.remove'), t('vehicle.removeConfirm'), [
              { text: t('common.back'), style: 'cancel' },
              { text: t('vehicle.remove'), style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
