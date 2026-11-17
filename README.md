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

## Status — Phase 2 (foundation)

| Area | State |
|---|---|
| Monorepo, Docker services, env templates | Done (MinIO is opt-in: `docker compose --profile storage up -d`) |
| Database schema + first migration + Egyptian seed data | Done (27 governorates, ~60 places — coordinates approximate) |
| Phone + OTP sign-in, refresh-token rotation with reuse detection, logout | Done (mock OTP only) |
| Profiles, privacy-safe display names, passenger/driver role switch (checked server-side) | Done |
| Landmark search in Arabic and English, saved Home / Work / other places | Done |
| Mobile: language choice + RTL, welcome, phone, OTP, profile setup, permissions, home with role switch, profile, edit profile, saved places, settings | Done |
| Explore / My Trips / Messages tabs | Placeholder screens — Phase 3+ |
| Ride search, publishing, booking, payments, chat, maps, verification, admin | Not started (Phases 3–5) |

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

Seeded test accounts (development database only):

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
landmark search (abbreviations, Arabic without hamza, Arabic-Indic digits), and owner-only access to
saved places.

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
- Access tokens last 15 minutes. Refresh tokens rotate on every use; reusing an old one revokes the
  whole session family.

## Known limitations (Phase 2)

- **SMS is not connected.** Only the mock OTP exists. A real provider (Twilio Verify, Infobip or an
  Egyptian SMS gateway) needs an account; it plugs in behind `OtpSender` in `src/auth/otp/`.
- **Rate limits are in memory**, per API instance. They move to Redis before running more than one instance.
- **Seed coordinates are approximate.** Verify pickup-critical points (gates, stations) before launch.
- **Profile photos** are not uploadable yet (object storage arrives in Phase 4); avatars show initials.
- **Email login and account deletion** are not implemented yet.
- **Driver mode** can be switched on, but publishing rides needs verification (Phases 3 and 5).
- **Changing language reloads the app.** React Native only applies a new layout direction on restart.
- No mobile UI tests yet (planned for Phase 6).
