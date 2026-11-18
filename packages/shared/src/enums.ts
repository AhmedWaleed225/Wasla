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

export const RideStatus = { SCHEDULED: 'SCHEDULED', CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED' } as const;
export type RideStatus = (typeof RideStatus)[keyof typeof RideStatus];

/** INSTANT: a booking is confirmed at once. REQUEST: the driver accepts or declines each one. */
export const BookingMode = { INSTANT: 'INSTANT', REQUEST: 'REQUEST' } as const;
export type BookingMode = (typeof BookingMode)[keyof typeof BookingMode];
export const BOOKING_MODES = Object.values(BookingMode);

export const BookingStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DECLINED: 'DECLINED',
  CANCELLED_BY_PASSENGER: 'CANCELLED_BY_PASSENGER',
  CANCELLED_BY_DRIVER: 'CANCELLED_BY_DRIVER',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];
/** Bookings that hold seats. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

/** Only cash in Phase 3. Online payment arrives with a real payment provider in Phase 4. */
export const PaymentMethod = { CASH: 'CASH' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const ListScope = { UPCOMING: 'upcoming', PAST: 'past' } as const;
export type ListScope = (typeof ListScope)[keyof typeof ListScope];
