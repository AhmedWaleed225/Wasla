# 8. Code reference — shared package (`packages/shared`)

Code that must be identical on the phone and the server. Built with `tsc -p tsconfig.build.json` to
`dist/` (CommonJS + type declarations) and imported as `@wasla/shared`. **After changing anything here,
run `pnpm --filter @wasla/shared build`** so the API and the app see the change.

## `src/index.ts`
Re-exports everything below.

## `src/enums.ts`
Each enum is a `const` object plus a type of its values, and most have an array for Zod:

| Export | Values |
|---|---|
| `UserRole`, `USER_ROLES` | PASSENGER, DRIVER |
| `UserStatus` | ACTIVE, SUSPENDED, DELETED |
| `Gender`, `GENDERS` | FEMALE, MALE |
| `Locale`, `LOCALES` | ar, en |
| `LocationKind`, `LOCATION_KINDS` | 11 kinds (governorate … transit) |
| `SavedLocationLabel`, `SAVED_LOCATION_LABELS` | HOME, WORK, OTHER |
| `RideStatus` | SCHEDULED, CANCELLED, COMPLETED |
| `BookingMode`, `BOOKING_MODES` | INSTANT, REQUEST |
| `BookingStatus`, `ACTIVE_BOOKING_STATUSES` | 7 statuses; PENDING and CONFIRMED hold seats |
| `PaymentMethod` | CASH |
| `ListScope` | upcoming, past |
| `NotificationType` | 8 event types |
| `PushPlatform` | ios, android |

These mirror the Prisma enums; keep both in sync.

## `src/phone.ts` — Egyptian mobile numbers

