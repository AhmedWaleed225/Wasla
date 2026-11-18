import { Prisma, type Booking, type Ride, type User, type UserProfile, type Vehicle } from '@prisma/client';
import {
  TRUST_RULES,
  priceLimitsEgp,
  type BookingSummaryDto,
  type PublicUserDto,
  type RideSummaryDto,
  type VehicleDto,
} from '@wasla/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { displayNameOf } from '../users/display-name';

/** What every ride query loads so it can be shown. */
export const rideInclude = {
  driver: { include: { profile: true } },
  vehicle: true,
} satisfies Prisma.RideInclude;

export type RideWithDriver = Ride & { driver: User & { profile: UserProfile | null }; vehicle: Vehicle };

export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

export function plateOf(v: Vehicle): string {
  return `${v.plateLetters} ${v.plateDigits}`;
}

export function toVehicleDto(v: Vehicle, showPlate: boolean): VehicleDto {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    color: v.color,
    year: v.year,
    seats: v.seats,
    plate: showPlate ? plateOf(v) : null,
  };
}

export interface UserStats {
  ridesCompleted: number;
  /** null until TRUST_RULES.minRatingsToShowAverage ratings exist, so one rating can't be traced to its author. */
  ratingAverage: number | null;
  ratingCount: number;
}

export const EMPTY_STATS: UserStats = { ridesCompleted: 0, ratingAverage: null, ratingCount: 0 };

/** Public view of a person: display name only, gender only if they chose to show it. */
export function toPublicUser(u: User & { profile: UserProfile | null }, stats: UserStats = EMPTY_STATS): PublicUserDto {
  return {
    id: u.id,
    displayName: u.profile ? displayNameOf(u.profile.fullName, u.profile.showFullLastName) : '—',
    gender: u.profile?.showGender ? u.profile.gender : null,
    memberSince: u.createdAt.toISOString(),
    ridesCompleted: stats.ridesCompleted,
    ratingAverage: stats.ratingAverage,
    ratingCount: stats.ratingCount,
  };
}

/**
 * Completed trips (as driver or passenger) and ratings received, per user —
 * two queries for a whole page of results.
 */
export async function userStats(prisma: PrismaService, userIds: string[]): Promise<Map<string, UserStats>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, UserStats>();
  if (ids.length === 0) return out;
  const [trips, ratings] = await Promise.all([
    prisma.$queryRaw<{ user_id: string; n: bigint }[]>`
      SELECT user_id, count(*) AS n FROM (
        SELECT driver_id AS user_id FROM rides WHERE status = 'COMPLETED' AND driver_id = ANY(${ids}::uuid[])
        UNION ALL
        SELECT passenger_id FROM bookings WHERE status = 'COMPLETED' AND passenger_id = ANY(${ids}::uuid[])
      ) t GROUP BY user_id`,
    prisma.$queryRaw<{ ratee_id: string; n: bigint; avg: number }[]>`
      SELECT ratee_id, count(*) AS n, avg(stars)::float AS avg
      FROM ratings WHERE ratee_id = ANY(${ids}::uuid[]) GROUP BY ratee_id`,
  ]);
  for (const id of ids) out.set(id, { ...EMPTY_STATS });
  for (const t of trips) out.get(t.user_id)!.ridesCompleted = Number(t.n);
  for (const r of ratings) {
    const s = out.get(r.ratee_id)!;
    s.ratingCount = Number(r.n);
    s.ratingAverage = s.ratingCount >= TRUST_RULES.minRatingsToShowAverage ? Math.round(r.avg * 10) / 10 : null;
  }
  return out;
}

export function toRideSummary(
  r: RideWithDriver,
  counts: Map<string, UserStats>,
  opts: { showPlate: boolean; match?: { pickupKm: number; dropoffKm: number } },
): RideSummaryDto {
  return {
    id: r.id,
    status: r.status,
    departureAt: r.departureAt.toISOString(),
    origin: {
      locationId: r.originLocationId,
      nameEn: r.originNameEn,
      nameAr: r.originNameAr,
      lat: r.originLat,
      lng: r.originLng,
    },
    destination: {
      locationId: r.destinationLocationId,
      nameEn: r.destinationNameEn,
      nameAr: r.destinationNameAr,
      lat: r.destinationLat,
      lng: r.destinationLng,
    },
    distanceKm: Math.round(r.distanceKm * 10) / 10,
    pricePerSeatPiasters: r.pricePerSeatPiasters,
    currency: 'EGP',
    seatsTotal: r.seatsTotal,
    seatsAvailable: r.seatsAvailable,
    bookingMode: r.bookingMode,
    womenOnly: r.womenOnly,
    driver: toPublicUser(r.driver, counts.get(r.driverId)),
    vehicle: toVehicleDto(r.vehicle, opts.showPlate),
    ...(opts.match && {
      match: {
        pickupKm: Math.round(opts.match.pickupKm * 10) / 10,
        dropoffKm: Math.round(opts.match.dropoffKm * 10) / 10,
      },
    }),
  };
}

export function toBookingSummary(b: Booking): BookingSummaryDto {
  return {
    id: b.id,
    rideId: b.rideId,
    status: b.status,
    seats: b.seats,
    pricePerSeatPiasters: b.pricePerSeatPiasters,
    totalPiasters: b.totalPiasters,
    paymentMethod: b.paymentMethod,
    pickupNote: b.pickupNote,
    expiresAt: b.status === 'PENDING' && b.expiresAt ? b.expiresAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}

export const priceLimitsFor = (distanceKm: number) => priceLimitsEgp(distanceKm);

/** Postgres unique-violation on a given constraint/index name. */
export function isUniqueViolation(err: unknown, target: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.join(',').includes(target) : String(t ?? '').includes(target);
}

export function isAnyUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
