# 6. Code reference — API (`apps/api`)

Every file, what it's for, and the functions or methods it contains. Paths are relative to `apps/api`.

## Configuration files

| File | Purpose |
|---|---|
| `package.json` | Scripts: `build` (nest build), `dev` (watch), `start`, `test` (all), `test:unit`, `test:e2e`, `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `db:reset`. `prisma.seed` points to the seed script |
| `tsconfig.json` / `tsconfig.build.json` | CommonJS, decorators and metadata enabled (Nest needs both); build excludes tests |
| `nest-cli.json` | Nest CLI build settings |
| `jest.config.js` | Two projects: **unit** (`src/**/*.spec.ts`) and **e2e** (`test/**/*.e2e-spec.ts`, with `globalSetup`). `setupFiles: test/setup-env.ts` |
| `.env.example` | Every environment variable with comments, plus provider placeholders ([operations](11-operations-and-roadmap.md)) |

## Entry point

### `src/main.ts`
- **`configureApp(app)`** — shared by the real server and the tests: global prefix `v1`, helmet,
  `trust proxy` (one proxy hop), JSON body limit 100 KB, CORS only for `CORS_ORIGINS` (none if empty),
  shutdown hooks. Returns the validated env.
- **`bootstrap()`** — creates the Nest app with the pino logger, calls `configureApp`, mounts Swagger at
  `/docs` unless production, listens on `PORT`, and logs a warning when the mock OTP provider is active.
  Only runs when the file is executed directly (`require.main === module`), so tests can import
  `configureApp` without starting a server.

### `src/app.module.ts`
- **`AppModule`** — wires everything: `ConfigModule`, `LoggerModule` (pino with request ids and
  redaction; silent in tests; pretty in development), `ThrottlerModule` (120/min, skipped when
  `NODE_ENV=test`), `PrismaModule`, `AuditModule`, `NotificationsCoreModule`, `UsersModule`,
  `AuthModule`, `LocationsModule`, `RidesModule`, `ChatModule`, `NotificationsModule`, `HealthModule`.
  Registers `ThrottlerGuard` and `AllExceptionsFilter` globally.

## `src/config/`

### `env.ts`
- **`envSchema`** (internal) — Zod schema for every variable: `NODE_ENV`, `PORT`, `CORS_ORIGINS`,
  `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` (≥32 chars), `OTP_HASH_SECRET` (≥32),
  `ACCESS_TOKEN_TTL_SECONDS` (60–3600, default 900), `REFRESH_TOKEN_TTL_DAYS` (1–90, default 30),
  `OTP_PROVIDER` (`mock`|`twilio`), `OTP_MOCK_ENABLED`, `OTP_MOCK_FIXED_CODE` (6 digits),
  `PUSH_PROVIDER` (`none`|`expo`), `EXPO_ACCESS_TOKEN`, `LOG_LEVEL`. A `superRefine` adds the
  production guards (no mock OTP, no fixed code, no placeholder or identical secrets) and refuses
  `OTP_PROVIDER=twilio` until it's implemented.
- **`loadEnv(source = process.env)`** — validates once and throws one error listing every problem.
- **`ENV`** — injection token; **`Env`** — the validated type.

### `env.spec.ts`
Unit tests for the production guards (6 tests).

### `config.module.ts`
- **`ConfigModule`** (global) — provides `ENV` from `loadEnv()`.

## `src/prisma/prisma.service.ts`
- **`PrismaService`** extends `PrismaClient`; `onModuleInit()` connects, `onModuleDestroy()` disconnects.
- **`PrismaModule`** (global) exports it.

## `src/common/` — cross-cutting pieces

### `app-exception.ts`
- **`AppException(code, status, fields?, extra?)`** — the only exception business code throws. `code` is
  an `ErrorCode` from the shared package.
- Helpers: **`badRequest(code, fields?)`** 400, **`unauthorized(code?)`** 401, **`forbidden(code?)`** 403,
  **`notFound(code?)`** 404, **`conflict(code)`** 409, **`tooMany(code, extra?)`** 429.

### `http-exception.filter.ts`
- **`AllExceptionsFilter.catch(exception, host)`** — turns any error into `{ error: { code, message,
  fields?, …extra, requestId } }`. `AppException` keeps its code; throttler errors become
  `RATE_LIMITED`; other HTTP errors map by status; anything else is a logged 500 `INTERNAL_ERROR`
  (details never leak to the client). The message comes from `errorMessage(code, locale)`.

### `locale.ts`
- **`localeFromHeader(header)`** — `'en'` if `Accept-Language` starts with `en`, otherwise `'ar'`.

### `zod-validation.pipe.ts`
- **`ZodPipe(schema).transform(value)`** — parses with a shared schema; on failure collects a
  per-field map of error codes and throws `badRequest`. If every failing field has the same code (e.g.
  `AUTH_INVALID_PHONE`), that becomes the top-level code; otherwise `VALIDATION_FAILED`.

### `request-meta.ts`
- **`@ReqMeta()`** — parameter decorator giving `{ ip, userAgent }` (truncated) for sessions and audit.

## `src/audit/audit.service.ts`
- **`AuditService.record(entry, tx?)`** — inserts into `audit_logs`. Inside a transaction a failure
  propagates (so the business change rolls back too); outside one it's logged and swallowed.
- **`AuditModule`** (global).

## `src/auth/` — sign-in and sessions

### `otp/otp-provider.ts`
- **`OtpSender`** interface `{ name, send(phoneE164, code, locale) }`; token **`OTP_SENDER`**.
- **`MockOtpSender`** — logs `[DEV ONLY] OTP for +20…: 123456` at warn level. Real providers plug in here.

### `otp/otp.service.ts`
- **`OTP_RULES`** — `ttlSeconds 300`, `resendCooldownSeconds 45`, `maxAttempts 5`, `maxRequestsPerHour 5`.
- **`hash(phone, code)`** (private) — HMAC-SHA256 with `OTP_HASH_SECRET`, binding the code to the number.
- **`generateCode()`** (private) — `crypto.randomInt`, or the fixed dev code outside production.
- **`request(phone, locale, ip)`** — enforces cooldown and hourly cap, expires older live codes, stores
  the hash, sends; if sending fails the challenge is deleted and `AUTH_OTP_SEND_FAILED` (502) returned.
- **`verify(phone, code)`** — finds the newest unconsumed challenge, increments `attempts` with a
  conditional update *before* comparing (so parallel guesses can't exceed 5), compares with
  `timingSafeEqual`, then consumes it with another conditional update (so a code works once even under
  parallel requests).

### `tokens.service.ts`
- **`newRefreshToken()`** — 48 random bytes, base64url, plus its SHA-256.
- **`signAccess(userId, sessionId)`** — JWT `{ sub, sid }`, TTL from env.
- **`issue(userId, meta, deviceName?)`** — new session with a new `familyId`; returns the token pair.
- **`rotate(refreshToken, meta)`** — looks up by hash. Already rotated or revoked → **revoke the whole
  family**, audit `auth.refresh_token_reuse`, 401. Expired → revoke family. Suspended → 403. Otherwise,
  in a transaction, marks the old row rotated (conditional, so two parallel refreshes can't both win)
  and creates the next session in the same family.
- **`revokeFamily(familyId)`**, **`revokeSession(sessionId)`** (revokes its family),
  **`revokeAllForUser(userId)`**.

### `auth.guard.ts`
- **`@Public()`** — marks a route as not needing a token (`IS_PUBLIC` metadata).
- **`@CurrentUser()`** — returns `req.auth`; throws 401 if missing.
- **`AuthContext`** `{ userId, sessionId, roles, activeRole }`.
- **`AuthGuard.canActivate(ctx)`** — verifies the JWT (HS256, issuer `wasla-api`), loads the session and
  user, rejects revoked sessions, mismatched users, suspended or deleted accounts, then sets `req.auth`
  with roles **from the database**.

### `auth.service.ts`
- **`requestOtp(phone, locale, meta)`** → `OtpService.request`.
- **`verifyOtp(phone, code, locale, meta, deviceName?)`** — verifies the code, refuses suspended
  accounts, finds or creates the user (`phoneVerifiedAt`, locale), audits `auth.signup` or
  `auth.login`, issues tokens, returns `{ …tokens, user: MeDto, isNewUser }`.
- **`refresh(refreshToken, meta)`** → `TokensService.rotate`.
- **`logout(user, meta)`** — revokes the current session family and audits.

### `auth.controller.ts`
Routes `POST /auth/otp/request` (5/min), `/auth/otp/verify` (10/min), `/auth/refresh` (30/min) — all
`@Public()` — and `POST /auth/logout` (204).

### `auth.module.ts`
- **`AuthModule`** — global `JwtModule` configured from env (HS256 only, issuer `wasla-api` on sign and
  verify); imports `UsersModule`; providers `AuthService`, `OtpService`, `TokensService`, `OTP_SENDER`
  (a factory returning `MockOtpSender` for `mock` and throwing for anything not implemented), and
  `AuthGuard` as a global guard. Exports `TokensService`.

## `src/users/` — profile and roles

### `display-name.ts`
- **`displayNameOf(fullName, showFullLastName)`** — "Nour El-Sayed" → "Nour E."; Arabic family names
  starting with the article "ال" use the next letter: "نور السيد" → "نور س.". Returns the full name if
  the user opted in or has one name.

### `users.service.ts`
- **`toProfileDto(p)`** (module-level) — profile row → `ProfileDto` with `displayName`.
- **`prefsToColumns(prefs)`** — maps `{ quietRides, musicOk, acPreferred, smokingOk }` to columns,
  only for keys present.
- **`toMe(user, ridesCompleted)`** (private) — builds `MeDto`.
- **`getMe(userId)`** — user + profile + completed-trip count (`completedCounts`).
- **`createProfile(userId, input)`** — once only; in one transaction creates the profile, adds the
  DRIVER role if `wantsToDrive` (the user switches into driver mode later from Home), and audits
  `profile.create`.
- **`updateProfile(userId, input)`** — name, bio, preferences, privacy toggles, locale.
- **`enableDriving(userId)`** — requires a profile; adds DRIVER; audits `role.driver_enabled`.
- **`setActiveRole(userId, role)`** — `ROLE_NOT_GRANTED` unless held.
- Re-exports `displayNameOf`.

### `users.controller.ts`, `users.module.ts`
Routes under `/me`: `GET`, `POST profile`, `PATCH profile`, `POST roles/driver`, `PUT active-role`.

### `users.service.spec.ts`
Unit tests for `displayNameOf` (English, Arabic with "ال", opt-in full name).

## `src/locations/` — places

### `arabic-normalize.ts`
- **`PAIRS`** (internal) — character folds: أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي, Arabic-Indic and
  Persian digits → 0–9.
- **`SQL_TRANSLATE_FROM` / `SQL_TRANSLATE_TO`** — the same folds as strings for SQL `translate()`.
- **`SQL_STRIP_CLASS`** — regex class for tatweel and harakat (removed before matching).
- **`normalizeForSearch(input)`** — lower-case, strip marks, fold characters, collapse spaces. Applied to
  the query in TypeScript and to the columns in SQL, so both sides match.

### `locations.service.ts`
- **`norm(column)`** (module-level) — SQL fragment applying the normalisation to a column.
- **`escapeLike(s)`** — escapes `%`, `_`, `\` so user input can't act as a wildcard.
- **`search(q, kinds, limit)`** — every query word must appear in the place's English name, Arabic name
  or aliases (any order). Ranking: whole name starts with the phrase → a word starts with it → contains
  the phrase → words only; then popularity, then name.
- **`getById(id)`** — with parent names; `LOCATION_NOT_FOUND`.
- **`savedToDto(s)`** (private), **`listSaved(userId)`**.
- **`save(userId, input)`** — resolves coordinates from the place if given; HOME/WORK are upserted (one
  each); OTHER is added; runs in a transaction.
- **`removeSaved(userId, id)`** — deletes scoped by owner; 404 otherwise.

### `locations.controller.ts`, `locations.module.ts`
Routes: `GET /locations/search`, `GET /locations/:id`, `GET/POST /me/saved-locations`,
`DELETE /me/saved-locations/:id`. A shared `ParseUUIDPipe` turns bad ids into 404.

## `src/rides/` — cars, rides, bookings

### `ride-mapper.ts` — turning rows into what each viewer may see
- **`rideInclude`** — the Prisma `include` every ride query uses (driver + profile, vehicle).
- **`RideWithDriver`** type; **`ACTIVE_STATUSES`** = `['PENDING', 'CONFIRMED']`.
- **`plateOf(v)`** → "أ ب ج 1234".
- **`toVehicleDto(v, showPlate)`** — plate or `null`.
- **`toPublicUser(user, ridesCompleted)`** — display name, gender only if shown, member since; never phone.
- **`completedCounts(prisma, userIds)`** — one SQL query counting completed rides driven plus completed
  bookings, per user, for a whole page of results.
- **`toRideSummary(ride, counts, { showPlate, match? })`** — `RideSummaryDto`, distances rounded to 0.1 km.
- **`toBookingSummary(b)`** — `expiresAt` only while pending.
- **`priceLimitsFor(km)`** — `priceLimitsEgp` from shared.
- **`isUniqueViolation(err, target)`**, **`isAnyUniqueViolation(err)`** — detect Prisma `P2002`.

### `vehicles.service.ts`
- **`requireDriver(userId)`** (private) — `DRIVER_ROLE_REQUIRED`.
- **`list(userId)`**, **`add(userId, input)`** (plate conflict → `VEHICLE_PLATE_TAKEN`; audited),
  **`update(userId, id, input)`** (can't drop seats below any scheduled ride's offer),
  **`remove(userId, id)`** (soft delete; refused with scheduled rides; audited).

### `rides.service.ts`
- **`create(userId, input)`** — all publishing checks ([rules](05-business-rules-and-security.md#publishing-a-ride));
  in a transaction locks the user row, checks overlap, inserts, audits `RIDE_PUBLISHED`.
- **`update(userId, rideId, input)`** — locks the ride; refuses time/price changes with active
  bookings; recalculates `seatsAvailable = newSeats − booked`; re-checks window, overlap and price.
- **`cancel(userId, rideId, reason?)`** — locks; cancels active bookings; resets seats; audits; creates
  `RIDE_CANCELLED` notifications; dispatches push after commit.
- **`complete(userId, rideId)`** — locks; must have departed; confirmed → completed, pending → expired;
  `RIDE_COMPLETED` notifications.
- **`detail(viewerId, rideId)`** — visibility rules; driver gets every booking with passenger public
  info; computes `showPlate`, `priceLimits`, `myBooking`.
- **`listMine(userId, scope)`** — driver's rides, 50 max.
- **`search(viewerId, query)`** — resolves both ends, builds a bounding box, runs one SQL query with
  `wasla_distance_km`, then loads full rows and keeps the SQL order.
- Private helpers: **`nameOf(tx, userId)`**, **`checkDepartureWindow(dep)`**, **`checkPrice(egp, km)`**,
  **`checkNoOverlap(tx, driverId, dep, exceptRideId?)`**, **`lockOwnRide(tx, userId, rideId)`** (row lock
  + ownership), **`resolvePoint(p)`** (place or pin → names and coordinates; `PLACE_NO_COORDINATES`),
  **`resolveSearchEnd(locationId?, lat?, lng?)`**.

### `bookings.service.ts`
- **`create(passengerId, rideId, input, idempotencyKey?)`** — returns `{ booking, replayed }`.
  Order: key lookup → load passenger → transaction (lock ride → key lookup again → checks → conditional
  seat decrement → insert → audit → notification) → dispatch push. Catches unique violations: same key
  raced → return the winner; otherwise `BOOKING_ALREADY_EXISTS`.
- **`cancelByPassenger(passengerId, bookingId, reason?)`** — lock, re-read, check, release seats, audit,
  notify driver.
- **`decide(driverId, bookingId, accept)`** — accept keeps seats; decline releases them; notifies the passenger.
- **`get(viewerId, bookingId)`**, **`listMine(passengerId, scope)`**.
- **`expireDue(limit = 200)`** — per due booking: lock, re-check, `EXPIRED`, release, audit as SYSTEM,
  notify passenger. Errors on one booking are logged and don't stop the rest.
- Private: **`nameOf`**, **`lockRide(tx, rideId)`**, **`closeAndRelease(tx, booking, status, extra)`**
  (ends a booking and returns its seats if the ride is still open), **`findByKey(passengerId, key,
  rideId)`**, **`toDto(b, viewerId)`**.

### `booking-expiry.service.ts`
- **`BookingExpiryService`** — `onApplicationBootstrap()` starts a 60-second `setInterval` (unref'd; not
  in tests), `tick()` calls `expireDue()` with a re-entrancy flag, `onApplicationShutdown()` stops it.

### `rides.controller.ts`
- **`VehiclesController`** (`/me/vehicles`): `list`, `add`, `update`, `remove`.
- **`RidesController`**: `search`, `create` (20/min), `detail`, `update`, `cancel`, `complete`,
  `myRides`, `book` (30/min; validates the `Idempotency-Key` header with `idempotencyKeySchema`; sets
  201 or 200), `myBookings`, `booking`, `cancelBooking`, `accept`, `decline`.

### `rides.module.ts`
Controllers above; providers `VehiclesService`, `RidesService`, `BookingsService`,
`BookingExpiryService`; exports `BookingsService`.

## `src/notifications/`

### `push-sender.ts`
- **`PushMessage`** `{ token, title?, body, data }`, **`PushResult`** `{ invalidTokens }`,
  **`PushSender`** interface, token **`PUSH_SENDER`**.
- **`NoopPushSender.send()`** — does nothing (default).
- **`ExpoPushSender(accessToken?).send(messages)`** — POSTs batches of 100 to Expo's push API with a
  10 s timeout; collects `DeviceNotRegistered` tokens; logs and continues on HTTP errors.

### `render.ts`
- **`renderNotification(type, data, locale)`** — fills the shared `notifications.*` template with
  `name`, `route` ("from – to") and `time` (formatted in `Africa/Cairo`).
- **`renderNewMessageTitle(name, locale)`**.

### `notifications.service.ts`
- **`rideData(ride, name?)`** — template values from a ride.
- **`NotificationsService`**:
  - **`create(tx, entries)`** — `createManyAndReturn` inside the caller's transaction.
  - **`dispatch(rows)`** — after commit, fire-and-forget push (never throws).
  - **`pushMessage(recipientId, senderName, body, bookingId)`** — chat push with an 80-character preview.
  - **`deliver(items)`** (private) — loads active devices and locales, renders, sends, disables dead tokens.
  - **`list(userId, before?)`** — 30 per page with a stable cursor (`createdAt`, `id`).
  - **`unreadCount(userId)`**, **`markRead(userId, { ids | all })`** (owner-scoped).
  - **`registerDevice(userId, token, platform)`** (upsert, moves token), **`removeDevice(userId, token)`**.
- **`NotificationsCoreModule`** (global) — provides the service and picks `ExpoPushSender` when
  `PUSH_PROVIDER=expo` (never in tests), else `NoopPushSender`.

### `notifications.controller.ts`
- **`NotificationsController`** (`/me`): `list`, `unread`, `read`, `register`, `unregister`.
- **`NotificationsModule`** — the controller.

## `src/chat/`

### `chat.service.ts`
- **`isChatOpen(booking, ride, now?)`** — booking pending/confirmed/completed, ride not cancelled, and
  within 24 h after departure.
- **`toMessage(m, viewerId)`** — adds `mine`.
- **`ChatService`**:
  - **`thread(viewerId, bookingId)`** (private) — loads booking + ride; 404 unless the viewer is its
    passenger or driver; returns the other participant.
  - **`messages(viewerId, bookingId, { before?, after? })`** — `after` returns newer messages in order
    (polling); otherwise the latest or older page, reversed to oldest-first. Includes `open` and the
    other person's read time.
  - **`send(viewerId, bookingId, body)`** — `CHAT_CLOSED` if not open; inserts the message and updates
    the sender's read time in one transaction; pushes to the other person.
  - **`markRead(viewerId, bookingId)`** — upserts `chat_reads`.
  - **`conversations(viewerId)`** — bookings where the viewer is a party and that are active or have
    messages; last message via `DISTINCT ON`, unread counts via one grouped query; sorted by latest activity.
  - **`unreadTotal(viewerId)`** — one count query for the tab badge.

### `chat.controller.ts`
- **`ChatController`**: `conversations`, `unread`, `messages`, `send` (30/min), `read`.
- **`ChatModule`**.

## `src/health/health.controller.ts`
- **`HealthController.health()`** — `@Public()`; runs `SELECT 1` and reports `{ status, database }`.
- **`HealthModule`**.

## `src/trust/` — ratings, reports, blocks

### `block-check.ts`
- **`isBlockedEither(db, a, b)`** — true if either blocked the other.
- **`blockedSet(db, userId)`** — everyone on either side of a block with this user.
- **`notBlockedSql(viewerId, otherColumn)`** — SQL condition used by ride search.

### `trust.service.ts`
- **`toRatingDto(r)`**.
- **`TrustService`**:
  - **`parties(viewerId, bookingId)`** (private) — the booking's two people; 404 for anyone else.
  - **`ratingStatus(viewerId, bookingId)`** — ratee, `canRate`, deadline, existing rating.
  - **`rate(viewerId, bookingId, input)`** — checks completion, window, tags; inserts and audits;
    duplicate → `RATING_ALREADY_EXISTS`.
  - **`report(reporterId, input)`** — checks the pair shared the booking and the daily cap; inserts and
    audits; duplicate open report → `REPORT_ALREADY_OPEN`; optionally blocks.
  - **`myReports(reporterId)`**.
  - **`block(blockerId, blockedId)`** — idempotent; audits; calls `BookingsService.cancelForBlock`.
  - **`unblock(blockerId, blockedId)`**, **`blocked(blockerId)`**.

### `trust.controller.ts`
**`TrustController`** (routes above) and **`TrustModule`** (imports `RidesModule`).

## `src/admin/` — staff console API

### `password.ts`
- **`hashPassword(password)`** → `scrypt$<salt>$<hash>`; **`verifyPassword(password, stored)`**
  (constant time); **`DUMMY_HASH`** (checked for unknown emails); **`ADMIN_PASSWORD_MIN_LENGTH`** = 12.

### `cookies.ts`
- **`readCookie(header, name)`**, **`sessionCookie(token, maxAge, secure)`** (HttpOnly,
  SameSite=Strict, Path=/v1/admin), **`clearedCookie(secure)`**.

### `admin-auth.service.ts`
- **`login(email, password, meta)`** — lockout logic, session creation, audit.
- **`fromToken(token)`** — the live session and admin, or null.
- **`logout(sessionId, adminId, meta)`**.

### `admin.guard.ts`
- **`@AdminPerm(permission)`**, **`@CurrentAdmin()`**, **`checkCsrf(req)`**.
- **`AdminGuard`** — CSRF header, session cookie, role permission; sets `req.admin`.

### `admin.service.ts`
- **`overview()`** — counts with Cairo-day boundaries and a 7-day series.
- **`users(admin, q)`**, **`user(admin, id)`** (audits contact views), **`suspend`**, **`reinstate`**.
- **`ridesList(q)`**, **`ride(id)`**, **`cancelRide(admin, id, reason)`**.
- **`reports(q)`** (`urgent` filter), **`report(admin, id)`** (chat for allowed roles, audited),
  **`updateReport(admin, id, input)`**.
- **`auditLog(q)`**.

### `admin.controller.ts`
**`AdminAuthController`** (`/admin/auth`), **`AdminController`** (`/admin`), **`AdminModule`**.
Both controllers are `@Public()` for the app's user guard and protected by `AdminGuard` instead.

## Changes to existing files in Phase 5

- `rides/ride-mapper.ts`: **`userStats(prisma, ids)`** replaces `completedCounts` and also returns
  rating count and average (hidden below 3); **`toPublicUser(user, stats)`** takes those stats.
- `rides/bookings.service.ts`: booking refuses blocked pairs; **`cancelForBlock(blockerId, otherId)`**.
- `rides/rides.service.ts`: search and details respect blocks.
- `chat/chat.service.ts`: chat closed between blocked people.
- `auth/auth.guard.ts`: suspension is reported before session revocation.
- `main.ts`: CORS allows credentials for listed origins only.

## `prisma/`

### `schema.prisma`
All models and enums ([database](03-database.md)).

### `seed/locations.ts`
- **`SEED_PLACES`** — the place list; **`SeedKind`**, **`SeedPlace`** types (`slug`, `kind`, `en`,
  `ar`, `parent`, `lat?`, `lng?`, `aliases?`, `popularity?`).

### `seed/index.ts`
- **`seedLocations()`** — upserts places in order (parents first), returns `Map<slug, id>`.
- **`seedUsers(idBySlug)`** — three test accounts with profiles and Home/Work.
- **`hashAdminPassword(password)`** — `scrypt$<salt>$<hash>`.
- **`seedAdmin()`** — only if `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` are set.
- **`seedRides(ids)`** — cars and upcoming rides for the two seeded drivers, priced at the suggested price.
- **`main()`** — refuses production, runs the above.

## `test/` — see [Testing](09-testing.md)

| File | Contents |
|---|---|
| `setup-env.ts` | Test environment variables (test database, fixed OTP `123456`, test secrets) |
| `global-setup.ts` | Migrate, wipe and seed `wasla_test` (refuses non-`_test` names) |
| `helpers.ts` | `createApp(overrides?)`, `freshPhone()`, `login()`, `loginWithProfile()`, `randomPlate()`, `bearer()`, `makeDriver()`, `publishRide()` |
| `auth.e2e-spec.ts`, `users.e2e-spec.ts`, `locations.e2e-spec.ts`, `rides.e2e-spec.ts`, `messaging.e2e-spec.ts`, `trust.e2e-spec.ts`, `admin.e2e-spec.ts` | End-to-end suites |
