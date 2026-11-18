import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  messagePageSchema,
  sendMessageSchema,
  type ConversationDto,
  type MessageDto,
  type MessagePageDto,
} from '@wasla/shared';
import type { z } from 'zod';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { notFound } from '../common/app-exception';
import { ZodPipe } from '../common/zod-validation.pipe';
import { ChatService } from './chat.service';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => notFound() });

@ApiTags('chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('me/conversations')
  conversations(@CurrentUser() user: AuthContext): Promise<ConversationDto[]> {
    return this.chat.conversations(user.userId);
  }

  @Get('me/conversations/unread-count')
  async unread(@CurrentUser() user: AuthContext): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.chat.unreadTotal(user.userId) };
  }

  /** Latest page by default; `before` loads older, `after` fetches only new messages (polling). */
  @Get('bookings/:id/messages')
  messages(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Query(new ZodPipe(messagePageSchema)) q: z.output<typeof messagePageSchema>,
  ): Promise<MessagePageDto> {
    return this.chat.messages(user.userId, id, q);
  }

  @Post('bookings/:id/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: z.output<typeof sendMessageSchema>,
  ): Promise<MessageDto> {
    return this.chat.send(user.userId, id, body.body);
  }

  @Post('bookings/:id/messages/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<void> {
    return this.chat.markRead(user.userId, id);
  }
}

@Module({ controllers: [ChatController], providers: [ChatService] })
export class ChatModule {}
