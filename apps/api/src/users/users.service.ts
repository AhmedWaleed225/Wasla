import { Injectable } from '@nestjs/common';
import type { User, UserProfile, UserRole } from '@prisma/client';
import type { CreateProfileInput, MeDto, ProfileDto, UpdateProfileInput } from '@wasla/shared';
import { badRequest, conflict, forbidden, notFound } from '../common/app-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** "Nour El-Sayed" -> "Nour E." (privacy default). */
export function displayNameOf(fullName: string, showFullLastName: boolean): string {
  const parts = fullName.trim().split(/\s+/);
  if (showFullLastName || parts.length < 2) return fullName.trim();
  const last = parts[parts.length - 1]!;
  // Arabic family names usually start with the article "ال": "السيد" -> "س."
  const initial = last.startsWith('ال') && last.length > 2 ? last.charAt(2) : last.charAt(0).toUpperCase();
  return `${parts[0]} ${initial}.`;
}

function toProfileDto(p: UserProfile): ProfileDto {
  return {
    fullName: p.fullName,
    displayName: displayNameOf(p.fullName, p.showFullLastName),
    dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
    gender: p.gender,
    bio: p.bio,
    photoUrl: null, // object storage arrives in Phase 4
    preferences: { quietRides: p.prefQuiet, musicOk: p.prefMusicOk, acPreferred: p.prefAc, smokingOk: p.prefSmokingOk },
    showGender: p.showGender,
    showFullLastName: p.showFullLastName,
  };
}

function prefsToColumns(prefs: Partial<{ quietRides: boolean; musicOk: boolean; acPreferred: boolean; smokingOk: boolean }> | undefined) {
  if (!prefs) return {};
  return {
    ...(prefs.quietRides !== undefined && { prefQuiet: prefs.quietRides }),
    ...(prefs.musicOk !== undefined && { prefMusicOk: prefs.musicOk }),
    ...(prefs.acPreferred !== undefined && { prefAc: prefs.acPreferred }),
    ...(prefs.smokingOk !== undefined && { prefSmokingOk: prefs.smokingOk }),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toMe(user: User & { profile: UserProfile | null }): MeDto {
    return {
      id: user.id,
      phone: user.phoneE164,
      locale: user.locale,
      roles: user.roles,
      activeRole: user.activeRole,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      profile: user.profile ? toProfileDto(user.profile) : null,
      // Rides and ratings tables arrive in Phase 3; until then these are genuinely zero.
      stats: { ridesCompleted: 0, ratingAverage: null, ratingCount: 0 },
    };
  }

  async getMe(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw notFound();
    return this.toMe(user);
  }

  async createProfile(userId: string, input: CreateProfileInput): Promise<MeDto> {
    const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (existing) throw conflict('PROFILE_ALREADY_EXISTS');

    await this.prisma.$transaction(async (tx) => {
      await tx.userProfile.create({
        data: {
          userId,
          fullName: input.fullName,
          dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00Z`),
          gender: input.gender as 'FEMALE' | 'MALE',
          ...prefsToColumns(input.preferences),
        },
      });
      if (input.wantsToDrive) {
        const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } });
        if (!u.roles.includes('DRIVER')) {
          await tx.user.update({ where: { id: userId }, data: { roles: { push: 'DRIVER' } } });
        }
      }
      await this.audit.record(
        { actorType: 'USER', actorId: userId, action: 'profile.create', entityType: 'user', entityId: userId },
        tx,
      );
    });
    return this.getMe(userId);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<MeDto> {
    const { locale, preferences, ...rest } = input;
    const hasProfileFields = Object.keys(rest).length > 0 || preferences !== undefined;

    if (hasProfileFields) {
      const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
      if (!existing) throw badRequest('PROFILE_REQUIRED');
      await this.prisma.userProfile.update({
        where: { userId },
        data: { ...rest, ...prefsToColumns(preferences) },
      });
    }
    if (locale) await this.prisma.user.update({ where: { id: userId }, data: { locale: locale as 'ar' | 'en' } });
    return this.getMe(userId);
  }

  /**
   * Opts the user in to driving. This only unlocks driver mode; publishing rides
   * will additionally require approved ID, licence and vehicle verification (Phase 3/5).
   */
  async enableDriving(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    if (!user.profile) throw badRequest('PROFILE_REQUIRED');
    if (!user.roles.includes('DRIVER')) {
      await this.prisma.user.update({ where: { id: userId }, data: { roles: { push: 'DRIVER' } } });
      await this.audit.record({ actorType: 'USER', actorId: userId, action: 'role.driver_enabled', entityType: 'user', entityId: userId });
    }
    return this.getMe(userId);
  }

  /** Switches the experience. The backend checks the role was actually granted. */
  async setActiveRole(userId: string, role: UserRole): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } });
    if (!user.roles.includes(role)) throw forbidden('ROLE_NOT_GRANTED');
    await this.prisma.user.update({ where: { id: userId }, data: { activeRole: role } });
    return this.getMe(userId);
  }
}
