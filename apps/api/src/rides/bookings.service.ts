import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Booking, BookingStatus, Notification, Prisma } from '@prisma/client';
import { RIDE_RULES, type BookingDto } from '@wasla/shared';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, rideData } from '../notifications/notifications.service';
import { isBlockedEither } from '../trust/block-check';
import { displayNameOf } from '../users/display-name';
import { AppException, conflict, forbidden, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVE_STATUSES,
  userStats,
  isUniqueViolation,
  isAnyUniqueViolation,
  rideInclude,
  toBookingSummary,
  toRideSummary,
} from './ride-mapper';

type Tx = Prisma.TransactionClient;

export interface CreateBookingResult {
  booking: BookingDto;
  /** True when this was a retry of a request that had already succeeded. */
  replayed: boolean;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger('Bookings');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async nameOf(tx: Tx, userId: string): Promise<string> {
    const p = await tx.userProfile.findUnique({ where: { userId } });
    return p ? displayNameOf(p.fullName, p.showFullLastName) : '';
  }

  /**
   * Books seats. Correct under concurrency:
   *  1. the ride row is locked, so bookings on one ride run one at a time;
   *  2. the seat decrement is conditional (`seats_available >= n`) and a CHECK keeps it ≥ 0;
   *  3. a partial unique index allows one active booking per passenger per ride;
   *  4. an optional idempotency key makes a retried request return the first result.
   */
  async create(
    passengerId: string,
    rideId: string,
    input: { seats: number; pickupNote?: string },
    idempotencyKey?: string,
  ): Promise<CreateBookingResult> {
    if (idempotencyKey) {
      const prior = await this.findByKey(passengerId, idempotencyKey, rideId);
      if (prior) return prior;
    }

    const passenger = await this.prisma.user.findUniqueOrThrow({ where: { id: passengerId }, include: { profile: true } });
    if (!passenger.profile) throw forbidden('PROFILE_REQUIRED');

    try {
      const { booking, replayed, notes } = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM rides WHERE id = ${rideId}::uuid FOR UPDATE`;
        // A retry with the same key may have been waiting on the lock while the first attempt committed.
        if (idempotencyKey) {
          const prior = await tx.booking.findUnique({
            where: { passengerId_idempotencyKey: { passengerId, idempotencyKey } },
          });
          if (prior) {
            if (prior.rideId !== rideId) throw new AppException('IDEMPOTENCY_KEY_REUSED', HttpStatus.UNPROCESSABLE_ENTITY);
            return { booking: prior, replayed: true, notes: [] as Notification[] };
          }
        }
        const ride = await tx.ride.findUnique({ where: { id: rideId }, include: { driver: { select: { status: true } } } });
        if (!ride) throw notFound('RIDE_NOT_FOUND');
        if (ride.driverId === passengerId) throw forbidden('BOOKING_OWN_RIDE');
        if (ride.status !== 'SCHEDULED' || ride.driver.status !== 'ACTIVE') throw conflict('RIDE_NOT_SCHEDULED');
        if (ride.departureAt <= new Date()) throw conflict('RIDE_ALREADY_DEPARTED');
        if (ride.womenOnly && passenger.profile!.gender !== 'FEMALE') throw forbidden('BOOKING_WOMEN_ONLY');
        // Deliberately vague: the other person must not learn they were blocked.
        if (await isBlockedEither(tx, passengerId, ride.driverId)) throw forbidden('RIDE_NOT_AVAILABLE');

        const existing = await tx.booking.findFirst({
          where: { rideId, passengerId, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true },
        });
        if (existing) throw conflict('BOOKING_ALREADY_EXISTS');

        const taken = await tx.$executeRaw`
          UPDATE rides SET seats_available = seats_available - ${input.seats}, updated_at = now()
          WHERE id = ${rideId}::uuid AND status = 'SCHEDULED' AND seats_available >= ${input.seats}`;
        if (taken !== 1) throw conflict('BOOKING_NOT_ENOUGH_SEATS');

        const instant = ride.bookingMode === 'INSTANT';
        const ttlEnd = new Date(Date.now() + RIDE_RULES.pendingRequestTtlHours * 3_600_000);
        const created = await tx.booking.create({
          data: {
            rideId,
            passengerId,
            status: instant ? 'CONFIRMED' : 'PENDING',
            seats: input.seats,
            pricePerSeatPiasters: ride.pricePerSeatPiasters,
            totalPiasters: ride.pricePerSeatPiasters * input.seats,
            paymentMethod: 'CASH',
            pickupNote: input.pickupNote || null,
            idempotencyKey: idempotencyKey ?? null,
            expiresAt: instant ? null : ttlEnd < ride.departureAt ? ttlEnd : ride.departureAt,
            decidedAt: instant ? new Date() : null,
          },
        });
        await this.audit.record(
          {
            actorType: 'USER',
            actorId: passengerId,
            action: instant ? 'BOOKING_CONFIRMED' : 'BOOKING_REQUESTED',
            entityType: 'booking',
            entityId: created.id,
            metadata: { rideId, seats: input.seats },
          },
          tx,
        );
        const notes = await this.notifications.create(tx, [
          {
            userId: ride.driverId,
            type: instant ? 'BOOKING_CONFIRMED' : 'BOOKING_REQUESTED',
            rideId,
            bookingId: created.id,
            data: rideData(ride, displayNameOf(passenger.profile!.fullName, passenger.profile!.showFullLastName)),
          },
        ]);
        return { booking: created, replayed: false, notes };
      });
      this.notifications.dispatch(notes);
      return { booking: await this.toDto(booking, passengerId), replayed };
    } catch (err) {
      // Two identical retries raced: the other one won, so return its result.
      if (idempotencyKey && isUniqueViolation(err, 'idempotency_key')) {
        const prior = await this.findByKey(passengerId, idempotencyKey, rideId);
        if (prior) return prior;
      }
      // Parallel bookings by the same passenger: the partial unique index stopped the second.
      if (isAnyUniqueViolation(err)) throw conflict('BOOKING_ALREADY_EXISTS');
      throw err;
    }
  }

  async cancelByPassenger(passengerId: string, bookingId: string, reason?: string): Promise<BookingDto> {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, passengerId }, select: { rideId: true } });
    if (!b) throw notFound('BOOKING_NOT_FOUND');
    const { updated, notes } = await this.prisma.$transaction(async (tx) => {
      const ride = await this.lockRide(tx, b.rideId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (!ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number])) throw conflict('BOOKING_NOT_CANCELLABLE');
      if (ride.departureAt <= new Date()) throw conflict('BOOKING_NOT_CANCELLABLE');
      const result = await this.closeAndRelease(tx, booking, 'CANCELLED_BY_PASSENGER', { cancelReason: reason ?? null });
      await this.audit.record(
        { actorType: 'USER', actorId: passengerId, action: 'BOOKING_CANCELLED', entityType: 'booking', entityId: bookingId },
        tx,
      );
      const notes = await this.notifications.create(tx, [
        { userId: ride.driverId, type: 'BOOKING_CANCELLED', rideId: ride.id, bookingId, data: rideData(ride, await this.nameOf(tx, passengerId)) },
      ]);
      return { updated: result, notes };
    });
    this.notifications.dispatch(notes);
    return this.toDto(updated, passengerId);
  }

  async decide(driverId: string, bookingId: string, accept: boolean): Promise<BookingDto> {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, ride: { driverId } },
      select: { rideId: true },
    });
    if (!b) throw notFound('BOOKING_NOT_FOUND');
    const { updated, notes } = await this.prisma.$transaction(async (tx) => {
      const ride = await this.lockRide(tx, b.rideId);
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      const now = new Date();
      if (booking.status !== 'PENDING' || (booking.expiresAt && booking.expiresAt <= now)) throw conflict('BOOKING_NOT_PENDING');
      if (ride.status !== 'SCHEDULED') throw conflict('RIDE_NOT_SCHEDULED');
      const result = accept
        ? await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED', decidedAt: now } })
        : await this.closeAndRelease(tx, booking, 'DECLINED', { decidedAt: now });
      await this.audit.record(
        {
          actorType: 'USER',
          actorId: driverId,
          action: accept ? 'BOOKING_ACCEPTED' : 'BOOKING_DECLINED',
          entityType: 'booking',
          entityId: bookingId,
        },
        tx,
      );
      const notes = await this.notifications.create(tx, [
        {
          userId: booking.passengerId,
          type: accept ? 'BOOKING_ACCEPTED' : 'BOOKING_DECLINED',
          rideId: ride.id,
          bookingId,
          data: rideData(ride, await this.nameOf(tx, driverId)),
        },
      ]);
      return { updated: result, notes };
    });
    this.notifications.dispatch(notes);
    return this.toDto(updated, driverId);
  }

  /** Booking visible to its passenger and to the ride's driver. */
  async get(viewerId: string, bookingId: string): Promise<BookingDto> {
    const b = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ passengerId: viewerId }, { ride: { driverId: viewerId } }] },
    });
    if (!b) throw notFound('BOOKING_NOT_FOUND');
    return this.toDto(b, viewerId);
  }

  /** Upcoming: holds a seat on an open ride. Past: everything else. */
  async listMine(passengerId: string, scope: 'upcoming' | 'past'): Promise<BookingDto[]> {
    const upcoming = scope === 'upcoming';
    const rows = await this.prisma.booking.findMany({
      where: upcoming
        ? { passengerId, status: { in: [...ACTIVE_STATUSES] }, ride: { status: 'SCHEDULED' } }
        : { passengerId, NOT: { status: { in: [...ACTIVE_STATUSES] }, ride: { status: 'SCHEDULED' } } },
      include: { ride: { include: rideInclude } },
      orderBy: { ride: { departureAt: upcoming ? 'asc' : 'desc' } },
      take: 50,
    });
    const counts = await userStats(this.prisma, rows.map((r) => r.ride.driverId));
    return rows.map((b) => ({
      ...toBookingSummary(b),
      ride: toRideSummary(b.ride, counts, { showPlate: b.status === 'CONFIRMED' || b.status === 'COMPLETED' }),
    }));
  }

  /**
   * When one person blocks another, active bookings between them on rides that
   * haven't left are cancelled and their seats returned. The other person is told
   * their booking ended, not that they were blocked.
   */
  async cancelForBlock(blockerId: string, otherId: string): Promise<number> {
    const between = await this.prisma.booking.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        ride: { status: 'SCHEDULED', departureAt: { gt: new Date() } },
        OR: [
          { passengerId: blockerId, ride: { driverId: otherId } },
          { passengerId: otherId, ride: { driverId: blockerId } },
        ],
      },
      select: { id: true, rideId: true },
    });
    let cancelled = 0;
    for (const b of between) {
      const notes = await this.prisma.$transaction(async (tx) => {
        const ride = await this.lockRide(tx, b.rideId);
        const booking = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
        if (!ACTIVE_STATUSES.includes(booking.status as (typeof ACTIVE_STATUSES)[number])) return [];
        const blockerIsPassenger = booking.passengerId === blockerId;
        await this.closeAndRelease(tx, booking, blockerIsPassenger ? 'CANCELLED_BY_PASSENGER' : 'CANCELLED_BY_DRIVER', {});
        await this.audit.record(
          { actorType: 'USER', actorId: blockerId, action: 'BOOKING_CANCELLED_BY_BLOCK', entityType: 'booking', entityId: booking.id },
          tx,
        );
        cancelled += 1;
        return this.notifications.create(tx, [
          blockerIsPassenger
            ? { userId: ride.driverId, type: 'BOOKING_CANCELLED', rideId: ride.id, bookingId: booking.id, data: rideData(ride, await this.nameOf(tx, blockerId)) }
            : { userId: booking.passengerId, type: 'BOOKING_DECLINED', rideId: ride.id, bookingId: booking.id, data: rideData(ride, await this.nameOf(tx, blockerId)) },
        ]);
      });
      this.notifications.dispatch(notes);
    }
    return cancelled;
  }

  /** Lapses unanswered requests and gives their seats back. Safe to run on several instances at once. */
  async expireDue(limit = 200): Promise<number> {
    const due = await this.prisma.booking.findMany({
      where: { status: 'PENDING', expiresAt: { lte: new Date() } },
      select: { id: true, rideId: true },
      take: limit,
    });
    let expired = 0;
    for (const d of due) {
      try {
        const notes = await this.prisma.$transaction(async (tx) => {
          const ride = await this.lockRide(tx, d.rideId);
          const booking = await tx.booking.findUniqueOrThrow({ where: { id: d.id } });
          if (booking.status !== 'PENDING') return []; // answered meanwhile
          await this.closeAndRelease(tx, booking, 'EXPIRED', {});
          await this.audit.record({ actorType: 'SYSTEM', action: 'BOOKING_EXPIRED', entityType: 'booking', entityId: d.id }, tx);
          expired += 1;
          return this.notifications.create(tx, [
            { userId: booking.passengerId, type: 'BOOKING_EXPIRED', rideId: ride.id, bookingId: booking.id, data: rideData(ride) },
          ]);
        });
        this.notifications.dispatch(notes);
      } catch (err) {
        this.logger.error({ err, bookingId: d.id }, 'Failed to expire booking');
      }
    }
    return expired;
  }

  // ---------- helpers ----------

  private async lockRide(tx: Tx, rideId: string) {
    await tx.$queryRaw`SELECT id FROM rides WHERE id = ${rideId}::uuid FOR UPDATE`;
    return tx.ride.findUniqueOrThrow({ where: { id: rideId } });
  }

  /** Ends an active booking and returns its seats to the ride (caller holds the ride lock). */
  private async closeAndRelease(
    tx: Tx,
    booking: Booking,
    status: BookingStatus,
    extra: Prisma.BookingUpdateInput,
  ): Promise<Booking> {
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { status, ...(status.startsWith('CANCELLED') && { cancelledAt: new Date() }), ...extra },
    });
    await tx.$executeRaw`
      UPDATE rides SET seats_available = seats_available + ${booking.seats}, updated_at = now()
      WHERE id = ${booking.rideId}::uuid AND status = 'SCHEDULED'`;
    return updated;
  }

  private async findByKey(passengerId: string, key: string, rideId: string): Promise<CreateBookingResult | null> {
    const prior = await this.prisma.booking.findUnique({
      where: { passengerId_idempotencyKey: { passengerId, idempotencyKey: key } },
    });
    if (!prior) return null;
    if (prior.rideId !== rideId) throw new AppException('IDEMPOTENCY_KEY_REUSED', HttpStatus.UNPROCESSABLE_ENTITY);
    return { booking: await this.toDto(prior, passengerId), replayed: true };
  }

  private async toDto(b: Booking, viewerId: string): Promise<BookingDto> {
    const ride = await this.prisma.ride.findUniqueOrThrow({ where: { id: b.rideId }, include: rideInclude });
    const counts = await userStats(this.prisma, [ride.driverId]);
    const isDriver = ride.driverId === viewerId;
    const showPlate = isDriver || b.status === 'CONFIRMED' || b.status === 'COMPLETED';
    return { ...toBookingSummary(b), ride: toRideSummary(ride, counts, { showPlate }) };
  }
}
