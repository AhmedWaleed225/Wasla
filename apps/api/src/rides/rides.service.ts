import { Injectable } from '@nestjs/common';
import { Prisma, type Ride } from '@prisma/client';
import {
  PIASTERS_PER_EGP,
  RIDE_RULES,
  SEARCH_RULES,
  distanceKm,
  type CreateRideData,
  type PlacePointInput,
  type RideDetailDto,
  type RideSearchQuery,
  type RideSearchResultDto,
  type RideSummaryDto,
  type UpdateRideInput,
} from '@wasla/shared';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, rideData } from '../notifications/notifications.service';
import { isBlockedEither, notBlockedSql } from '../trust/block-check';
import { displayNameOf } from '../users/display-name';
import { badRequest, conflict, forbidden, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVE_STATUSES,
  userStats,
  priceLimitsFor,
  rideInclude,
  toBookingSummary,
  toPublicUser,
  toRideSummary,
  type RideWithDriver,
} from './ride-mapper';

interface ResolvedPoint {
  locationId: string | null;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

type Tx = Prisma.TransactionClient;

const MINUTE = 60_000;

@Injectable()
export class RidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Publishing ----------

  async create(userId: string, input: CreateRideData): Promise<RideDetailDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    if (!user.roles.includes('DRIVER')) throw forbidden('DRIVER_ROLE_REQUIRED');
    if (!user.profile) throw forbidden('PROFILE_REQUIRED');

    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: input.vehicleId, ownerId: userId, isActive: true } });
    if (!vehicle) throw notFound('VEHICLE_NOT_FOUND');
    if (input.seats > vehicle.seats) throw badRequest('RIDE_SEATS_EXCEED_VEHICLE', { seats: 'RIDE_SEATS_EXCEED_VEHICLE' });

    const departureAt = new Date(input.departureAt);
    this.checkDepartureWindow(departureAt);

    const [origin, destination] = await Promise.all([this.resolvePoint(input.origin), this.resolvePoint(input.destination)]);
    const km = distanceKm(origin, destination);
    if (km < RIDE_RULES.minDistanceKm) throw badRequest('RIDE_TOO_SHORT', { destination: 'RIDE_TOO_SHORT' });
    this.checkPrice(input.pricePerSeatEgp, km);

    if (input.womenOnly && user.profile.gender !== 'FEMALE') throw forbidden('RIDE_WOMEN_ONLY_DRIVER');

    const p = user.profile;
    const prefs = input.preferences ?? {};

    const ride = await this.prisma.$transaction(async (tx) => {
      // Serialise this driver's publishes so two parallel requests can't both pass the overlap check.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await this.checkNoOverlap(tx, userId, departureAt);
      const created = await tx.ride.create({
        data: {
          driverId: userId,
          vehicleId: vehicle.id,
          departureAt,
          originLocationId: origin.locationId,
          originNameEn: origin.nameEn,
          originNameAr: origin.nameAr,
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLocationId: destination.locationId,
          destinationNameEn: destination.nameEn,
          destinationNameAr: destination.nameAr,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          distanceKm: km,
          seatsTotal: input.seats,
          seatsAvailable: input.seats,
          pricePerSeatPiasters: input.pricePerSeatEgp * PIASTERS_PER_EGP,
          bookingMode: input.bookingMode as Ride['bookingMode'],
          womenOnly: input.womenOnly,
          notes: input.notes || null,
          prefQuiet: prefs.quietRides ?? p.prefQuiet,
          prefMusicOk: prefs.musicOk ?? p.prefMusicOk,
          prefAc: prefs.acPreferred ?? p.prefAc,
          prefSmokingOk: prefs.smokingOk ?? p.prefSmokingOk,
        },
      });
      await this.audit.record(
        { actorType: 'USER', actorId: userId, action: 'RIDE_PUBLISHED', entityType: 'ride', entityId: created.id },
        tx,
      );
      return created;
    });
    return this.detail(userId, ride.id);
  }

  async update(userId: string, rideId: string, input: UpdateRideInput): Promise<RideDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const ride = await this.lockOwnRide(tx, userId, rideId);
      if (ride.status !== 'SCHEDULED') throw conflict('RIDE_NOT_SCHEDULED');
      if (ride.departureAt <= new Date()) throw conflict('RIDE_ALREADY_DEPARTED');

      const booked = ride.seatsTotal - ride.seatsAvailable;
      const data: Prisma.RideUpdateInput = {};

      const changesTerms =
        (input.pricePerSeatEgp !== undefined && input.pricePerSeatEgp * PIASTERS_PER_EGP !== ride.pricePerSeatPiasters) ||
        (input.departureAt !== undefined && new Date(input.departureAt).getTime() !== ride.departureAt.getTime());
      if (changesTerms) {
        const active = await tx.booking.count({ where: { rideId, status: { in: [...ACTIVE_STATUSES] } } });
        if (active > 0) throw conflict('RIDE_HAS_BOOKINGS');
      }

      if (input.seats !== undefined) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: ride.vehicleId } });
        if (input.seats > vehicle.seats) throw badRequest('RIDE_SEATS_EXCEED_VEHICLE', { seats: 'RIDE_SEATS_EXCEED_VEHICLE' });
        if (input.seats < booked) throw conflict('RIDE_SEATS_BELOW_BOOKED');
        data.seatsTotal = input.seats;
        data.seatsAvailable = input.seats - booked;
      }
      if (input.pricePerSeatEgp !== undefined) {
        this.checkPrice(input.pricePerSeatEgp, ride.distanceKm);
        data.pricePerSeatPiasters = input.pricePerSeatEgp * PIASTERS_PER_EGP;
      }
      if (input.departureAt !== undefined) {
        const dep = new Date(input.departureAt);
        this.checkDepartureWindow(dep);
        await this.checkNoOverlap(tx, userId, dep, rideId);
        data.departureAt = dep;
      }
      if (input.notes !== undefined) data.notes = input.notes || null;

      await tx.ride.update({ where: { id: rideId }, data });
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: userId,
          action: 'RIDE_UPDATED',
          entityType: 'ride',
          entityId: rideId,
          metadata: { fields: Object.keys(input) },
        },
        tx,
      );
    });
    return this.detail(userId, rideId);
  }

  /** Cancels the ride and every active booking on it, in one transaction. */
  async cancel(userId: string, rideId: string, reason?: string): Promise<RideDetailDto> {
    const notes = await this.prisma.$transaction(async (tx) => {
      const ride = await this.lockOwnRide(tx, userId, rideId);
      if (ride.status !== 'SCHEDULED') throw conflict('RIDE_NOT_SCHEDULED');
      const now = new Date();
      const toTell = await tx.booking.findMany({
        where: { rideId, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true, passengerId: true },
      });
      const affected = await tx.booking.updateMany({
        where: { rideId, status: { in: [...ACTIVE_STATUSES] } },
        data: { status: 'CANCELLED_BY_DRIVER', cancelledAt: now, cancelReason: reason ?? null },
      });
      await tx.ride.update({
        where: { id: rideId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason ?? null, seatsAvailable: ride.seatsTotal },
      });
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: userId,
          action: 'RIDE_CANCELLED',
          entityType: 'ride',
          entityId: rideId,
          metadata: { bookingsCancelled: affected.count },
        },
        tx,
      );
      const driverName = await this.nameOf(tx, userId);
      return this.notifications.create(
        tx,
        toTell.map((b) => ({ userId: b.passengerId, type: 'RIDE_CANCELLED' as const, rideId, bookingId: b.id, data: rideData(ride, driverName) })),
      );
    });
    this.notifications.dispatch(notes);
    return this.detail(userId, rideId);
  }

  /** After departure the driver closes the ride: confirmed seats complete, unanswered requests lapse. */
  async complete(userId: string, rideId: string): Promise<RideDetailDto> {
    const notes = await this.prisma.$transaction(async (tx) => {
      const ride = await this.lockOwnRide(tx, userId, rideId);
      if (ride.status !== 'SCHEDULED') throw conflict('RIDE_NOT_SCHEDULED');
      if (ride.departureAt > new Date()) throw conflict('RIDE_NOT_DEPARTED');
      const riders = await tx.booking.findMany({ where: { rideId, status: 'CONFIRMED' }, select: { id: true, passengerId: true } });
      await tx.booking.updateMany({ where: { rideId, status: 'CONFIRMED' }, data: { status: 'COMPLETED' } });
      await tx.booking.updateMany({ where: { rideId, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await tx.ride.update({ where: { id: rideId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await this.audit.record(
        { actorType: 'USER', actorId: userId, action: 'RIDE_COMPLETED', entityType: 'ride', entityId: rideId },
        tx,
      );
      return this.notifications.create(
        tx,
        riders.map((b) => ({ userId: b.passengerId, type: 'RIDE_COMPLETED' as const, rideId, bookingId: b.id, data: rideData(ride) })),
      );
    });
    this.notifications.dispatch(notes);
    return this.detail(userId, rideId);
  }

  // ---------- Reading ----------

  /**
   * Open rides are visible to any signed-in user (so they can book).
   * Closed rides only to the driver and to people who booked them.
   */
  async detail(viewerId: string, rideId: string): Promise<RideDetailDto> {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId }, include: rideInclude });
    if (!ride) throw notFound('RIDE_NOT_FOUND');
    const isMine = ride.driverId === viewerId;

    const myBooking = isMine
      ? null
      : await this.prisma.booking.findFirst({ where: { rideId, passengerId: viewerId }, orderBy: { createdAt: 'desc' } });
    if (!isMine && ride.status !== 'SCHEDULED' && !myBooking) throw notFound('RIDE_NOT_FOUND');
    if (!isMine && ride.driver.status !== 'ACTIVE' && !myBooking) throw notFound('RIDE_NOT_FOUND');
    if (!isMine && !myBooking && (await isBlockedEither(this.prisma, viewerId, ride.driverId))) throw notFound('RIDE_NOT_FOUND');

    const driverBookings = isMine
      ? await this.prisma.booking.findMany({
          where: { rideId },
          include: { passenger: { include: { profile: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const counts = await userStats(this.prisma, [ride.driverId, ...driverBookings.map((b) => b.passengerId)]);
    const showPlate = isMine || myBooking?.status === 'CONFIRMED' || myBooking?.status === 'COMPLETED';

    return {
      ...toRideSummary(ride, counts, { showPlate }),
      notes: ride.notes,
      preferences: {
        quietRides: ride.prefQuiet,
        musicOk: ride.prefMusicOk,
        acPreferred: ride.prefAc,
        smokingOk: ride.prefSmokingOk,
      },
      priceLimits: priceLimitsFor(ride.distanceKm),
      isMine,
      myBooking: myBooking ? toBookingSummary(myBooking) : null,
      bookings: isMine
        ? driverBookings.map((b) => ({
            ...toBookingSummary(b),
            passenger: toPublicUser(b.passenger, counts.get(b.passengerId)),
          }))
        : null,
      cancelReason: ride.cancelReason,
    };
  }

  /** The driver's own rides. Upcoming: still open (including ones awaiting "complete"). */
  async listMine(userId: string, scope: 'upcoming' | 'past'): Promise<RideSummaryDto[]> {
    const rides = await this.prisma.ride.findMany({
      where: { driverId: userId, status: scope === 'upcoming' ? 'SCHEDULED' : { in: ['CANCELLED', 'COMPLETED'] } },
      include: rideInclude,
      orderBy: { departureAt: scope === 'upcoming' ? 'asc' : 'desc' },
      take: 50,
    });
    const counts = await userStats(this.prisma, [userId]);
    return rides.map((r) => toRideSummary(r, counts, { showPlate: true }));
  }

  /**
   * Rides leaving on a given Egyptian calendar day whose start and end are both
   * within `radiusKm` of what the passenger searched. Hides full, past, own,
   * suspended drivers' and (for non-women) women-only rides.
   */
  async search(viewerId: string, q: RideSearchQuery): Promise<RideSearchResultDto> {
    const [from, to] = await Promise.all([
      this.resolveSearchEnd(q.fromLocationId, q.fromLat, q.fromLng),
      this.resolveSearchEnd(q.toLocationId, q.toLat, q.toLng),
    ]);
    const viewer = await this.prisma.userProfile.findUnique({ where: { userId: viewerId }, select: { gender: true } });
    const canSeeWomenOnly = viewer?.gender === 'FEMALE';

    // Bounding box in degrees (1° latitude ≈ 111 km) narrows rows before the exact distance check.
    const dLat = q.radiusKm / 111;
    const dLng = q.radiusKm / (111 * Math.cos((from.lat * Math.PI) / 180));

    const hits = await this.prisma.$queryRaw<{ id: string; pickup_km: number; dropoff_km: number }[]>`
      SELECT id, pickup_km, dropoff_km FROM (
        SELECT r.id, r.departure_at,
               wasla_distance_km(r.origin_lat, r.origin_lng, ${from.lat}, ${from.lng}) AS pickup_km,
               wasla_distance_km(r.destination_lat, r.destination_lng, ${to.lat}, ${to.lng}) AS dropoff_km
        FROM rides r
        JOIN users d ON d.id = r.driver_id AND d.status = 'ACTIVE'
        WHERE r.status = 'SCHEDULED'
          AND r.departure_at > now()
          AND (r.departure_at AT TIME ZONE 'Africa/Cairo')::date = ${q.date}::date
          AND r.seats_available >= ${q.seats}
          AND r.driver_id <> ${viewerId}::uuid
          AND (NOT r.women_only OR ${canSeeWomenOnly})
          AND ${notBlockedSql(viewerId, Prisma.sql`r.driver_id`)}
          AND r.origin_lat BETWEEN ${from.lat - dLat} AND ${from.lat + dLat}
          AND r.origin_lng BETWEEN ${from.lng - dLng} AND ${from.lng + dLng}
      ) m
      WHERE pickup_km <= ${q.radiusKm} AND dropoff_km <= ${q.radiusKm}
      ORDER BY departure_at ASC, pickup_km + dropoff_km ASC
      LIMIT ${SEARCH_RULES.maxResults}`;

    if (hits.length === 0) return { rides: [], from, to };
    const rides = await this.prisma.ride.findMany({ where: { id: { in: hits.map((h) => h.id) } }, include: rideInclude });
    const byId = new Map(rides.map((r) => [r.id, r]));
    const counts = await userStats(this.prisma, rides.map((r) => r.driverId));
    return {
      from,
      to,
      rides: hits
        .map((h) => {
          const r = byId.get(h.id);
          return r
            ? toRideSummary(r, counts, { showPlate: false, match: { pickupKm: h.pickup_km, dropoffKm: h.dropoff_km } })
            : null;
        })
        .filter((r): r is RideSummaryDto => r !== null),
    };
  }

  // ---------- Rules ----------

  private async nameOf(tx: Tx, userId: string): Promise<string> {
    const p = await tx.userProfile.findUnique({ where: { userId } });
    return p ? displayNameOf(p.fullName, p.showFullLastName) : '';
  }

  private checkDepartureWindow(dep: Date) {
    const now = Date.now();
    if (dep.getTime() < now + RIDE_RULES.minLeadMinutes * MINUTE) {
      throw badRequest('RIDE_DEPARTURE_TOO_SOON', { departureAt: 'RIDE_DEPARTURE_TOO_SOON' });
    }
    if (dep.getTime() > now + RIDE_RULES.maxDaysAhead * 24 * 60 * MINUTE) {
      throw badRequest('RIDE_DEPARTURE_TOO_FAR', { departureAt: 'RIDE_DEPARTURE_TOO_FAR' });
    }
  }

  private checkPrice(egp: number, km: number) {
    const limits = priceLimitsFor(km);
    if (egp < limits.min) throw badRequest('RIDE_PRICE_TOO_LOW', { pricePerSeatEgp: 'RIDE_PRICE_TOO_LOW' });
    if (egp > limits.max) throw badRequest('RIDE_PRICE_TOO_HIGH', { pricePerSeatEgp: 'RIDE_PRICE_TOO_HIGH' });
  }

  private async checkNoOverlap(tx: Tx, driverId: string, dep: Date, exceptRideId?: string) {
    const window = RIDE_RULES.driverOverlapMinutes * MINUTE;
    const clash = await tx.ride.findFirst({
      where: {
        driverId,
        status: 'SCHEDULED',
        departureAt: { gt: new Date(dep.getTime() - window), lt: new Date(dep.getTime() + window) },
        ...(exceptRideId && { id: { not: exceptRideId } }),
      },
      select: { id: true },
    });
    if (clash) throw conflict('RIDE_OVERLAP');
  }

  /** Locks the ride row for the rest of the transaction; bookings on it wait until we commit. */
  private async lockOwnRide(tx: Tx, userId: string, rideId: string): Promise<Ride> {
    await tx.$queryRaw`SELECT id FROM rides WHERE id = ${rideId}::uuid FOR UPDATE`;
    const ride = await tx.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.driverId !== userId) throw notFound('RIDE_NOT_FOUND');
    return ride;
  }

  private async resolvePoint(p: PlacePointInput): Promise<ResolvedPoint> {
    if (p.locationId) {
      const loc = await this.prisma.location.findFirst({ where: { id: p.locationId, isActive: true } });
      if (!loc) throw notFound('LOCATION_NOT_FOUND');
      if (loc.lat === null || loc.lng === null) throw badRequest('PLACE_NO_COORDINATES');
      return { locationId: loc.id, nameEn: loc.nameEn, nameAr: loc.nameAr, lat: loc.lat, lng: loc.lng };
    }
    // Validated by placePointSchema: a pin always carries lat, lng and a label.
    const label = p.label!;
    return { locationId: null, nameEn: label, nameAr: label, lat: p.lat!, lng: p.lng! };
  }

  private async resolveSearchEnd(locationId?: string, lat?: number, lng?: number) {
    if (locationId) {
      const loc = await this.prisma.location.findFirst({ where: { id: locationId, isActive: true } });
      if (!loc) throw notFound('LOCATION_NOT_FOUND');
      if (loc.lat === null || loc.lng === null) throw badRequest('PLACE_NO_COORDINATES');
      return { lat: loc.lat, lng: loc.lng };
    }
    return { lat: lat!, lng: lng! };
  }
}

export type { RideWithDriver };
