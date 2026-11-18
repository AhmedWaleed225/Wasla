import type { BookingStatus, RideStatus, RideSummaryDto } from '@wasla/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { nextDays, useFormat } from '../format';
import { colors, fonts, radius, space } from '../theme';
import { Icon } from './Icon';
import { Avatar, Card, Tag, T } from './ui';

/** Pickup → destination with the teal ring and amber dot from the design. */
export function RouteLine({ ride, showTime = true }: { ride: RideSummaryDto; showTime?: boolean }) {
  const f = useFormat();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', paddingTop: 5 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.primary, backgroundColor: '#fff' }} />
        <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: colors.railLine, marginVertical: 2 }} />
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <View>
          {showTime ? <T weight={700}>{f.time(ride.departureAt)}</T> : null}
          <T numberOfLines={2}>{f.place(ride.origin)}</T>
        </View>
        <T numberOfLines={2}>{f.place(ride.destination)}</T>
      </View>
    </View>
  );
}

const BOOKING_TONE: Record<BookingStatus, 'teal' | 'sand' | 'red' | 'gray' | 'blue'> = {
  PENDING: 'sand',
  CONFIRMED: 'teal',
  DECLINED: 'red',
  CANCELLED_BY_PASSENGER: 'gray',
  CANCELLED_BY_DRIVER: 'red',
  EXPIRED: 'gray',
  COMPLETED: 'blue',
};
const RIDE_TONE: Record<RideStatus, 'teal' | 'red' | 'blue'> = { SCHEDULED: 'teal', CANCELLED: 'red', COMPLETED: 'blue' };

export function StatusTag({ booking, ride }: { booking?: BookingStatus; ride?: RideStatus }) {
  const { t } = useTranslation();
  if (booking) return <Tag label={t(`status.${booking}`)} tone={BOOKING_TONE[booking]} />;
  if (ride) return <Tag label={t(`status.${ride}`)} tone={RIDE_TONE[ride]} />;
  return null;
}

/** One ride in a list: time, route, driver, price and seats. */
export function RideCard({ ride, onPress, footer }: { ride: RideSummaryDto; onPress: () => void; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <Card onPress={onPress} accessibilityLabel={`${f.dayTime(ride.departureAt)}, ${f.place(ride.origin)} → ${f.place(ride.destination)}, ${f.money(ride.pricePerSeatPiasters)}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <RouteLine ride={ride} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <T style={{ fontFamily: fonts.display[700], fontSize: 18 }}>{f.money(ride.pricePerSeatPiasters)}</T>
          <T variant="caption" muted>{f.day(ride.departureAt)}</T>
        </View>
      </View>
      {ride.match ? (
        <T variant="caption" muted>
          {t('search.pickupAway', { km: f.number(ride.match.pickupKm) })} · {t('search.dropoffAway', { km: f.number(ride.match.dropoffKm) })}
        </T>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.line }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={ride.driver.displayName} size={32} />
        <View style={{ flex: 1 }}>
          <T weight={600} numberOfLines={1}>{ride.driver.displayName}</T>
          <T variant="caption" muted numberOfLines={1}>
            {ride.vehicle.make} {ride.vehicle.model} · {ride.vehicle.color}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {ride.womenOnly ? <Tag label={t('search.womenOnly')} tone="sand" /> : null}
          <T variant="caption" muted>{t('search.seatsLeft', { count: ride.seatsAvailable })}</T>
        </View>
      </View>
      {footer}
    </Card>
  );
}

/** − n + control. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const f = useFormat();
  const btn = (icon: 'minus' | 'plus', disabled: boolean, next: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${icon === 'plus' ? '+' : '−'}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onChange(next)}
      hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: disabled ? colors.line : colors.primary, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name={icon} color={disabled ? colors.placeholder : colors.primary} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel={`${label}: ${value}`}>
      <T style={{ flex: 1 }} weight={600}>{label}</T>
      {btn('minus', value <= min, value - 1)}
      <T style={{ fontFamily: fonts.display[700], fontSize: 18, minWidth: 28, textAlign: 'center' }}>{f.number(value)}</T>
      {btn('plus', value >= max, value + 1)}
    </View>
  );
}

/** Horizontal day chips: Today, Tomorrow, then dates. */
export function DayChips({ value, onChange, days = 14 }: { value: string; onChange: (key: string) => void; days?: number }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {nextDays(days).map((d, i) => {
        const selected = d.key === value;
        const label = i === 0 ? t('search.today') : i === 1 ? t('search.tomorrow') : f.day(d.date);
        return (
          <Pressable
            key={d.key}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(d.key)}
            style={{
              paddingHorizontal: 14,
              height: 40,
              borderRadius: radius.pill,
              justifyContent: 'center',
              backgroundColor: selected ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.lineStrong,
            }}
          >
            <T weight={600} color={selected ? '#fff' : colors.text}>{label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Hour and minute (15-minute steps) without a native picker, so it works in Expo Go. */
export function TimeChooser({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  const f = useFormat();
  const label = f.time(new Date(2000, 0, 1, hour, minute));
  const step = (deltaMinutes: number) => {
    const total = (hour * 60 + minute + deltaMinutes + 24 * 60) % (24 * 60);
    onChange(Math.floor(total / 60), total % 60);
  };
  const btn = (text: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={() => step(delta)}
      style={{ paddingHorizontal: 12, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: 'center', backgroundColor: colors.surface }}
    >
      <T weight={600}>{text}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
      {btn('−1h', -60)}
      {btn('−15', -15)}
      <View style={{ flex: 1, alignItems: 'center' }} accessibilityLiveRegion="polite">
        <T style={{ fontFamily: fonts.display[700], fontSize: 22 }}>{label}</T>
      </View>
      {btn('+15', 15)}
      {btn('+1h', 60)}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: 'calendar' | 'search' | 'car'; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: space.xl }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <T variant="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T muted style={{ textAlign: 'center' }}>{body}</T> : null}
      {action}
    </View>
  );
}
