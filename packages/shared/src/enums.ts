/**
 * Enum values shared by the API (mirrored in the Prisma schema) and the apps.
 * Keep these in sync with apps/api/prisma/schema.prisma.
 */

export const UserRole = { PASSENGER: 'PASSENGER', DRIVER: 'DRIVER' } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

export const UserStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', DELETED: 'DELETED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Gender = { FEMALE: 'FEMALE', MALE: 'MALE' } as const;
export type Gender = (typeof Gender)[keyof typeof Gender];
export const GENDERS = Object.values(Gender);

export const Locale = { AR: 'ar', EN: 'en' } as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const LOCALES = Object.values(Locale);

export const LocationKind = {
  GOVERNORATE: 'GOVERNORATE',
  CITY: 'CITY',
  DISTRICT: 'DISTRICT',
  NEIGHBORHOOD: 'NEIGHBORHOOD',
  COMPOUND: 'COMPOUND',
  GATE: 'GATE',
  LANDMARK: 'LANDMARK',
  UNIVERSITY: 'UNIVERSITY',
  MALL: 'MALL',
  BUSINESS_DISTRICT: 'BUSINESS_DISTRICT',
  TRANSIT: 'TRANSIT',
} as const;
export type LocationKind = (typeof LocationKind)[keyof typeof LocationKind];
export const LOCATION_KINDS = Object.values(LocationKind);

export const SavedLocationLabel = { HOME: 'HOME', WORK: 'WORK', OTHER: 'OTHER' } as const;
export type SavedLocationLabel = (typeof SavedLocationLabel)[keyof typeof SavedLocationLabel];
export const SAVED_LOCATION_LABELS = Object.values(SavedLocationLabel);
