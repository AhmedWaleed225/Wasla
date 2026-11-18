# Wasla (وصلة)

Carpooling for Egypt — passengers and drivers sharing seats on the routes they already take.

| Part | Path | Stack |
|---|---|---|
| Mobile app (iOS / Android) | `apps/mobile` | Expo SDK 58, Expo Router, TypeScript, TanStack Query, Zustand, React Hook Form + Zod, i18next (Arabic RTL + English) |
| API | `apps/api` | NestJS 11 (modular monolith), Prisma 6, PostgreSQL 16 + PostGIS, Redis (later phases) |
| Shared code | `packages/shared` | Zod schemas, enums, error codes + messages, design tokens, Arabic/English strings |
| Admin dashboard | `apps/admin` | Next.js — **Phase 5, not started** |

The approved design lives in the Wasla design canvas (Claude Design). Design tokens in
`packages/shared/src/tokens.ts` are copied from its "Design system & tokens" board.

---

## Status — Phase 4, part A (chat and notifications)

| Area | State |
|---|---|
| Monorepo, Docker services, env templates | Done (MinIO is opt-in: `docker compose --profile storage up -d`) |
| Database schema, migrations, Egyptian seed data | Done (27 governorates, ~60 places — coordinates approximate) |
| Phone + OTP sign-in, refresh-token rotation with reuse detection, logout | Done (mock OTP only) |
| Profiles, privacy-safe display names, passenger/driver role switch (checked server-side) | Done |
| Landmark search in Arabic and English, saved Home / Work / other places | Done |
| Driver cars (Egyptian plates), publishing rides with cost-sharing price caps | Done |
| Ride search by place or pin, Egyptian calendar day, radius, seats | Done |
| Booking: instant or driver-approved, seat holds, expiry, cancellation, no overbooking | Done (cash only) |
| Driver ride management: accept/decline, change seats, cancel, complete | Done |
| Mobile: search, results, ride details, booking, Offer form, My Trips, cars | Done |
| Notifications inbox for every booking and ride event, Arabic/English | Done |
| Push notifications (Expo) | API done, off by default (`PUSH_PROVIDER`); the app doesn't register for push yet |
| Private chat per booking (driver ↔ that passenger), unread counts, "seen" | Done (polling, not live sockets) |
| Maps, online payments, real SMS, file uploads | Not started — each needs a provider account (Phase 4, part B) |
| Ratings, verification, safety tools, admin dashboard | Not started (Phase 5) |

See **Known limitations** at the bottom.

---

## Prerequisites

- **Node.js 22.13 or newer** (Expo SDK 58 requires it). `nvm use` reads `.nvmrc`.
- **pnpm 9** — `corepack enable`, or `npm i -g pnpm@9.15.0`.
- **Docker Desktop** (PostgreSQL/PostGIS, Redis, MinIO, Mailpit).
- To run the app on a phone: **Expo Go** (latest) from the App Store / Play Store, on the same Wi-Fi as your computer.

## First-time setup

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and replace both `replace-with-…` secrets. Generate each with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Build the shared package, create the database tables and load development data:

```bash
pnpm --filter @wasla/shared build
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

## Running

API (http://localhost:4000/v1, interactive docs at http://localhost:4000/docs):

```bash
pnpm api:dev
```

Mobile app:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to an address your phone can reach — for Expo Go on a
physical phone that is your computer's LAN IP, e.g. `http://192.168.1.20:4000/v1`. Then:

```bash
pnpm mobile:dev
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

### Logging in during development

`OTP_PROVIDER=mock` never sends SMS. The 6-digit code is printed in the API terminal:

```
WARN [MockOtp] [DEV ONLY] OTP for +201000000001: 482913
```

Set `OTP_MOCK_FIXED_CODE=123456` in `apps/api/.env` if you prefer a fixed code locally.
The API **refuses to start** with the mock provider, the mock switch or a fixed code when
`NODE_ENV=production` (see `apps/api/src/config/env.ts` and its tests).

Seeded test accounts (development database only). Karim and Youssef also get a car and upcoming
rides (Smart Village B2 ⇄ CFC Gate 4, Rehab Gate 13 → Tahrir) so search has results:

| Phone | Name | Roles |
|---|---|---|
| 010 0000 0001 | Nour El-Sayed | passenger |
| 010 0000 0002 | Karim Mostafa | passenger + driver |
| 010 0000 0003 | Youssef Samir | passenger + driver |

Any other valid Egyptian mobile number creates a new account.

## Tests

```bash
pnpm --filter @wasla/shared test
```

```bash
pnpm --filter @wasla/api test:unit
```

The API end-to-end tests use a separate `wasla_test` database (created by Docker on first start),
migrate it and seed it automatically:

```bash
pnpm --filter @wasla/api test:e2e
```

They cover: phone validation and localized errors, sign-up vs log-in, OTP cooldown, the 5-attempt
lock, single-use and expired codes, refresh-token rotation and stolen-token detection, logout,
suspended accounts, profile rules (18+, one profile), roles that clients cannot grant themselves,
landmark search (abbreviations, Arabic without hamza, Arabic-Indic digits), owner-only access to
saved places, and for rides: publishing rules (lead time, seats, price caps, overlap, women-only),
search matching, instant and request bookings, **8 passengers racing for 3 seats** (exactly 3 win),
a passenger tapping "book" 5 times at once (one booking), idempotent retries, cancellations returning
seats, request expiry, locked price/time once booked, ride cancellation and completion; notifications for every booking event (and none with phone numbers),
read/unread scoped to the owner, push text in the reader's language with dead tokens dropped; chat open
only to the driver and that passenger, trimmed and length-limited, closed after cancellation or a day
after departure, immutable messages.

Each e2e run wipes the `wasla_test` database first (it refuses any database not named `*_test`).

## Project layout

```
apps/api/
  prisma/schema.prisma            database schema (Phase 2 tables)
  prisma/migrations/              SQL migrations, incl. hand-written CHECK constraints
  prisma/seed/                    Egyptian places + test accounts
  src/config/env.ts               validated environment, production safety checks
  src/auth/                       OTP, sessions, global auth guard
  src/users/                      profile, roles
  src/locations/                  landmark search, saved places
  src/rides/                      cars, rides, search, bookings, request expiry
  src/notifications/              inbox, push adapter (none | expo), device tokens
  src/chat/                       per-booking chat
  src/common/                     error filter, Zod validation pipe
