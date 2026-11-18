import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  blockUserSchema,
  createRatingSchema,
  createReportSchema,
  type BlockedUserDto,
  type BlockUserInput,
  type CreateRatingData,
  type CreateReportData,
  type RatingDto,
  type RatingStatusDto,
  type ReportDto,
} from '@wasla/shared';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { notFound } from '../common/app-exception';
import { ZodPipe } from '../common/zod-validation.pipe';
import { RidesModule } from '../rides/rides.module';
import { TrustService } from './trust.service';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => notFound() });

@ApiTags('trust')
@ApiBearerAuth()
@Controller()
export class TrustController {
  constructor(private readonly trust: TrustService) {}

  /** Who you'd be rating for this booking, whether you still can, and your rating if given. */
  @Get('bookings/:id/rating')
  ratingStatus(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<RatingStatusDto> {
    return this.trust.ratingStatus(user.userId, id);
  }

  @Post('bookings/:id/rating')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  rate(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(createRatingSchema)) body: CreateRatingData,
  ): Promise<RatingDto> {
    return this.trust.rate(user.userId, id, body);
  }

  @Post('reports')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(@CurrentUser() user: AuthContext, @Body(new ZodPipe(createReportSchema)) body: CreateReportData): Promise<ReportDto> {
    return this.trust.report(user.userId, body);
  }

  @Get('me/reports')
  myReports(@CurrentUser() user: AuthContext): Promise<ReportDto[]> {
    return this.trust.myReports(user.userId);
  }

  @Get('me/blocks')
  blocked(@CurrentUser() user: AuthContext): Promise<BlockedUserDto[]> {
    return this.trust.blocked(user.userId);
  }

  @Post('me/blocks')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  block(@CurrentUser() user: AuthContext, @Body(new ZodPipe(blockUserSchema)) body: BlockUserInput): Promise<void> {
    return this.trust.block(user.userId, body.userId);
  }

  @Delete('me/blocks/:userId')
  @HttpCode(204)
  unblock(@CurrentUser() user: AuthContext, @Param('userId', uuid) userId: string): Promise<void> {
    return this.trust.unblock(user.userId, userId);
  }
}

@Module({ imports: [RidesModule], controllers: [TrustController], providers: [TrustService], exports: [TrustService] })
export class TrustModule {}
