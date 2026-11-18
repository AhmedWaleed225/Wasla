import { Prisma, type Booking, type Ride, type User, type UserProfile, type Vehicle } from '@prisma/client';
import {
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

/** Public view of a person: display name only, gender only if they chose to show it. */
export function toPublicUser(u: User & { profile: UserProfile | null }, ridesCompleted: number): PublicUserDto {
  return {
    id: u.id,
    displayName: u.profile ? displayNameOf(u.profile.fullName, u.profile.showFullLastName) : '—',
    gender: u.profile?.showGender ? u.profile.gender : null,
    memberSince: u.createdAt.toISOString(),
    ridesCompleted,
    ratingAverage: null,
  };
}

/** Completed trips per user, as driver or passenger. One query for a whole page of results. */
export async function completedCounts(prisma: PrismaService, userIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ user_id: string; n: bigint }[]>`
    SELECT user_id, count(*) AS n FROM (
      SELECT driver_id AS user_id FROM rides WHERE status = 'COMPLETED' AND driver_id = ANY(${ids}::uuid[])
      UNION ALL
      SELECT passenger_id FROM bookings WHERE status = 'COMPLETED' AND passenger_id = ANY(${ids}::uuid[])
    ) t GROUP BY user_id`;
  return new Map(rows.map((r) => [r.user_id, Number(r.n)]));
}

export function toRideSummary(
  r: RideWithDriver,
  counts: Map<string, number>,
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
    driver: toPublicUser(r.driver, counts.get(r.driverId) ?? 0),
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
