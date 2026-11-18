import { Body, Controller, Delete, Get, HttpCode, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  markNotificationsReadSchema,
  notificationPageSchema,
  pushDeviceSchema,
  type MarkNotificationsReadInput,
  type NotificationPageDto,
  type PushDeviceInput,
} from '@wasla/shared';
import type { z } from 'zod';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { ZodPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(notificationPageSchema)) q: z.output<typeof notificationPageSchema>,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(user.userId, q.before);
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() user: AuthContext): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.notifications.unreadCount(user.userId) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(markNotificationsReadSchema)) body: MarkNotificationsReadInput,
  ): Promise<{ unreadCount: number }> {
    return this.notifications.markRead(user.userId, body);
  }

  /** Registers this phone for push notifications (Expo push token). */
  @Post('push-devices')
  @HttpCode(204)
  register(@CurrentUser() user: AuthContext, @Body(new ZodPipe(pushDeviceSchema)) body: PushDeviceInput): Promise<void> {
    return this.notifications.registerDevice(user.userId, body.token, body.platform);
  }

  /** Call on logout so a shared phone stops receiving this account's notifications. */
  @Delete('push-devices')
  @HttpCode(204)
  unregister(@CurrentUser() user: AuthContext, @Body(new ZodPipe(pushDeviceSchema.pick({ token: true }))) body: { token: string }): Promise<void> {
    return this.notifications.removeDevice(user.userId, body.token);
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
