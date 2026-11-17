import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokensDto } from '@wasla/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { forbidden, unauthorized } from '../common/app-exception';
import type { RequestMeta } from '../common/request-meta';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private newRefreshToken() {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: sha256(token) };
  }

  private async signAccess(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId } satisfies AccessTokenPayload, {
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private refreshExpiry() {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  /** Starts a new session family after a successful login. */
  async issue(userId: string, meta: RequestMeta, deviceName?: string): Promise<AuthTokensDto> {
    const { token, hash } = this.newRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId: randomUUID(),
        refreshTokenHash: hash,
        deviceName: deviceName ?? null,
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: this.refreshExpiry(),
      },
    });
    return {
      accessToken: await this.signAccess(userId, session.id),
      accessTokenExpiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: token,
    };
  }

  /**
   * Exchanges a refresh token for a new pair. A refresh token works once: if an
   * already-rotated token is presented again, the whole session family is
   * revoked because the token has probably been stolen.
   */
  async rotate(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    if (!session) throw unauthorized('AUTH_SESSION_REVOKED');

    if (session.revokedAt || session.rotatedAt) {
      await this.revokeFamily(session.familyId);
      await this.audit.record({
        actorType: 'SYSTEM',
        action: 'auth.refresh_token_reuse',
        entityType: 'session_family',
        entityId: session.familyId,
        metadata: { userId: session.userId },
        ip: meta.ip,
      });
      throw unauthorized('AUTH_SESSION_REVOKED');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(session.familyId);
      throw unauthorized('AUTH_SESSION_REVOKED');
    }
    if (session.user.status === 'SUSPENDED') throw forbidden('AUTH_ACCOUNT_SUSPENDED');
    if (session.user.status === 'DELETED') throw unauthorized('AUTH_SESSION_REVOKED');

    const { token, hash } = this.newRefreshToken();
    const next = await this.prisma.$transaction(async (tx) => {
      const marked = await tx.session.updateMany({
        where: { id: session.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (marked.count === 0) return null; // lost a race with a parallel refresh
      return tx.session.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: hash,
          deviceName: session.deviceName,
          userAgent: meta.userAgent,
          ip: meta.ip,
          expiresAt: this.refreshExpiry(),
        },
      });
    });
    if (!next) {
      await this.revokeFamily(session.familyId);
      throw unauthorized('AUTH_SESSION_REVOKED');
    }

    return {
      accessToken: await this.signAccess(session.userId, next.id),
      accessTokenExpiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: token,
    };
  }

  async revokeFamily(familyId: string) {
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeSession(sessionId: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    if (s) await this.revokeFamily(s.familyId);
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
