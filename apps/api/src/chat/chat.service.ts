import { Injectable } from '@nestjs/common';
import type { Booking, Message, Ride } from '@prisma/client';
import { CHAT_RULES, type ConversationDto, type MessageDto, type MessagePageDto } from '@wasla/shared';
import { conflict, notFound } from '../common/app-exception';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { completedCounts, toPublicUser } from '../rides/ride-mapper';
import { displayNameOf } from '../users/display-name';

const OPEN_STATUSES = new Set(['PENDING', 'CONFIRMED', 'COMPLETED']);

/** Sending is allowed while the booking stands, until a day after departure. Reading always is. */
export function isChatOpen(booking: Pick<Booking, 'status'>, ride: Pick<Ride, 'status' | 'departureAt'>, now = new Date()): boolean {
  if (!OPEN_STATUSES.has(booking.status) || ride.status === 'CANCELLED') return false;
  return now.getTime() <= ride.departureAt.getTime() + CHAT_RULES.openHoursAfterDeparture * 3_600_000;
}

const toMessage = (m: Message, viewerId: string): MessageDto => ({
  id: m.id,
  bookingId: m.bookingId,
  senderId: m.senderId,
  mine: m.senderId === viewerId,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The booking, if the viewer is its passenger or its ride's driver. Otherwise it "doesn't exist". */
  private async thread(viewerId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { ride: true } });
    if (!booking) throw notFound('BOOKING_NOT_FOUND');
    const isDriver = booking.ride.driverId === viewerId;
    if (!isDriver && booking.passengerId !== viewerId) throw notFound('BOOKING_NOT_FOUND');
    const otherId = isDriver ? booking.passengerId : booking.ride.driverId;
    return { booking, ride: booking.ride, isDriver, otherId };
  }

  async messages(viewerId: string, bookingId: string, page: { before?: string; after?: string }): Promise<MessagePageDto> {
    const { booking, ride, otherId } = await this.thread(viewerId, bookingId);
    const anchorId = page.after ?? page.before;
    const anchor = anchorId ? await this.prisma.message.findFirst({ where: { id: anchorId, bookingId } }) : null;

    let rows: Message[];
    if (anchor && page.after) {
      rows = await this.prisma.message.findMany({
        where: { bookingId, OR: [{ createdAt: { gt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { gt: anchor.id } }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: CHAT_RULES.pageSize,
      });
    } else {
      rows = (
        await this.prisma.message.findMany({
          where: {
            bookingId,
            ...(anchor && {
              OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }],
            }),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: CHAT_RULES.pageSize,
        })
      ).reverse();
    }
    const otherRead = await this.prisma.chatRead.findUnique({ where: { bookingId_userId: { bookingId, userId: otherId } } });
    return {
      items: rows.map((m) => toMessage(m, viewerId)),
      open: isChatOpen(booking, ride),
      otherReadAt: otherRead?.lastReadAt.toISOString() ?? null,
    };
  }

  async send(viewerId: string, bookingId: string, body: string): Promise<MessageDto> {
    const { booking, ride, otherId } = await this.thread(viewerId, bookingId);
    if (!isChatOpen(booking, ride)) throw conflict('CHAT_CLOSED');
    const now = new Date();
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({ data: { bookingId, senderId: viewerId, body } }),
      this.prisma.chatRead.upsert({
        where: { bookingId_userId: { bookingId, userId: viewerId } },
        create: { bookingId, userId: viewerId, lastReadAt: now },
        update: { lastReadAt: now },
      }),
    ]);
    const sender = await this.prisma.userProfile.findUnique({ where: { userId: viewerId } });
    this.notifications.pushMessage(otherId, sender ? displayNameOf(sender.fullName, sender.showFullLastName) : 'Wasla', body, bookingId);
    return toMessage(message, viewerId);
  }

  async markRead(viewerId: string, bookingId: string): Promise<void> {
    await this.thread(viewerId, bookingId);
    const now = new Date();
    await this.prisma.chatRead.upsert({
      where: { bookingId_userId: { bookingId, userId: viewerId } },
      create: { bookingId, userId: viewerId, lastReadAt: now },
      update: { lastReadAt: now },
    });
  }

  /** Threads the viewer is part of: active bookings, plus any that already have messages. Newest activity first. */
  async conversations(viewerId: string): Promise<ConversationDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [{ passengerId: viewerId }, { ride: { driverId: viewerId } }],
        AND: [{ OR: [{ status: { in: ['PENDING', 'CONFIRMED'] } }, { messages: { some: {} } }] }],
      },
      include: {
        ride: { include: { driver: { include: { profile: true } } } },
        passenger: { include: { profile: true } },
      },
      take: 100,
    });
    if (bookings.length === 0) return [];
    const ids = bookings.map((b) => b.id);

    const [lastMessages, unread, counts] = await Promise.all([
      this.prisma.$queryRaw<Message[]>`
        SELECT DISTINCT ON (booking_id) id, booking_id AS "bookingId", sender_id AS "senderId", body, created_at AS "createdAt"
        FROM messages WHERE booking_id = ANY(${ids}::uuid[])
        ORDER BY booking_id, created_at DESC, id DESC`,
      this.prisma.$queryRaw<{ booking_id: string; n: bigint }[]>`
        SELECT m.booking_id, count(*) AS n
        FROM messages m
        LEFT JOIN chat_reads r ON r.booking_id = m.booking_id AND r.user_id = ${viewerId}::uuid
        WHERE m.booking_id = ANY(${ids}::uuid[]) AND m.sender_id <> ${viewerId}::uuid
          AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
        GROUP BY m.booking_id`,
      completedCounts(this.prisma, bookings.flatMap((b) => [b.passengerId, b.ride.driverId])),
    ]);
    const lastBy = new Map(lastMessages.map((m) => [m.bookingId, m]));
    const unreadBy = new Map(unread.map((u) => [u.booking_id, Number(u.n)]));

    return bookings
      .map((b): ConversationDto => {
        const isDriver = b.ride.driverId === viewerId;
        const other = isDriver ? b.passenger : b.ride.driver;
        const last = lastBy.get(b.id);
        return {
          bookingId: b.id,
          bookingStatus: b.status,
          open: isChatOpen(b, b.ride),
          role: isDriver ? 'driver' : 'passenger',
          other: toPublicUser(other, counts.get(other.id) ?? 0),
          ride: {
            id: b.ride.id,
            departureAt: b.ride.departureAt.toISOString(),
            status: b.ride.status,
            origin: { locationId: b.ride.originLocationId, nameEn: b.ride.originNameEn, nameAr: b.ride.originNameAr, lat: b.ride.originLat, lng: b.ride.originLng },
            destination: {
              locationId: b.ride.destinationLocationId,
              nameEn: b.ride.destinationNameEn,
              nameAr: b.ride.destinationNameAr,
              lat: b.ride.destinationLat,
              lng: b.ride.destinationLng,
            },
          },
          lastMessage: last ? toMessage(last, viewerId) : null,
          unreadCount: unreadBy.get(b.id) ?? 0,
        };
      })
      .sort((a, b) => {
        const ta = a.lastMessage?.createdAt ?? a.ride.departureAt;
        const tb = b.lastMessage?.createdAt ?? b.ride.departureAt;
        return tb.localeCompare(ta);
      });
  }

  /** Total unread messages, for the tab badge. */
  async unreadTotal(viewerId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
      FROM messages m
      JOIN bookings b ON b.id = m.booking_id
      JOIN rides r ON r.id = b.ride_id
      LEFT JOIN chat_reads cr ON cr.booking_id = m.booking_id AND cr.user_id = ${viewerId}::uuid
      WHERE (b.passenger_id = ${viewerId}::uuid OR r.driver_id = ${viewerId}::uuid)
        AND m.sender_id <> ${viewerId}::uuid
        AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)`;
    return Number(rows[0]?.n ?? 0);
  }
}
