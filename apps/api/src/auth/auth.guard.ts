import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './tokens.service';

export const IS_PUBLIC = 'isPublic';
/** Marks a route as reachable without a logged-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthContext {
  userId: string;
  sessionId: string;
  roles: UserRole[];
  activeRole: UserRole;
}

type AuthedRequest = Request & { auth?: AuthContext };

/** The authenticated caller, as verified by the backend (never taken from the request body). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw unauthorized();
  return req.auth;
});

/**
 * Global guard. Every route requires a valid access token unless marked @Public().
 * Checks the session is still live and the account is active on every request,
 * so revoking a session or suspending a user takes effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      throw unauthorized();
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { userId: true, revokedAt: true, user: { select: { status: true, roles: true, activeRole: true } } },
    });
    if (!session || session.userId !== payload.sub) throw unauthorized('AUTH_SESSION_REVOKED');
    // Suspension is reported before revocation: suspending also revokes sessions, and
    // the app should say "account suspended", not just "log in again".
    if (session.user.status === 'SUSPENDED') throw forbidden('AUTH_ACCOUNT_SUSPENDED');
    if (session.revokedAt || session.user.status === 'DELETED') throw unauthorized('AUTH_SESSION_REVOKED');

    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
      roles: session.user.roles,
      activeRole: session.user.activeRole,
    };
    return true;
  }
}
