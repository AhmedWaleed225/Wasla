import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  refreshSchema,
  requestOtpSchema,
  verifyOtpSchema,
  type AuthTokensDto,
  type RefreshInput,
  type RequestOtpResultDto,
  type VerifyOtpResultDto,
} from '@wasla/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { localeFromHeader } from '../common/locale';
import { ReqMeta, type RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod-validation.pipe';
import { AuthContext, CurrentUser, Public } from './auth.guard';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Sends a 6-digit code to an Egyptian mobile number. Same call for sign-up and log-in. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(
    @Body(new ZodPipe(requestOtpSchema)) body: z.output<typeof requestOtpSchema>,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RequestOtpResultDto> {
    const locale = (body.locale as 'ar' | 'en' | undefined) ?? localeFromHeader(req.headers['accept-language']);
    return this.auth.requestOtp(body.phone, locale, meta);
  }

  /** Checks the code; creates the account on first login. Returns tokens. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(
    @Body(new ZodPipe(verifyOtpSchema)) body: z.output<typeof verifyOtpSchema>,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
  ): Promise<VerifyOtpResultDto> {
    return this.auth.verifyOtp(body.phone, body.code, localeFromHeader(req.headers['accept-language']), meta, body.deviceName);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: RefreshInput, @ReqMeta() meta: RequestMeta): Promise<AuthTokensDto> {
    return this.auth.refresh(body.refreshToken, meta);
  }

  /** Ends this device's session (all tokens in its rotation family). */
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthContext, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.logout(user, meta);
  }
}
