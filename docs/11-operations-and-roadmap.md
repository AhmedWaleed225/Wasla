# 11. Operations and roadmap

## Running locally

Prerequisites: Node 22.13+, pnpm 9, Docker Desktop. Then:

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
cp apps/api/.env.example apps/api/.env
```

Replace the two `replace-with-…` secrets in `apps/api/.env` (generate each with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), then:

```bash
pnpm --filter @wasla/shared build
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm api:dev
```

```bash
pnpm mobile:dev
```

Log in with a seeded number (`010 0000 0001`, `…0002`, `…0003`); the code appears in the API terminal.
Set `OTP_MOCK_FIXED_CODE=123456` in `.env` for a fixed code.

| Root script | Does |
|---|---|
| `pnpm build` / `test` / `typecheck` | Turborepo across all packages |
| `pnpm services:up` / `services:down` | `docker compose up -d` / `down` |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Prisma in the API package |
| `pnpm api:dev` | API in watch mode on port 4000 |
| `pnpm mobile:dev` | Expo dev server |

## API environment variables (`apps/api/.env`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `NODE_ENV` | | development | `development`, `test` or `production`. Production turns on the safety guards |
| `PORT` | | 4000 | |
| `CORS_ORIGINS` | | empty | Comma-separated origins for browsers (admin, Expo web). Empty = no browser origins |
| `DATABASE_URL` | yes | | PostgreSQL connection string |
| `REDIS_URL` | | | Reserved |
| `JWT_ACCESS_SECRET` | yes | | ≥ 32 chars; no placeholder in production; must differ from the OTP secret |
| `OTP_HASH_SECRET` | yes | | ≥ 32 chars |
| `ACCESS_TOKEN_TTL_SECONDS` | | 900 | 60–3600 |
| `REFRESH_TOKEN_TTL_DAYS` | | 30 | 1–90 |
| `OTP_PROVIDER` | | mock | Only `mock` works today; refused in production |
| `OTP_MOCK_ENABLED` | | false | Second switch for the mock; refused in production |
| `OTP_MOCK_FIXED_CODE` | | | 6 digits, dev/test only; refused in production |
| `PUSH_PROVIDER` | | none | `none` or `expo` |
| `EXPO_ACCESS_TOKEN` | | | Only if Expo "enhanced push security" is on |
| `LOG_LEVEL` | | info | pino level |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | | | Optional: create an admin when seeding |

Startup fails with a list of every problem if any value is invalid.

## Mobile environment variables (`apps/mobile/.env`)

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_URL` | API address as the phone sees it: `http://localhost:4000/v1` (iOS simulator), `http://10.0.2.2:4000/v1` (Android emulator), `http://<computer LAN IP>:4000/v1` (real phone on the same Wi-Fi) |
| `EAS_PROJECT_ID` | Placeholder — needed for push tokens |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Placeholder — restricted to the app's bundle id |

Anything starting with `EXPO_PUBLIC_` is bundled into the app and visible to anyone who installs it.

## Provider placeholders

Empty entries at the bottom of `apps/api/.env.example` / `.env` and `apps/mobile/.env.example` /
`.env`. **Nothing reads them yet.** Each integration will be built against sandbox keys and will refuse
to start in production if its keys are missing.

| Area | Variables | Where to get them |
|---|---|---|
| SMS (Twilio Verify) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | console.twilio.com |
| SMS (Infobip, alternative) | `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_SENDER_ID` | portal.infobip.com |
| Payments (Paymob) | `PAYMOB_API_KEY`, `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_INTEGRATION_ID_WALLET` | accept.paymob.com (test mode) |
| Payments (Fawry, alternative) | `FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY` | Fawry staging |
| Maps (server) | `GOOGLE_MAPS_SERVER_API_KEY` | Google Cloud, restricted to the server and needed APIs |
| File storage | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Any S3-compatible service |
| Push | `EXPO_ACCESS_TOKEN` (API), `EAS_PROJECT_ID` (app) | expo.dev |
| Maps (app) | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud, restricted to `app.wasla.mobile` |

## Before production (checklist)

- [ ] Real SMS provider wired; `OTP_PROVIDER` set to it; mock switches off (enforced at startup).
- [ ] Strong, distinct secrets from a secret manager (not files on the server).
- [ ] `CORS_ORIGINS` set to the admin dashboard's origin only.
- [ ] Rate limits moved to Redis if more than one API instance runs.
- [ ] Driver verification (ID, licence, car papers) gating ride publishing.
- [ ] Seed coordinates for every pickup-critical point checked on the ground.
- [ ] Database backups and point-in-time recovery; migrations applied with `prisma migrate deploy`.
- [ ] Log shipping and alerts on 5xx and on `auth.refresh_token_reuse` audit entries.
- [ ] Account deletion and data export for privacy compliance.
- [ ] Price-cap constants confirmed by the business.
- [ ] CI pipeline: install, typecheck, unit tests, e2e tests against a PostgreSQL service, Android bundle.

## Roadmap

### Phase 4B — integrations (needs the placeholders filled)
- **SMS:** an `OtpSender` implementation for the chosen provider (the interface is ready in
  `src/auth/otp/otp-provider.ts`).
- **Payments:** card and wallet payment for bookings via Paymob or Fawry: payment intent on booking,
  webhook with HMAC verification, refunds on cancellation, no fake success states. Cash stays available.
- **Maps:** map view of results and pickup points, pin dropping (the API already accepts pins), route
  distance from the provider instead of straight-line estimates.
- **File storage:** profile photos, later licence and car documents, via presigned uploads.
- **Push in the app:** request permission (already on the onboarding screen), get the Expo token with the
  EAS project id, `POST /me/push-devices`, `DELETE` on logout, open the right screen on tap.
- **Live updates:** WebSockets (or push-triggered refresh) for chat and badges instead of polling.

### Phase 5 — trust and operations
- Ratings and reviews after completed rides (the DTOs already carry `ratingAverage`).
- Driver verification workflow and document review.
- Report and block users; SOS / share live trip.
- Admin dashboard (`apps/admin`, Next.js): users, rides, bookings, reports, verification queue, audit log.

### Phase 6 — quality and release
- Mobile component and end-to-end tests; load tests on search and booking.
- Accessibility pass (screen readers in both languages), performance budget.
- Store builds with EAS, release process, monitoring.

### Smaller improvements noted along the way
- `.gitattributes` to fix line endings.
- Pagination for ride search beyond 50 results.
- Intermediate stops on rides.
- Move from the custom distance function to PostGIS geography columns when maps arrive.
- Use react-hook-form for the larger forms (it's installed but not used yet).