| Function | Behaviour |
|---|---|
| `toAsciiDigits(input)` | Converts Arabic-Indic (٠–٩) and Persian (۰–۹) digits to 0–9 |
| `normalizeEgyptianMobile(input)` | Accepts `010 1234 5678`, `01012345678`, `1012345678`, `+20 10…`, `0020…`, `20…`, with Arabic digits, spaces, dashes, brackets. Returns `+201XXXXXXXXX` for prefixes 10, 11, 12, 15, otherwise `null` |
| `isValidEgyptianMobile(input)` | `normalizeEgyptianMobile(input) !== null` |
| `carrierOf(e164)` | Original network: 10 → VODAFONE, 11 → ETISALAT_EAND, 12 → ORANGE, 15 → WE (numbers can be ported, so it's only a hint) |
| `formatEgyptianMobile(e164)` | `+20 10 1234 5678` |
| `maskEgyptianMobile(e164)` | `+20 10 •••• 5678` (used on the code screen) |

Type: `EgyptianCarrier`. Tests: `phone.test.ts` (18).

## `src/rides.ts` — ride rules and helpers

| Export | Meaning |
|---|---|
| `RIDE_RULES` | `minLeadMinutes 30`, `maxDaysAhead 30`, `minDistanceKm 1`, `maxSeats 6`, `maxSeatsPerBooking 4`, `driverOverlapMinutes 60`, `pendingRequestTtlHours 12`, `notesMax 280` |
| `SEARCH_RULES` | `defaultRadiusKm 5`, `maxRadiusKm 25`, `maxResults 50` |
| `PRICE_RULES` | `roadFactor 1.3`, `suggestedEgpPerKm 0.75`, `maxEgpPerKm 2`, `minEgp 5`, `minSuggestedEgp 10`, `floorCapEgp 30` |
| `priceLimitsEgp(straightLineKm)` → `{ min, suggested, max }` | See [pricing](05-business-rules-and-security.md#pricing) |
| `distanceKm(a, b)` | Great-circle distance, same formula as SQL `wasla_distance_km` |
| `PIASTERS_PER_EGP` | 100 |
| `formatEgp(piasters, locale)` | "45 EGP" / "٤٥ ج.م" |
| `PLATE_LETTERS_RE`, `PLATE_DIGITS_RE` | Up to 3 Arabic letters; 1–4 digits |
| `normalizePlateLetters(input)` | "أبج" → "أ ب ج" |

Tests: `rides.test.ts` (9).

## `src/schemas.ts` — Zod request schemas

Error messages inside schemas are **error codes** (e.g. `'PROFILE_UNDERAGE'`), which `ZodPipe` turns into
localized messages.

| Schema | Fields and rules |
|---|---|
| `egyptianMobileSchema` | Any format → E.164, else `AUTH_INVALID_PHONE` |
| `localeSchema` | `ar` \| `en` |
| `requestOtpSchema` | `phone`, `locale?` |
| `verifyOtpSchema` | `phone`, `code` (6 digits), `deviceName?` |
| `refreshSchema` | `refreshToken` (32–256 chars) |
| `dateOfBirthSchema` | `YYYY-MM-DD`, real date, age 18–100 (`MIN_AGE_YEARS`) |
| `ridePreferencesSchema` | `quietRides`, `musicOk`, `acPreferred`, `smokingOk` |
| `fullNameSchema` | 2–80 letters, spaces, `'`, `.`, `-` (any script) |
| `createProfileSchema` | name, birth date, gender, preferences?, `wantsToDrive?` |
| `updateProfileSchema` | Any of name, bio (≤280), preferences, `showGender`, `showFullLastName`, locale; not empty |
| `setActiveRoleSchema` | `role` |
| `locationSearchSchema` | `q` (1–80), `kinds` (comma list), `limit` (1–30, default 15) |
| `savedLocationSchema` | `label`, `customName?`, `locationId?` or `lat`+`lng` inside Egypt, `pickupNote?`; OTHER needs a name |
| `vehicleSchema` | make, model, colour, year (1990–next year), seats (1–6), plate letters (normalised), plate digits (Arabic digits accepted) |
| `placePointSchema` | `locationId`, or `lat`+`lng`+`label` |
| `createRideSchema` | vehicle, origin, destination, `departureAt` (ISO with offset), seats, `pricePerSeatEgp` (whole), `bookingMode` (default INSTANT), `womenOnly` (default false), notes, preferences |
| `updateRideSchema` | Any of seats, price, departure, notes; not empty |
| `cancelSchema` | `reason?` (≤200) |
| `rideSearchSchema` | from (id or lat/lng), to (id or lat/lng), `date`, `seats` (1–4, default 1), `radiusKm` (1–25, default 5) |
| `listScopeSchema` | `scope` (default upcoming) |
| `createBookingSchema` | `seats` (1–4, default 1), `pickupNote?` (≤140) |
| `idempotencyKeySchema` | `[A-Za-z0-9_-]{8,64}` |
| `CHAT_RULES` | `maxMessageLength 1000`, `openHoursAfterDeparture 24`, `pageSize 50` |
| `sendMessageSchema` | `body`: control characters stripped, trimmed, 1–1000 |
| `messagePageSchema` | `before?`, `after?` (message ids) |
| `notificationPageSchema` | `before?` |
| `markNotificationsReadSchema` | `ids` (≤100) or `all: true` |
| `pushDeviceSchema` | `token` (`ExponentPushToken[…]`), `platform` |

Each schema has matching `…Input` (what the client sends) and, where transforms apply, `…Data` /
`…Query` (what the server receives) types.

## `src/errors.ts`

- **`ERROR_MESSAGES`** — every error code with `{ en, ar }` text, grouped: validation, auth/OTP,
  profile, roles, places, cars, rides, search, bookings, idempotency, chat, push, generic.
- **`ErrorCode`** type, **`isErrorCode(v)`**, **`errorMessage(code, locale)`** (unknown codes fall back
  to `INTERNAL_ERROR`), **`ApiErrorBody`** type.

Adding an error: add it here with both languages, throw it with `AppException`, document it in the
[API reference](04-api-reference.md).

## `src/api-types.ts`
Response DTOs listed in the [API reference](04-api-reference.md#main-response-shapes).

## `src/i18n/en.ts`, `src/i18n/ar.ts`
All UI strings, grouped by screen: `common`, `brand`, `language`, `welcome`, `phone`, `otp`,
`profileSetup`, `roleSetup`, `permissions`, `tabs`, `home`, `places`, `locationSearch`, `profile`,
`settings`, `search`, `ride`, `status`, `offer`, `vehicle`, `trips`, `notifications`, `chat`,
`errors`. `ar` is typed as `Translation` (derived from `en`), so a missing or extra Arabic key fails
the build. Arabic is written in Egyptian colloquial, as in the design.

## `src/tokens.ts`
`colors`, `space`, `radius`, `fontSize`, `lineHeight`, `arabicLineHeightBonus`, `touch` (`min 44`,
`button 52`, `field 56`), `motion` (`fastMs 150`, `sheetMs 280`), and `tokens` combining them. Values
in the [tech stack](01-tech-stack.md#design-system).
