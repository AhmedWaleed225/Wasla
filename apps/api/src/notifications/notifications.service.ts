import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { Notification, NotificationType, Prisma, Ride } from '@prisma/client';
import type { Locale, NotificationDto, NotificationPageDto } from '@wasla/shared';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ExpoPushSender, NoopPushSender, PUSH_SENDER, type PushMessage, type PushSender } from './push-sender';
import { renderNewMessageTitle, renderNotification } from './render';

type Tx = Prisma.TransactionClient;

export interface NewNotification {
  userId: string;
  type: NotificationType;
  rideId?: string;
  bookingId?: string;
  data: NotificationDto['data'];
}

/** Template values describing a ride, with the other person's display name. */
export function rideData(
  ride: Pick<Ride, 'originNameEn' | 'originNameAr' | 'destinationNameEn' | 'destinationNameAr' | 'departureAt'>,
  name?: string,
): NotificationDto['data'] {
  return {
    ...(name && { name }),
    fromEn: ride.originNameEn,
    fromAr: ride.originNameAr,
    toEn: ride.destinationNameEn,
    toAr: ride.destinationNameAr,
    departureAt: ride.departureAt.toISOString(),
  };
}

const PAGE = 30;

const toDto = (n: Notification): NotificationDto => ({
  id: n.id,
  type: n.type,
  rideId: n.rideId,
  bookingId: n.bookingId,
  data: n.data as NotificationDto['data'],
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  /**
   * Records notifications inside the caller's transaction, so they exist exactly
   * when the event does. Call `dispatch` with the result after the transaction commits.
   */
  async create(tx: Tx, entries: NewNotification[]): Promise<Notification[]> {
    if (entries.length === 0) return [];
    return tx.notification.createManyAndReturn({
      data: entries.map((e) => ({
        userId: e.userId,
        type: e.type,
        rideId: e.rideId ?? null,
        bookingId: e.bookingId ?? null,
        data: e.data as Prisma.InputJsonValue,
      })),
    });
  }

  /** Sends push for already-committed notifications. Never throws: the inbox is the source of truth. */
  dispatch(rows: Notification[]): void {
    if (rows.length === 0) return;
    void this.deliver(
      rows.map((n) => ({
        userId: n.userId,
        render: (locale: Locale) => ({ body: renderNotification(n.type, n.data as NotificationDto['data'], locale) }),
        data: { type: n.type, ...(n.rideId && { rideId: n.rideId }), ...(n.bookingId && { bookingId: n.bookingId }) },
      })),
    );
  }

  /** Push for a chat message. Shows a short preview; the full text stays in the app. */
  pushMessage(recipientId: string, senderName: string, body: string, bookingId: string): void {
    const preview = body.length > 80 ? `${body.slice(0, 77)}…` : body;
    void this.deliver([
      {
        userId: recipientId,
        render: (locale: Locale) => ({ title: renderNewMessageTitle(senderName, locale), body: preview }),
        data: { type: 'MESSAGE', bookingId },
      },
    ]);
  }

  private async deliver(
    items: { userId: string; render: (l: Locale) => { title?: string; body: string }; data: Record<string, string> }[],
  ): Promise<void> {
    try {
      const userIds = [...new Set(items.map((i) => i.userId))];
      const [devices, users] = await Promise.all([
        this.prisma.pushDevice.findMany({ where: { userId: { in: userIds }, disabledAt: null } }),
        this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, locale: true } }),
      ]);
      if (devices.length === 0) return;
      const localeOf = new Map(users.map((u) => [u.id, u.locale as Locale]));
      const messages: PushMessage[] = [];
      for (const item of items) {
        const text = item.render(localeOf.get(item.userId) ?? 'ar');
        for (const d of devices.filter((x) => x.userId === item.userId)) {
          messages.push({ token: d.token, ...text, data: item.data });
        }
      }
      const { invalidTokens } = await this.push.send(messages);
      if (invalidTokens.length > 0) {
        await this.prisma.pushDevice.updateMany({ where: { token: { in: invalidTokens } }, data: { disabledAt: new Date() } });
      }
    } catch (err) {
      this.logger.error({ err }, 'Push delivery failed');
    }
  }

  // ---------- Inbox ----------

  async list(userId: string, before?: string): Promise<NotificationPageDto> {
    const cursor = before ? await this.prisma.notification.findFirst({ where: { id: before, userId } }) : null;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursor && {
          OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map(toDto),
      unreadCount: await this.unreadCount(userId),
      nextBefore: rows.length > PAGE ? page[page.length - 1]!.id : null,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Only ever touches the caller's own notifications. */
  async markRead(userId: string, input: { ids?: string[]; all?: boolean }): Promise<{ unreadCount: number }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(input.all ? {} : { id: { in: input.ids ?? [] } }) },
      data: { readAt: new Date() },
    });
    return { unreadCount: await this.unreadCount(userId) };
  }

  // ---------- Devices ----------

  /** A token belongs to whoever registered it last (e.g. after switching accounts on one phone). */
  async registerDevice(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, disabledAt: null, lastSeenAt: new Date() },
    });
  }

  async removeDevice(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }
}

@Global()
@Module({
  providers: [
    NotificationsService,
    {
      provide: PUSH_SENDER,
      inject: [ENV],
      useFactory: (env: Env): PushSender =>
        env.PUSH_PROVIDER === 'expo' && env.NODE_ENV !== 'test' ? new ExpoPushSender(env.EXPO_ACCESS_TOKEN) : new NoopPushSender(),
    },
  ],
  exports: [NotificationsService, PUSH_SENDER],
})
export class NotificationsCoreModule {}
