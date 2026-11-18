import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminUser } from '@prisma/client';
import { adminCan, type AdminPermission } from '@wasla/shared';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../common/app-exception';
import { AdminAuthService } from './admin-auth.service';
import { ADMIN_COOKIE, readCookie } from './cookies';

export interface AdminContext {
  admin: AdminUser;
  sessionId: string;
}
type AdminRequest = Request & { admin?: AdminContext };

const PERMISSION = 'adminPermission';
/** The permission (from ADMIN_PERMISSIONS in the shared package) a route needs. */
export const AdminPerm = (p: AdminPermission) => SetMetadata(PERMISSION, p);

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminContext => {
  const req = ctx.switchToHttp().getRequest<AdminRequest>();
  if (!req.admin) throw unauthorized('ADMIN_UNAUTHENTICATED');
  return req.admin;
});

/** Header the console sends on every change. Other sites can't add it without a CORS preflight, which fails for them. */
export const ADMIN_CSRF_HEADER = 'x-wasla-admin';

/** Rejects changes without the CSRF header. Used on its own for sign-in, and inside AdminGuard. */
export function checkCsrf(req: Request): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers[ADMIN_CSRF_HEADER] !== '1') throw forbidden('ADMIN_CSRF');
}

/**
 * Admin routes: CSRF header on anything that changes data, a valid session
 * cookie, and the route's permission for this admin's role. Checked on every
 * request, so disabling an admin or revoking a session takes effect at once.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    checkCsrf(req);
    const found = await this.auth.fromToken(readCookie(req.headers.cookie, ADMIN_COOKIE));
    if (!found) throw unauthorized('ADMIN_UNAUTHENTICATED');
    const needed = this.reflector.getAllAndOverride<AdminPermission | undefined>(PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (needed && !adminCan(found.admin.role, needed)) throw forbidden('ADMIN_FORBIDDEN');
    req.admin = found;
    return true;
  }
}
