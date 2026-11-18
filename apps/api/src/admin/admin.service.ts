import { Injectable } from '@nestjs/common';
import { Prisma, type AdminUser, type Report, type ReportStatus, type Ride, type User, type UserProfile, type UserStatus } from '@prisma/client';
import {
  URGENT_REPORT_REASONS,
  adminCan,
  formatEgyptianMobile,
  maskEgyptianMobile,
  type AdminAuditRowDto,
  type AdminOverviewDto,
  type AdminPageQuery,
  type AdminReportDetailDto,
  type AdminReportRowDto,
  type AdminRideDetailDto,
  type AdminRideRowDto,
  type AdminUpdateReportInput,
  type AdminUserDetailDto,
  type AdminUserRowDto,
  type Paged,
  type ReportReason,
} from '@wasla/shared';
import { AuditService } from '../audit/audit.service';
import { TokensService } from '../auth/tokens.service';
import { conflict, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../rides/bookings.service';
import { toVehicleDto, userStats } from '../rides/ride-mapper';
import { RidesService } from '../rides/rides.service';
import { toRatingDto } from '../trust/trust.service';
import { displayNameOf } from '../users/display-name';

const PAGE_SIZE = 25;
const DAY = 24 * 3_600_000;

type WithProfile = User & { profile: UserProfile | null };
const nameOf = (u: WithProfile) => (u.profile ? displayNameOf(u.profile.fullName, u.profile.showFullLastName) : '—');
const routeOf = (r: Pick<Ride, 'originNameEn' | 'destinationNameEn'>) => `${r.originNameEn} → ${r.destinationNameEn}`;
const isUrgent = (r: Pick<Report, 'reason' | 'status'>) =>
  URGENT_REPORT_REASONS.includes(r.reason as ReportReason) && (r.status === 'OPEN' || r.status === 'IN_REVIEW');

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly rides: RidesService,
    private readonly bookings: BookingsService,
  ) {}

  private log(admin: AdminUser, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return this.audit.record({ actorType: 'ADMIN', actorId: admin.id, action, entityType, entityId, metadata });
  }

  // ---------- Overview ----------

  async overview(): Promise<AdminOverviewDto> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const [total, newLast7Days, drivers, suspended, upcoming, completedLast7Days, open, urgentOpen, todayRows, series] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { createdAt: { gt: weekAgo } } }),
      this.prisma.user.count({ where: { roles: { has: 'DRIVER' } } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.ride.count({ where: { status: 'SCHEDULED', departureAt: { gt: now } } }),
      this.prisma.ride.count({ where: { status: 'COMPLETED', completedAt: { gt: weekAgo } } }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.report.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] }, reason: { in: URGENT_REPORT_REASONS } } }),
      this.prisma.$queryRaw<{ departing: bigint; booked: bigint }[]>`
        SELECT
          (SELECT count(*) FROM rides WHERE status = 'SCHEDULED'
             AND (departure_at AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date) AS departing,
          (SELECT count(*) FROM bookings
             WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date) AS booked`,
      this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
               (SELECT count(*) FROM bookings
                 WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo')::date = d) AS n
        FROM generate_series((now() AT TIME ZONE 'Africa/Cairo')::date - 6, (now() AT TIME ZONE 'Africa/Cairo')::date, interval '1 day') AS d
        ORDER BY d`,
    ]);
    return {
      users: { total, newLast7Days, drivers, suspended },
      rides: { upcoming, departingToday: Number(todayRows[0]?.departing ?? 0), completedLast7Days },
      bookings: { today: Number(todayRows[0]?.booked ?? 0), last7Days: series.map((s) => ({ date: s.day, count: Number(s.n) })) },
      reports: { open, urgentOpen },
    };
  }

  // ---------- Users ----------

  private async userRows(admin: AdminUser, users: WithProfile[]): Promise<AdminUserRowDto[]> {
    const ids = users.map((u) => u.id);
    const [stats, reports] = await Promise.all([
      userStats(this.prisma, ids),
      this.prisma.report.groupBy({
        by: ['reportedUserId'],
        where: { reportedUserId: { in: ids }, status: { in: ['OPEN', 'IN_REVIEW'] } },
        _count: true,
      }),
    ]);
    const openBy = new Map(reports.map((r) => [r.reportedUserId, r._count]));
    const showContact = adminCan(admin.role, 'viewUserContact');
    return users.map((u) => {
      const s = stats.get(u.id)!;
      return {
        id: u.id,
        displayName: nameOf(u),
        phone: showContact ? formatEgyptianMobile(u.phoneE164) : maskEgyptianMobile(u.phoneE164),
        roles: u.roles,
        status: u.status,
        ratingAverage: s.ratingAverage,
        ratingCount: s.ratingCount,
        ridesCompleted: s.ridesCompleted,
        openReportsAgainst: openBy.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
      };
    });
  }

  /** Search by name or phone (any Egyptian format, last digits work too). */
  async users(admin: AdminUser, q: AdminPageQuery): Promise<Paged<AdminUserRowDto>> {
    const digits = (q.q ?? '').replace(/\D/g, '').replace(/^0+/, '');
    const where: Prisma.UserWhereInput = {
      ...(q.status && ['ACTIVE', 'SUSPENDED', 'DELETED'].includes(q.status) && { status: q.status as UserStatus }),
      ...(q.q && {
        OR: [
          { profile: { fullName: { contains: q.q, mode: 'insensitive' } } },
          ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : []),
        ],
      }),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { items: await this.userRows(admin, users), page: q.page, pageSize: PAGE_SIZE, total };
  }

  async user(admin: AdminUser, id: string): Promise<AdminUserDetailDto> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { profile: true, vehicles: { where: { isActive: true } } } });
    if (!u) throw notFound('USER_NOT_FOUND');
    const [row] = await this.userRows(admin, [u]);
    const [ratings, against, filed, rides, bookings] = await Promise.all([
      this.prisma.rating.findMany({
        where: { rateeId: id },
        include: { rater: { include: { profile: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.reportRows({ reportedUserId: id }, 20),
      this.reportRows({ reporterId: id }, 20),
      this.prisma.ride.findMany({ where: { driverId: id }, orderBy: { departureAt: 'desc' }, take: 10 }),
      this.prisma.booking.findMany({ where: { passengerId: id }, include: { ride: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    // Looking at someone's contact details is recorded.
    if (adminCan(admin.role, 'viewUserContact')) await this.log(admin, 'admin.user_viewed', 'user', id);
    return {
      ...row!,
      fullName: u.profile?.fullName ?? null,
      gender: u.profile?.gender ?? null,
      suspendedReason: u.suspendedReason,
      vehicles: u.vehicles.map((v) => toVehicleDto(v, true)),
      recentRatings: ratings.map((r) => ({ ...toRatingDto(r), raterName: nameOf(r.rater) })),
      reportsAgainst: against,
      reportsFiled: filed,
      recentRides: rides.map((r) => ({
        id: r.id,
        departureAt: r.departureAt.toISOString(),
        status: r.status,
        route: routeOf(r),
        seatsTotal: r.seatsTotal,
        seatsAvailable: r.seatsAvailable,
      })),
      recentBookings: bookings.map((b) => ({
        id: b.id,
        rideId: b.rideId,
        status: b.status,
        departureAt: b.ride.departureAt.toISOString(),
        route: routeOf(b.ride),
      })),
    };
  }

  /**
   * Suspends an account: signs it out everywhere, cancels its upcoming rides
   * (passengers are notified) and its active bookings, and records why.
   */
  async suspend(admin: AdminUser, id: string, reason: string): Promise<AdminUserDetailDto> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound('USER_NOT_FOUND');
    if (u.status !== 'SUSPENDED') {
      await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', suspendedReason: reason } });
      await this.tokens.revokeAllForUser(id);
      const upcoming = await this.prisma.ride.findMany({ where: { driverId: id, status: 'SCHEDULED' }, select: { id: true } });
      for (const r of upcoming) await this.rides.cancel(id, r.id);
      const active = await this.prisma.booking.findMany({
        where: { passengerId: id, status: { in: ['PENDING', 'CONFIRMED'] }, ride: { status: 'SCHEDULED', departureAt: { gt: new Date() } } },
        select: { id: true },
      });
      for (const b of active) await this.bookings.cancelByPassenger(id, b.id);
      await this.log(admin, 'admin.user_suspended', 'user', id, { reason, ridesCancelled: upcoming.length, bookingsCancelled: active.length });
    }
    return this.user(admin, id);
  }

  async reinstate(admin: AdminUser, id: string, reason: string): Promise<AdminUserDetailDto> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound('USER_NOT_FOUND');
    if (u.status === 'SUSPENDED') {
      await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', suspendedReason: null } });
      await this.log(admin, 'admin.user_reinstated', 'user', id, { reason });
    }
    return this.user(admin, id);
  }

  // ---------- Rides ----------

  private rideRow(r: Ride & { driver: WithProfile }): AdminRideRowDto {
    return {
      id: r.id,
      departureAt: r.departureAt.toISOString(),
      status: r.status,
      route: routeOf(r),
      driver: { id: r.driverId, displayName: nameOf(r.driver) },
      seatsTotal: r.seatsTotal,
      seatsAvailable: r.seatsAvailable,
      pricePerSeatPiasters: r.pricePerSeatPiasters,
      bookingMode: r.bookingMode,
      womenOnly: r.womenOnly,
    };
  }

  async ridesList(q: AdminPageQuery): Promise<Paged<AdminRideRowDto>> {
    const where: Prisma.RideWhereInput = {
      ...(q.status && ['SCHEDULED', 'CANCELLED', 'COMPLETED'].includes(q.status) && { status: q.status as Ride['status'] }),
      ...(q.q && {
        OR: [
          { originNameEn: { contains: q.q, mode: 'insensitive' } },
          { destinationNameEn: { contains: q.q, mode: 'insensitive' } },
          { originNameAr: { contains: q.q } },
          { destinationNameAr: { contains: q.q } },
        ],
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.ride.count({ where }),
      this.prisma.ride.findMany({
        where,
        include: { driver: { include: { profile: true } } },
        orderBy: { departureAt: 'desc' },
        skip: (q.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { items: rows.map((r) => this.rideRow(r)), page: q.page, pageSize: PAGE_SIZE, total };
  }

  async ride(id: string): Promise<AdminRideDetailDto> {
    const r = await this.prisma.ride.findUnique({
      where: { id },
      include: {
        driver: { include: { profile: true } },
        vehicle: true,
        bookings: { include: { passenger: { include: { profile: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw notFound('RIDE_NOT_FOUND');
    return {
      ...this.rideRow(r),
      vehicle: toVehicleDto(r.vehicle, true),
      notes: r.notes,
      cancelReason: r.cancelReason,
      bookings: r.bookings.map((b) => ({
        id: b.id,
        status: b.status,
        seats: b.seats,
        totalPiasters: b.totalPiasters,
        passenger: { id: b.passengerId, displayName: nameOf(b.passenger) },
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  /** Cancels a ride on the driver's behalf (passengers are notified as for any cancellation). */
  async cancelRide(admin: AdminUser, id: string, reason: string): Promise<AdminRideDetailDto> {
    const r = await this.prisma.ride.findUnique({ where: { id } });
    if (!r) throw notFound('RIDE_NOT_FOUND');
    if (r.status !== 'SCHEDULED') throw conflict('RIDE_NOT_SCHEDULED');
    await this.rides.cancel(r.driverId, id, reason);
    await this.log(admin, 'admin.ride_cancelled', 'ride', id, { reason });
    return this.ride(id);
  }

  // ---------- Reports ----------

  private async reportRows(where: Prisma.ReportWhereInput, take: number, skip = 0): Promise<AdminReportRowDto[]> {
    const rows = await this.prisma.report.findMany({
      where,
      include: { reporter: { include: { profile: true } }, reported: { include: { profile: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take,
      skip,
    });
    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      urgent: isUrgent(r),
      reporter: { id: r.reporterId, displayName: nameOf(r.reporter) },
      reported: { id: r.reportedUserId, displayName: nameOf(r.reported), status: r.reported.status },
      bookingId: r.bookingId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** `status=urgent` lists open safety and harassment reports. Open reports come first. */
  async reports(q: AdminPageQuery): Promise<Paged<AdminReportRowDto>> {
    const where: Prisma.ReportWhereInput =
      q.status === 'urgent'
        ? { status: { in: ['OPEN', 'IN_REVIEW'] }, reason: { in: URGENT_REPORT_REASONS } }
        : q.status && ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(q.status)
          ? { status: q.status as ReportStatus }
          : {};
    const [total, items] = await Promise.all([
      this.prisma.report.count({ where }),
      this.reportRows(where, PAGE_SIZE, (q.page - 1) * PAGE_SIZE),
    ]);
    return { items, page: q.page, pageSize: PAGE_SIZE, total };
  }

  async report(admin: AdminUser, id: string): Promise<AdminReportDetailDto> {
    const r = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { include: { profile: true } },
        reported: { include: { profile: true } },
        handledBy: true,
        booking: { include: { ride: { include: { driver: { include: { profile: true } } } } } },
      },
    });
    if (!r) throw notFound('REPORT_NOT_FOUND');
    let messages: AdminReportDetailDto['messages'] = null;
    if (r.bookingId && adminCan(admin.role, 'viewReportChat')) {
      const rows = await this.prisma.message.findMany({ where: { bookingId: r.bookingId }, orderBy: { createdAt: 'asc' }, take: 200 });
      messages = rows.map((m) => ({ senderId: m.senderId, body: m.body, createdAt: m.createdAt.toISOString() }));
      // Reading a private conversation is always recorded.
      await this.log(admin, 'admin.report_chat_viewed', 'report', id, { bookingId: r.bookingId, messages: rows.length });
    }
    const [row] = await this.reportRows({ id }, 1);
    return {
      ...row!,
      details: r.details,
      adminNote: r.adminNote,
      handledBy: r.handledBy?.name ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      ride: r.booking ? this.rideRow(r.booking.ride) : null,
      messages,
    };
  }

  async updateReport(admin: AdminUser, id: string, input: AdminUpdateReportInput): Promise<AdminReportDetailDto> {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw notFound('REPORT_NOT_FOUND');
    const closing = input.status === 'RESOLVED' || input.status === 'DISMISSED';
    await this.prisma.report.update({
      where: { id },
      data: {
        ...(input.status && { status: input.status as ReportStatus }),
        ...(input.adminNote !== undefined && { adminNote: input.adminNote || null }),
        handledById: admin.id,
        ...(closing ? { resolvedAt: new Date() } : input.status ? { resolvedAt: null } : {}),
      },
    });
    await this.log(admin, 'admin.report_updated', 'report', id, { from: r.status, to: input.status ?? r.status });
    return this.report(admin, id);
  }

  // ---------- Audit ----------

  /** `q` filters by action prefix (e.g. "admin." or "BOOKING_"); `status` by entity type. */
  async auditLog(q: AdminPageQuery): Promise<Paged<AdminAuditRowDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.q && { action: { startsWith: q.q } }),
      ...(q.status && { entityType: q.status }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    ]);
    return {
      items: rows.map((a) => ({
        id: a.id.toString(),
        actorType: a.actorType,
        actorId: a.actorId,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        metadata: a.metadata,
        ip: a.ip,
        createdAt: a.createdAt.toISOString(),
      })),
      page: q.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }
}
