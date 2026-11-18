import { Injectable } from '@nestjs/common';
import type { AuthTokensDto, Locale, RequestOtpResultDto, VerifyOtpResultDto } from '@wasla/shared';
import { forbidden } from '../common/app-exception';
import type { RequestMeta } from '../common/request-meta';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { AuthContext } from './auth.guard';
import { OtpService } from './otp/otp.service';
import { TokensService } from './tokens.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  requestOtp(phoneE164: string, locale: Locale, meta: RequestMeta): Promise<RequestOtpResultDto> {
    return this.otp.request(phoneE164, locale, meta.ip);
  }

  async verifyOtp(
    phoneE164: string,
    code: string,
    locale: Locale,
    meta: RequestMeta,
    deviceName?: string,
  ): Promise<VerifyOtpResultDto> {
    await this.otp.verify(phoneE164, code);

    const existing = await this.prisma.user.findUnique({ where: { phoneE164 } });
    if (existing?.status === 'SUSPENDED') throw forbidden('AUTH_ACCOUNT_SUSPENDED');

    const user =
      existing ??
      (await this.prisma.user.create({
        data: { phoneE164, locale, phoneVerifiedAt: new Date() },
      }));
    const isNewUser = !existing;

    await this.audit.record({
      actorType: 'USER',
      actorId: user.id,
      action: isNewUser ? 'auth.signup' : 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip: meta.ip,
    });

    const tokens = await this.tokens.issue(user.id, meta, deviceName);
    return { ...tokens, user: await this.users.getMe(user.id), isNewUser };
  }

  refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
    return this.tokens.rotate(refreshToken, meta);
  }

  async logout(user: AuthContext, meta: RequestMeta) {
    await this.tokens.revokeSession(user.sessionId);
    await this.audit.record({ actorType: 'USER', actorId: user.userId, action: 'auth.logout', ip: meta.ip });
  }
}
