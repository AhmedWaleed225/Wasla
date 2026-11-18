# 9. Testing

| Suite | Tool | Count | Needs Docker | Command |
|---|---|---|---|---|
| Shared unit tests | Vitest | 27 | No | `pnpm --filter @wasla/shared test` |
| API unit tests | Jest | 9 | No | `pnpm --filter @wasla/api test:unit` |
| API end-to-end tests | Jest + Supertest | 61 | Yes (PostgreSQL) | `pnpm --filter @wasla/api test:e2e` |
| Typechecks | tsc | — | No | `pnpm typecheck` (or per package `npx tsc --noEmit`) |
| Android production bundle | `expo export` | — | No | `cd apps/mobile && npx expo export --platform android` |

**CI:** `.github/workflows/ci.yml` runs all of the above on every pull request and every push to
`main`: typechecks, shared and API unit tests, API end-to-end tests against a `postgis/postgis:16-3.4`
service, the API production build, and (in a parallel job) the Android bundle.

## How end-to-end tests work

- They start the **real** Nest application in-process (`createApp()` in `test/helpers.ts`, which uses the
  same `configureApp` as production) and call it over HTTP with Supertest.
- They use the separate **`wasla_test` database**. `test/global-setup.ts` runs once per run: applies
  migrations, truncates all user data, and re-seeds places and the test accounts. It refuses to touch a
  database whose name doesn't end in `_test`.
- `test/setup-env.ts` sets test-only values: `NODE_ENV=test`, test secrets, mock OTP with fixed code
  `123456`. With `NODE_ENV=test` the per-IP throttler and the booking-expiry timer are off (tests call
  `BookingsService.expireDue()` directly); per-phone OTP limits still apply.
- Every test signs up fresh users with `freshPhone()` (a unique `+20159…` number), so tests don't share
  state.
- Push is tested with a fake `PUSH_SENDER` (`createApp([{ provide: PUSH_SENDER, useValue: fake }])`)
  that records what would have been sent.
- "Time passing" is simulated by moving `departure_at` or `expires_at` in the database.

Helpers in `test/helpers.ts`: `createApp(overrides?)`, `freshPhone()`, `login(app, phone?)`,
`loginWithProfile(app, overrides?)`, `randomPlate()`, `bearer(token)`, `makeDriver(app, gender?, seats?,
fullName?)`, `publishRide(app, prisma, driver, overrides?)`.

## What each test proves

### Authentication — `auth.e2e-spec.ts` (11)
- rejects a non-Egyptian number with a localized error
- signs up a new user, then logs the same user in again
- accepts local formats and Arabic-Indic digits for the same account
- enforces the resend cooldown
- locks a code after 5 wrong attempts, even if the 6th guess is right
- does not accept the same code twice
- rejects an expired code
- requires a token for protected routes
- rotates refresh tokens and revokes the family when an old one is reused
- logout ends the session immediately
- blocks suspended accounts on every route and at login

### Profiles and roles — `users.e2e-spec.ts` (7)
- creates a profile once and shows a privacy-safe display name
- rejects users under 18
- ignores role fields sent by the client
- only allows switching to a role the backend granted
- requires a profile before enabling driving
- can opt in to driving during profile setup
- switches the account language

### Places — `locations.e2e-spec.ts` (7)
- finds a gate by its common abbreviation
- finds places by Arabic alias
- matches Arabic without hamza and with Arabic-Indic digits
- filters by kind and treats LIKE wildcards literally
- keeps one HOME per user and protects other users' places
- rejects coordinates outside Egypt
- reports the health of the database

### Cars, rides and bookings — `rides.e2e-spec.ts` (13)
- only drivers can add cars; plates are validated, normalised and unique
- enforces publishing rules on the server (too soon, too far, too many seats, price too high/low, too
  short, women-only by a man, pin without label, someone else's car, overlap, passenger publishing)
- accepts a map pin with a label as a pickup point
- finds rides near both ends on the right day, hiding own, full and women-only rides
- books instantly, reveals the plate, and refuses double or own bookings
- **never oversells seats when many passengers book at the same moment** (8 parallel → exactly 3)
- **gives one booking to a passenger who taps "book" several times at once** (5 parallel → 1)
- **replays a retried request with the same idempotency key instead of booking twice** (parallel and later)
- lets a passenger cancel before departure and returns the seats
- request mode: seats are held while pending; the driver accepts or declines; silence expires
- locks price and time once booked, and never lets seats drop below what is booked
- cancelling a ride cancels its bookings and closes it to new ones
- completes a ride only after departure and counts the trip for both sides

### Notifications and chat — `messaging.e2e-spec.ts` (8)
- tells the driver about an instant booking, in the same transaction, without private data
- covers the request flow: requested, accepted, declined, expired
- tells the driver when a passenger cancels, and every passenger when the driver cancels
- marks only your own notifications as read, and pages through older ones
- pushes in the reader's language to registered devices and drops dead tokens
- lets only the driver and that passenger read and write their thread (incl. immutable messages)
- tracks unread messages, polls for new ones, and closes the chat when the booking ends
- keeps the chat open for a day after departure, then closes it

### Ratings, reports and blocking — `trust.e2e-spec.ts` (6)
- lets both sides rate a completed trip once, with role-appropriate tags
- closes rating after 14 days
- shows an average only once there are 3 ratings
- accepts reports only between people who shared a trip, one open report per trip
- blocking hides rides, prevents booking and chat, and cancels bookings between the two
- reporting with "block" blocks in the same step

### Admin console — `admin.e2e-spec.ts` (6)
- signs in with a hardened session cookie and rejects everything else (same error for unknown email,
  CSRF header required, app tokens rejected)
- locks an account after 5 wrong passwords, even for the right one
- enforces role permissions and hides contact details from finance
- suspends a driver: signs them out, cancels their rides, tells passengers, and can reinstate
- works a report: urgent first, chat visible to support and audited, then resolved
- shows the audit log to operations and ends sessions on logout

### Staff management — `staff.e2e-spec.ts` (3)
- only super admins manage staff
- creates staff with a one-time password that must be changed before anything else
- changes roles, disables (signing out) and resets passwords — never for yourself

The admin console itself was also checked by hand in a browser against the dev database: sign-in,
overview, users, user detail, audit log.

### API unit tests
- `src/config/env.spec.ts` (6): mock OTP needs both switches; refused in production even with both;
  fixed code refused in production; placeholder secrets refused in production; short secrets rejected;
  a valid dev config accepted.
- `src/users/users.service.spec.ts` (3): display names in English, Arabic with "ال", single names,
  opt-in full name.

### Shared unit tests
- `phone.test.ts` (18): every accepted format, Arabic digits, invalid prefixes and lengths, carriers,
  formatting, masking.
- `rides.test.ts` (9): known Cairo distances, price limits (normal and short trips, suggested never above
  max), plate normalisation and rejection, Arabic digits in plates, money formatting in both languages,
  search needs both ends.

## Not covered yet

- **No mobile UI tests.** The app is typechecked and its Android bundle builds, but screens have not
  been exercised automatically or on a device. Planned for Phase 6 (component tests with React Native
  Testing Library, flows with Maestro or Detox).
- **No load tests** (Phase 6).
- Push delivery to Expo itself (real network) is not tested; only what would be sent.
