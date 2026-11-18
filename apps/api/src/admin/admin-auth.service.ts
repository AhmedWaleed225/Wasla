import { HttpStatus, Injectable } from '@nestjs/common';
import type { AdminUser } from '@prisma/client';
import type { AdminMeDto } from '@wasla/shared';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppException, unauthorized } from '../common/app-exception';
import type { RequestMeta } from '../common/request-meta';
import { PrismaService } from '../prisma/prisma.service';
import { DUMMY_HASH, verifyPassword } from './password';

export const ADMIN_SESSION_HOURS = 8;
export const ADMIN_MAX_FAILED_LOGINS = 5;
export const ADMIN_LOCK_MINUTES = 15;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const toAdminMe = (a: AdminUser): AdminMeDto => ({ id: a.id, email: a.email, name: a.name, role: a.role });

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Email + password. Same error for unknown email and wrong password, and the
   * password check runs either way so timing doesn't reveal which. Five failures
   * in a row lock the account for 15 minutes.
   */
  async login(email: string, password: string, meta: RequestMeta): Promise<{ token: string; admin: AdminMeDto }> {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const ok = verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);

    if (!admin || admin.disabledAt) {
      await this.audit.record({ actorType: 'SYSTEM', action: 'admin.login_failed', metadata: { email }, ip: meta.ip });
      throw unauthorized('ADMIN_LOGIN_FAILED');
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new AppException('ADMIN_LOCKED', HttpStatus.TOO_MANY_REQUESTS);
    if (!ok) {
      const failed = admin.failedLogins + 1;
      const lock = failed >= ADMIN_MAX_FAILED_LOGINS;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + ADMIN_LOCK_MINUTES * 60_000) } : { failedLogins: failed },
      });
      await this.audit.record({ actorType: 'ADMIN', actorId: admin.id, action: lock ? 'admin.locked' : 'admin.login_failed', ip: meta.ip });
      if (lock) throw new AppException('ADMIN_LOCKED', HttpStatus.TOO_MANY_REQUESTS);
      throw unauthorized('ADMIN_LOGIN_FAILED');
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.adminSession.create({
        data: {
          adminId: admin.id,
          tokenHash: sha256(token),
          ip: meta.ip,
          userAgent: meta.userAgent,
          expiresAt: new Date(Date.now() + ADMIN_SESSION_HOURS * 3_600_000),
        },
      }),
      this.prisma.adminUser.update({ where: { id: admin.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    ]);
    await this.audit.record({ actorType: 'ADMIN', actorId: admin.id, action: 'admin.login', ip: meta.ip });
    return { token, admin: toAdminMe(admin) };
  }

  /** The signed-in admin for a cookie token, or null if missing, expired, revoked or disabled. */
  async fromToken(token: string | undefined): Promise<{ admin: AdminUser; sessionId: string } | null> {
    if (!token) return null;
    const session = await this.prisma.adminSession.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.admin.disabledAt) return null;
    return { admin: session.admin, sessionId: session.id };
  }

  async logout(sessionId: string, adminId: string, meta: RequestMeta): Promise<void> {
    await this.prisma.adminSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorType: 'ADMIN', actorId: adminId, action: 'admin.logout', ip: meta.ip });
  }
}
