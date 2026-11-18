import { Injectable } from '@nestjs/common';
import type { AdminRole, AdminUser } from '@prisma/client';
import type { AdminCreateStaffInput, AdminStaffDto, AdminStaffWithPasswordDto, AdminUpdateStaffInput } from '@wasla/shared';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { conflict, forbidden, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { isAnyUniqueViolation } from '../rides/ride-mapper';
import { hashPassword } from './password';

const toStaff = (a: AdminUser): AdminStaffDto => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  disabled: a.disabledAt !== null,
  locked: a.lockedUntil !== null && a.lockedUntil > new Date(),
  mustChangePassword: a.mustChangePassword,
  lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
});

/** 24 random characters; shown once to the admin who created or reset the account. */
const temporaryPassword = () => randomBytes(18).toString('base64url');

/**
 * Staff accounts, managed by super admins. New and reset accounts get a
 * one-time temporary password that must be changed at first sign-in.
 * Nobody can change their own role or disable themselves, so a super admin
 * can't lock themselves (or the last super admin) out by accident.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private log(actor: AdminUser, action: string, targetId: string, metadata?: Record<string, string | boolean>) {
    return this.audit.record({ actorType: 'ADMIN', actorId: actor.id, action, entityType: 'admin', entityId: targetId, metadata });
  }

  private async find(id: string): Promise<AdminUser> {
    const a = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!a) throw notFound('STAFF_NOT_FOUND');
    return a;
  }

  async list(): Promise<AdminStaffDto[]> {
    const rows = await this.prisma.adminUser.findMany({ orderBy: [{ disabledAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }] });
    return rows.map(toStaff);
  }

  async create(actor: AdminUser, input: AdminCreateStaffInput): Promise<AdminStaffWithPasswordDto> {
    const password = temporaryPassword();
    try {
      const created = await this.prisma.adminUser.create({
        data: { email: input.email, name: input.name, role: input.role as AdminRole, passwordHash: hashPassword(password), mustChangePassword: true },
      });
      await this.log(actor, 'admin.staff_created', created.id, { role: created.role, email: created.email });
      return { ...toStaff(created), temporaryPassword: password };
    } catch (err) {
      if (isAnyUniqueViolation(err)) throw conflict('ADMIN_EMAIL_TAKEN');
      throw err;
    }
  }

  /** Change role and/or disable or re-enable. Disabling signs the person out everywhere. */
  async update(actor: AdminUser, id: string, input: AdminUpdateStaffInput): Promise<AdminStaffDto> {
    if (id === actor.id) throw forbidden('ADMIN_SELF_CHANGE');
    const before = await this.find(id);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({
        where: { id },
        data: {
          ...(input.role && { role: input.role as AdminRole }),
          ...(input.disabled !== undefined && { disabledAt: input.disabled ? (before.disabledAt ?? now) : null }),
        },
      });
      if (input.disabled) await tx.adminSession.updateMany({ where: { adminId: id, revokedAt: null }, data: { revokedAt: now } });
      return row;
    });
    if (input.role && input.role !== before.role) await this.log(actor, 'admin.staff_role_changed', id, { from: before.role, to: input.role });
    if (input.disabled !== undefined && input.disabled !== (before.disabledAt !== null)) {
      await this.log(actor, input.disabled ? 'admin.staff_disabled' : 'admin.staff_enabled', id);
    }
    return toStaff(updated);
  }

  /** New temporary password; unlocks the account and signs it out everywhere. */
  async resetPassword(actor: AdminUser, id: string): Promise<AdminStaffWithPasswordDto> {
    if (id === actor.id) throw forbidden('ADMIN_SELF_CHANGE');
    await this.find(id);
    const password = temporaryPassword();
    const [updated] = await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id },
        data: { passwordHash: hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
      }),
      this.prisma.adminSession.updateMany({ where: { adminId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.log(actor, 'admin.staff_password_reset', id);
    return { ...toStaff(updated), temporaryPassword: password };
  }
}
