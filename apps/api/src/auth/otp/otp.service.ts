import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Locale, RequestOtpResultDto } from '@wasla/shared';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppException, tooMany, unauthorized } from '../../common/app-exception';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { OTP_SENDER, type OtpSender } from './otp-provider';

export const OTP_RULES = {
  ttlSeconds: 5 * 60,
  resendCooldownSeconds: 45,
  maxAttempts: 5,
  maxRequestsPerHour: 5,
} as const;

@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  private hash(phoneE164: string, code: string): string {
    return createHmac('sha256', this.env.OTP_HASH_SECRET).update(`${phoneE164}:${code}`).digest('hex');
  }

  private generateCode(): string {
    if (this.env.OTP_MOCK_FIXED_CODE && this.env.NODE_ENV !== 'production') return this.env.OTP_MOCK_FIXED_CODE;
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async request(phoneE164: string, locale: Locale, ip: string | null): Promise<RequestOtpResultDto> {
    const now = Date.now();
    const lastHour = await this.prisma.otpChallenge.findMany({
      where: { phoneE164, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const latest = lastHour[0];
    if (latest) {
      const waited = (now - latest.createdAt.getTime()) / 1000;
      if (waited < OTP_RULES.resendCooldownSeconds) {
        throw tooMany('AUTH_OTP_COOLDOWN', { resendAfter: Math.ceil(OTP_RULES.resendCooldownSeconds - waited) });
      }
    }
    if (lastHour.length >= OTP_RULES.maxRequestsPerHour) throw tooMany('AUTH_OTP_RATE_LIMITED');

    const code = this.generateCode();
    // Only the newest code is valid: expire any earlier unused ones.
    await this.prisma.otpChallenge.updateMany({
      where: { phoneE164, consumedAt: null, expiresAt: { gt: new Date(now) } },
      data: { expiresAt: new Date(now) },
    });
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        phoneE164,
        codeHash: this.hash(phoneE164, code),
        expiresAt: new Date(now + OTP_RULES.ttlSeconds * 1000),
        ip,
      },
    });

    try {
      await this.sender.send(phoneE164, code, locale);
    } catch (err) {
      this.logger.error({ err, provider: this.sender.name }, 'OTP delivery failed');
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } });
      throw new AppException('AUTH_OTP_SEND_FAILED', HttpStatus.BAD_GATEWAY);
    }

    return { resendAfter: OTP_RULES.resendCooldownSeconds, expiresIn: OTP_RULES.ttlSeconds };
  }

  /** Throws unless `code` matches the newest live challenge. Consumes it on success. */
  async verify(phoneE164: string, code: string): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phoneE164, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt.getTime() <= Date.now()) throw unauthorized('AUTH_OTP_EXPIRED');

    // Count the attempt atomically *before* comparing, so parallel guesses
    // cannot exceed the limit.
    const counted = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_RULES.maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw tooMany('AUTH_OTP_TOO_MANY_ATTEMPTS');

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phoneE164, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw unauthorized('AUTH_OTP_INVALID');
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw unauthorized('AUTH_OTP_INVALID'); // already used by a parallel request
  }
}
