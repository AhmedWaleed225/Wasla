import { z } from 'zod';
import { GENDERS, LOCALES, LOCATION_KINDS, SAVED_LOCATION_LABELS, USER_ROLES } from './enums';
import { normalizeEgyptianMobile } from './phone';

/** Minimum age to use Wasla. */
export const MIN_AGE_YEARS = 18;

/** Phone input: any common Egyptian format, output is E.164. */
export const egyptianMobileSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeEgyptianMobile(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AUTH_INVALID_PHONE' });
      return z.NEVER;
    }
    return n;
  });

export const localeSchema = z.enum(LOCALES as [string, ...string[]]);

// ---------- Auth ----------

export const requestOtpSchema = z.object({
  phone: egyptianMobileSchema,
  locale: localeSchema.optional(),
});
export type RequestOtpInput = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: egyptianMobileSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'AUTH_OTP_FORMAT'),
  deviceName: z.string().trim().max(120).optional(),
});
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

// ---------- Profile ----------

function ageOn(dob: Date, today: Date): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'PROFILE_DOB_FORMAT')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'PROFILE_DOB_FORMAT')
  .refine((v) => {
    const age = ageOn(new Date(`${v}T00:00:00Z`), new Date());
    return age >= MIN_AGE_YEARS && age <= 100;
  }, 'PROFILE_UNDERAGE');

export const ridePreferencesSchema = z.object({
  quietRides: z.boolean(),
  musicOk: z.boolean(),
  acPreferred: z.boolean(),
  smokingOk: z.boolean(),
});
export type RidePreferences = z.infer<typeof ridePreferencesSchema>;

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'PROFILE_NAME_LENGTH')
  .max(80, 'PROFILE_NAME_LENGTH')
  .regex(/^[\p{L}\p{M}' .-]+$/u, 'PROFILE_NAME_CHARS');

/** First-time profile setup — all identity fields required. */
export const createProfileSchema = z.object({
  fullName: fullNameSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: z.enum(GENDERS as [string, ...string[]]),
  preferences: ridePreferencesSchema.partial().optional(),
  wantsToDrive: z.boolean().optional(),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/**
 * Later edits. Date of birth and gender are identity fields: once ID
 * verification exists they can only be changed through support.
 */
export const updateProfileSchema = z
  .object({
    fullName: fullNameSchema,
    bio: z.string().trim().max(280),
    preferences: ridePreferencesSchema.partial(),
    showGender: z.boolean(),
    showFullLastName: z.boolean(),
    locale: localeSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'VALIDATION_EMPTY_UPDATE');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const setActiveRoleSchema = z.object({
  role: z.enum(USER_ROLES as [string, ...string[]]),
});
export type SetActiveRoleInput = z.infer<typeof setActiveRoleSchema>;

// ---------- Locations ----------

export const locationSearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  kinds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(LOCATION_KINDS as [string, ...string[]])).optional()),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});
export type LocationSearchInput = z.input<typeof locationSearchSchema>;

const latitude = z.number().min(21.5).max(31.8); // Egypt bounding box (approx.)
const longitude = z.number().min(24.6).max(37.0);

export const savedLocationSchema = z
  .object({
    label: z.enum(SAVED_LOCATION_LABELS as [string, ...string[]]),
    customName: z.string().trim().min(1).max(40).optional(),
    locationId: z.string().uuid().optional(),
    lat: latitude.optional(),
    lng: longitude.optional(),
    pickupNote: z.string().trim().max(140).optional(),
  })
  .refine((v) => v.locationId || (v.lat !== undefined && v.lng !== undefined), 'LOCATION_REQUIRED')
  .refine((v) => v.label !== 'OTHER' || !!v.customName, 'LOCATION_NAME_REQUIRED');
export type SavedLocationInput = z.infer<typeof savedLocationSchema>;