apps/mobile/
  app/                            screens (Expo Router)
  src/api/                        API client with token refresh
  src/components/                 design-system components
  src/i18n.ts                     Arabic/English + RTL switching
packages/shared/src/              schemas, errors, tokens, translations
```

## API conventions

- All routes are under `/v1`. Every route needs `Authorization: Bearer <accessToken>` unless marked public.
- Errors always look like `{ "error": { "code": "AUTH_OTP_INVALID", "message": "…" } }`. The message
  follows `Accept-Language` (`ar` default, `en`). Apps branch on `code`, never on `message`.
- Money is in piasters (`pricePerSeatPiasters: 4500` = 45 EGP). Ride times are UTC ISO strings; search
  `date` is an Egyptian calendar day.
- `POST /v1/rides/:id/bookings` accepts an `Idempotency-Key` header: a retry with the same key returns
  the original booking (200) instead of booking again (201).
- Access tokens last 15 minutes. Refresh tokens rotate on every use; reusing an old one revokes the
  whole session family.

## Business rules (Phase 3)

All enforced by the API; the numbers live in `packages/shared/src/rides.ts`.

- Rides leave at least 30 minutes and at most 30 days from now; start and end at least 1 km apart.
- A driver can't have two scheduled rides within an hour of each other.
- Price per seat: 5 EGP minimum; maximum is the larger of 30 EGP or 2 EGP per road km (road ≈ 1.3 × straight
  line). Suggested price ≈ 0.75 EGP per road km. These are **assumptions to confirm** with the business.
- Women-only rides: only women drivers can offer them, only women see and book them.
- 1–4 seats per booking; one active booking per passenger per ride.
- Request-mode bookings hold their seats until the driver answers, for up to 12 hours (or until departure).
- Once anyone has booked, the driver can't change the time or price, and can't offer fewer seats than are booked.
- Passengers can cancel until departure. Drivers can cancel any open ride (all bookings are cancelled) and
  mark it done after departure.
- The car plate is shown only to the driver and to confirmed passengers. Others see a display name
  ("Karim M."), never a phone number.

## Known limitations

- **SMS is not connected.** Only the mock OTP exists. A real provider (Twilio Verify, Infobip or an
  Egyptian SMS gateway) needs an account; it plugs in behind `OtpSender` in `src/auth/otp/`.
- **Rate limits are in memory**, per API instance. They move to Redis before running more than one instance.
- **Seed coordinates are approximate.** Verify pickup-critical points (gates, stations) before launch.
- **Profile photos** are not uploadable yet (object storage arrives in Phase 4); avatars show initials.
- **Email login and account deletion** are not implemented yet.
- **No driver verification yet.** Anyone with driver mode on can add a car and publish. ID, licence and
  car checks arrive in Phase 5 and must gate publishing before public launch.
- **Cash only.** Online payment needs a real provider (Paymob, Fawry or similar) in Phase 4.
- **No map yet.** Places are picked from the landmark list; pins and maps arrive in Phase 4.
- **Push is off.** The API can send through Expo (`PUSH_PROVIDER=expo`), but the app doesn't ask for
  permission or register its token yet: that needs `expo-notifications` and an EAS project id. Until then
  the inbox and badges refresh every 15–30 seconds while the app is open.
- **Chat polls** every 4 seconds on an open chat. WebSockets (or push-triggered refresh) are a later step.
- **One route per ride**: no intermediate stops yet. Search matches the ride's start and end only.
- **Request expiry runs in-process** every minute; fine for one or several instances (each booking is
  re-checked under a lock), but a dedicated job runner is better at scale.
- Mobile date and time pickers are built in-app (no native picker) so the app runs in Expo Go.
- **Changing language reloads the app.** React Native only applies a new layout direction on restart.
- No mobile UI tests yet (planned for Phase 6).
