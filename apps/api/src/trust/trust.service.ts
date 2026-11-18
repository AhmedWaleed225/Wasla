import { HttpStatus, Injectable } from '@nestjs/common';
import type { Rating, Report } from '@prisma/client';
import {
  DRIVER_ONLY_RATING_TAGS,
  TRUST_RULES,
  type BlockedUserDto,
  type CreateRatingData,
  type CreateReportData,
  type RatingDto,
  type RatingStatusDto,
  type RatingTag,
  type ReportDto,
} from '@wasla/shared';
import { AuditService } from '../audit/audit.service';
import { AppException, badRequest, conflict, forbidden, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../rides/bookings.service';
import { isAnyUniqueViolation, toPublicUser, userStats } from '../rides/ride-mapper';

const DAY = 24 * 3_600_000;

export const toRatingDto = (r: Rating): RatingDto => ({
  id: r.id,
  bookingId: r.bookingId,
  stars: r.stars,
  tags: r.tags as RatingTag[],
  comment: r.comment,
  createdAt: r.createdAt.toISOString(),
});

const toReportDto = (r: Report): ReportDto => ({
  id: r.id,
  bookingId: r.bookingId,
  reason: r.reason,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
  ) {}

  /** The booking's two parties, if the viewer is one of them; otherwise it "doesn't exist". */
  private async parties(viewerId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: { include: { driver: { include: { profile: true } } } },
        passenger: { include: { profile: true } },
      },
    });
    if (!booking) throw notFound('BOOKING_NOT_FOUND');
    const viewerIsDriver = booking.ride.driverId === viewerId;
    if (!viewerIsDriver && booking.passengerId !== viewerId) throw notFound('BOOKING_NOT_FOUND');
    const other = viewerIsDriver ? booking.passenger : booking.ride.driver;
    return { booking, viewerIsDriver, other };
  }

  private ratingDeadline(completedAt: Date | null): Date | null {
    return completedAt ? new Date(completedAt.getTime() + TRUST_RULES.ratingWindowDays * DAY) : null;
  }

  // ---------- Ratings ----------

  async ratingStatus(viewerId: string, bookingId: string): Promise<RatingStatusDto> {
    const { booking, viewerIsDriver, other } = await this.parties(viewerId, bookingId);
    const mine = await this.prisma.rating.findUnique({ where: { bookingId_raterId: { bookingId, raterId: viewerId } } });
    const deadline = this.ratingDeadline(booking.ride.completedAt);
    const stats = await userStats(this.prisma, [other.id]);
    return {
      bookingId,
      role: viewerIsDriver ? 'passenger' : 'driver',
      ratee: toPublicUser(other, stats.get(other.id)),
      canRate: booking.status === 'COMPLETED' && !mine && !!deadline && deadline.getTime() > Date.now(),
      deadline: booking.status === 'COMPLETED' ? (deadline?.toISOString() ?? null) : null,
      mine: mine ? toRatingDto(mine) : null,
    };
  }

  /**
   * Rates the other party of a completed booking, once, within the rating window.
   * Driving tags (safe driving, clean car…) only apply when rating a driver.
   */
  async rate(viewerId: string, bookingId: string, input: CreateRatingData): Promise<RatingDto> {
    const { booking, viewerIsDriver, other } = await this.parties(viewerId, bookingId);
    if (booking.status !== 'COMPLETED') throw conflict('RATING_NOT_ALLOWED');
    const deadline = this.ratingDeadline(booking.ride.completedAt);
    if (!deadline || deadline.getTime() <= Date.now()) throw conflict('RATING_WINDOW_CLOSED');
    const rateeIsDriver = !viewerIsDriver;
    if (!rateeIsDriver && input.tags.some((t) => DRIVER_ONLY_RATING_TAGS.includes(t as RatingTag))) {
      throw badRequest('RATING_TAG_NOT_ALLOWED', { tags: 'RATING_TAG_NOT_ALLOWED' });
    }
    try {
      const rating = await this.prisma.$transaction(async (tx) => {
        const created = await tx.rating.create({
          data: {
            bookingId,
            raterId: viewerId,
            rateeId: other.id,
            stars: input.stars,
            tags: input.tags,
            comment: input.comment || null,
          },
        });
        await this.audit.record(
          {
            actorType: 'USER',
            actorId: viewerId,
            action: 'RATING_CREATED',
            entityType: 'rating',
            entityId: created.id,
            metadata: { bookingId, stars: input.stars },
          },
          tx,
        );
        return created;
      });
      return toRatingDto(rating);
    } catch (err) {
      if (isAnyUniqueViolation(err)) throw conflict('RATING_ALREADY_EXISTS');
      throw err;
    }
  }

  // ---------- Reports ----------

  /**
   * Reports the other party of a booking the reporter was part of. Optionally
   * blocks them in the same step. Urgent reasons are surfaced first to staff.
   */
  async report(reporterId: string, input: CreateReportData): Promise<ReportDto> {
    const booking = await this.prisma.booking.findUnique({ where: { id: input.bookingId }, include: { ride: true } });
    const pair = booking ? [booking.passengerId, booking.ride.driverId] : [];
    if (!booking || !pair.includes(reporterId) || !pair.includes(input.reportedUserId) || reporterId === input.reportedUserId) {
      throw forbidden('REPORT_NOT_ALLOWED');
    }
    const today = await this.prisma.report.count({
      where: { reporterId, createdAt: { gt: new Date(Date.now() - DAY) } },
    });
    if (today >= TRUST_RULES.maxReportsPerDay) throw new AppException('REPORT_LIMIT', HttpStatus.TOO_MANY_REQUESTS);

    let report: Report;
    try {
      report = await this.prisma.$transaction(async (tx) => {
        const created = await tx.report.create({
          data: {
            reporterId,
            reportedUserId: input.reportedUserId,
            bookingId: input.bookingId,
            reason: input.reason as Report['reason'],
            details: input.details || null,
          },
        });
        await this.audit.record(
          {
            actorType: 'USER',
            actorId: reporterId,
            action: 'REPORT_CREATED',
            entityType: 'report',
            entityId: created.id,
            metadata: { reason: input.reason, reportedUserId: input.reportedUserId },
          },
          tx,
        );
        return created;
      });
    } catch (err) {
      if (isAnyUniqueViolation(err)) throw conflict('REPORT_ALREADY_OPEN');
      throw err;
    }
    if (input.block) await this.block(reporterId, input.reportedUserId);
    return toReportDto(report);
  }

  async myReports(reporterId: string): Promise<ReportDto[]> {
    const rows = await this.prisma.report.findMany({ where: { reporterId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map(toReportDto);
  }

  // ---------- Blocks ----------

  /** Idempotent. Also ends active bookings between the two on rides that haven't left. */
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw badRequest('BLOCK_SELF');
    const target = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) throw notFound('USER_NOT_FOUND');
    const existing = await this.prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } });
    if (!existing) {
      await this.prisma.block.create({ data: { blockerId, blockedId } });
      await this.audit.record({ actorType: 'USER', actorId: blockerId, action: 'USER_BLOCKED', entityType: 'user', entityId: blockedId });
    }
    await this.bookings.cancelForBlock(blockerId, blockedId);
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const res = await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    if (res.count > 0) {
      await this.audit.record({ actorType: 'USER', actorId: blockerId, action: 'USER_UNBLOCKED', entityType: 'user', entityId: blockedId });
    }
  }

  /** Only the people this user blocked (never who blocked them). */
  async blocked(blockerId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      include: { blocked: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const stats = await userStats(this.prisma, rows.map((r) => r.blockedId));
    return rows.map((r) => ({ user: toPublicUser(r.blocked, stats.get(r.blockedId)), blockedAt: r.createdAt.toISOString() }));
  }
}
