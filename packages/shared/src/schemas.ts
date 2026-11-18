import { z } from 'zod';
import { BOOKING_MODES, GENDERS, LOCALES, LOCATION_KINDS, SAVED_LOCATION_LABELS, USER_ROLES } from './enums';
import { normalizeEgyptianMobile, toAsciiDigits } from './phone';
import { PLATE_DIGITS_RE, PLATE_LETTERS_RE, RIDE_RULES, SEARCH_RULES, normalizePlateLetters } from './rides';

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

// ---------- Vehicles ----------

const currentYear = () => new Date().getUTCFullYear();

export const vehicleSchema = z.object({
  make: z.string().trim().min(2, 'VEHICLE_FIELD_LENGTH').max(30, 'VEHICLE_FIELD_LENGTH'),
  model: z.string().trim().min(1, 'VEHICLE_FIELD_LENGTH').max(30, 'VEHICLE_FIELD_LENGTH'),
  color: z.string().trim().min(2, 'VEHICLE_FIELD_LENGTH').max(20, 'VEHICLE_FIELD_LENGTH'),
  year: z.coerce
    .number()
    .int()
    .refine((y) => y >= 1990 && y <= currentYear() + 1, 'VEHICLE_YEAR_RANGE'),
  seats: z.coerce.number().int().min(1, 'VEHICLE_SEATS_RANGE').max(RIDE_RULES.maxSeats, 'VEHICLE_SEATS_RANGE'),
  plateLetters: z
    .string()
    .trim()
    .transform(normalizePlateLetters)
    .refine((v) => PLATE_LETTERS_RE.test(v), 'VEHICLE_PLATE_FORMAT'),
  plateDigits: z
    .string()
    .trim()
    .transform((v) => toAsciiDigits(v).replace(/\s+/g, ''))
    .refine((v) => PLATE_DIGITS_RE.test(v), 'VEHICLE_PLATE_FORMAT'),
});
export type VehicleInput = z.input<typeof vehicleSchema>;
export type VehicleData = z.output<typeof vehicleSchema>;

// ---------- Rides ----------

/** A pickup or drop-off point: a known place, or a pin with a short label. */
export const placePointSchema = z
  .object({
    locationId: z.string().uuid().optional(),
    lat: latitude.optional(),
    lng: longitude.optional(),
    label: z.string().trim().min(1).max(80).optional(),
  })
  .refine((v) => v.locationId || (v.lat !== undefined && v.lng !== undefined && v.label), 'LOCATION_REQUIRED');
export type PlacePointInput = z.infer<typeof placePointSchema>;

const isoDateTime = z.string().datetime({ offset: true, message: 'RIDE_DEPARTURE_FORMAT' });

export const createRideSchema = z.object({
  vehicleId: z.string().uuid(),
  origin: placePointSchema,
  destination: placePointSchema,
  departureAt: isoDateTime,
  seats: z.coerce.number().int().min(1, 'VEHICLE_SEATS_RANGE').max(RIDE_RULES.maxSeats, 'VEHICLE_SEATS_RANGE'),
  pricePerSeatEgp: z.coerce.number().int('RIDE_PRICE_WHOLE').min(1, 'RIDE_PRICE_TOO_LOW'),
  bookingMode: z.enum(BOOKING_MODES as [string, ...string[]]).default('INSTANT'),
  womenOnly: z.boolean().default(false),
  notes: z.string().trim().max(RIDE_RULES.notesMax).optional(),
  preferences: ridePreferencesSchema.partial().optional(),
});
export type CreateRideInput = z.input<typeof createRideSchema>;
export type CreateRideData = z.output<typeof createRideSchema>;

export const updateRideSchema = z
  .object({
    seats: z.coerce.number().int().min(1, 'VEHICLE_SEATS_RANGE').max(RIDE_RULES.maxSeats, 'VEHICLE_SEATS_RANGE'),
    pricePerSeatEgp: z.coerce.number().int('RIDE_PRICE_WHOLE').min(1, 'RIDE_PRICE_TOO_LOW'),
    departureAt: isoDateTime,
    notes: z.string().trim().max(RIDE_RULES.notesMax).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'VALIDATION_EMPTY_UPDATE');
export type UpdateRideInput = z.infer<typeof updateRideSchema>;

export const cancelSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type CancelInput = z.infer<typeof cancelSchema>;

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'SEARCH_DATE_FORMAT')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'SEARCH_DATE_FORMAT');

/**
 * Ride search. Each end is a known place id or a lat/lng pair.
 * `date` is a calendar day in Egypt (Africa/Cairo).
 */
export const rideSearchSchema = z
  .object({
    fromLocationId: z.string().uuid().optional(),
    fromLat: z.coerce.number().min(21.5).max(31.8).optional(),
    fromLng: z.coerce.number().min(24.6).max(37.0).optional(),
    toLocationId: z.string().uuid().optional(),
    toLat: z.coerce.number().min(21.5).max(31.8).optional(),
    toLng: z.coerce.number().min(24.6).max(37.0).optional(),
    date: calendarDate,
    seats: z.coerce.number().int().min(1).max(RIDE_RULES.maxSeatsPerBooking).default(1),
    radiusKm: z.coerce.number().min(1).max(SEARCH_RULES.maxRadiusKm).default(SEARCH_RULES.defaultRadiusKm),
  })
  .refine((v) => v.fromLocationId || (v.fromLat !== undefined && v.fromLng !== undefined), {
    message: 'SEARCH_PLACE_REQUIRED',
    path: ['from'],
  })
  .refine((v) => v.toLocationId || (v.toLat !== undefined && v.toLng !== undefined), {
    message: 'SEARCH_PLACE_REQUIRED',
    path: ['to'],
  });
export type RideSearchInput = z.input<typeof rideSearchSchema>;
export type RideSearchQuery = z.output<typeof rideSearchSchema>;

export const listScopeSchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
});
export type ListScopeInput = z.input<typeof listScopeSchema>;

// ---------- Bookings ----------

export const createBookingSchema = z.object({
  seats: z.coerce
    .number()
    .int()
    .min(1, 'BOOKING_SEATS_LIMIT')
    .max(RIDE_RULES.maxSeatsPerBooking, 'BOOKING_SEATS_LIMIT')
    .default(1),
  pickupNote: z.string().trim().max(140).optional(),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

/** Clients send a fresh random key per booking attempt so a retried request never books twice. */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'IDEMPOTENCY_KEY_FORMAT');

// ---------- Messaging & notifications ----------

export const CHAT_RULES = {
  maxMessageLength: 1000,
  /** Chat stays open this long after departure so people can sort out a forgotten bag. */
  openHoursAfterDeparture: 24,
  pageSize: 50,
} as const;

export const sendMessageSchema = z.object({
  body: z
    .string()
    // Drop control characters except newlines and tabs, then trim.
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .refine((v) => v.length > 0, 'CHAT_MESSAGE_EMPTY')
    .refine((v) => v.length <= CHAT_RULES.maxMessageLength, 'CHAT_MESSAGE_TOO_LONG'),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const messagePageSchema = z.object({
  /** Messages strictly before this message id (older page). */
  before: z.string().uuid().optional(),
  /** Messages strictly after this message id (polling for new ones). */
  after: z.string().uuid().optional(),
});

export const notificationPageSchema = z.object({
  before: z.string().uuid().optional(),
});

export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids && v.ids.length > 0), 'VALIDATION_EMPTY_UPDATE');
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

export const pushDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/, 'PUSH_TOKEN_FORMAT'),
  platform: z.enum(['ios', 'android']),
});
export type PushDeviceInput = z.infer<typeof pushDeviceSchema>;
