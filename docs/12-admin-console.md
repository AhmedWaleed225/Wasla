# 12. Admin console (`apps/admin`)

"Wasla Ops" — the staff console from the **Admin** board of the design canvas: dark sidebar, metric
cards, tables with status tags. It's a small React single-page app talking to the `/v1/admin` API.

## Running it

1. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (12+ characters) in `apps/api/.env`, then
   `pnpm db:seed` to create a `SUPER_ADMIN`.
2. Start the API (`pnpm api:dev`) and the console (`pnpm admin:dev`).
3. Open http://localhost:3000 and sign in.

Other roles are created directly in the database for now (an "add staff" screen is on the roadmap):
`admin_users` with a password hash from `hashPassword()` in `apps/api/src/admin/password.ts`.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Build | Vite 6 + `@vitejs/plugin-react` | Fast dev server, small production bundle (~106 KB gzipped). An internal tool needs no server-side rendering, so Next.js was not needed |
| UI | React 19, plain CSS (`src/styles.css`) with the design's tokens | No component library to keep in step with the design |
| Data | TanStack Query 5 | Caching, refetch, invalidation after actions |
| Routing | Hash routes (`#/users/<id>`) in `useRoute()` | No router dependency; deep links work on any static host |
| Shared code | `@wasla/shared` aliased to its TypeScript source in `vite.config.ts` | The package's `dist/` is CommonJS for Node; the browser build uses the source |

## Security model

```mermaid
sequenceDiagram
  participant B as Browser (console)
  participant V as Same origin (Vite proxy / reverse proxy)
  participant A as API /v1/admin
  B->>V: POST /v1/admin/auth/login {email, password} + X-Wasla-Admin: 1
  V->>A: forwarded
  A->>A: scrypt check (dummy hash if unknown email), lockout after 5 failures
  A-->>B: Set-Cookie: wasla_admin=<random>; HttpOnly; SameSite=Strict; Path=/v1/admin; Secure (prod)
  B->>V: GET /v1/admin/overview (cookie sent automatically)
  A->>A: AdminGuard: session live? admin enabled? role has permission?
  A-->>B: data
  B->>V: POST /v1/admin/users/:id/suspend + X-Wasla-Admin: 1
  A->>A: CSRF header present, then same checks, then audit "admin.user_suspended"
```

- **Separate from app users.** Staff accounts live in `admin_users`; app tokens are rejected on
  `/v1/admin` routes, and admin cookies mean nothing to app routes.
- **Session cookie, not browser storage.** The token is random (32 bytes), stored only as SHA-256 in
  `admin_sessions`, valid 8 hours, revoked on sign-out. JavaScript can't read it (`HttpOnly`), other
  sites can't send it (`SameSite=Strict`), and it's only sent to `/v1/admin`.
- **CSRF.** Every change must carry `X-Wasla-Admin: 1`. A form on another site can't add headers, and a
  script on another origin would need a CORS preflight, which the API refuses for unlisted origins.
- **Brute force.** Same error for unknown email and wrong password, password check runs either way,
  5 failures lock the account for 15 minutes, sign-in limited to 5 per minute per IP.
- **Least privilege.** Every route declares a permission; `AdminGuard` checks it against the role on
  each request. The console hides buttons a role can't use, but the API is what enforces it.
- **Everything is audited**, including looking at a user's contact details and reading a report's chat.

## Roles

| Permission | Super admin | Operations | Support | Finance |
|---|:-:|:-:|:-:|:-:|
| Overview | ✓ | ✓ | ✓ | ✓ |
| View users | ✓ | ✓ | ✓ | ✓ (phone masked) |
| See phone numbers | ✓ | ✓ | ✓ | — |
| Suspend / reinstate users | ✓ | ✓ | — | — |
| View rides | ✓ | ✓ | ✓ | ✓ |
| Cancel rides | ✓ | ✓ | — | — |
| View and handle reports | ✓ | ✓ | ✓ | — |
| Read a reported trip's chat | ✓ | ✓ | ✓ | — |
| Audit log | ✓ | ✓ | — | — |

Defined once in `ADMIN_PERMISSIONS` (`packages/shared/src/enums.ts`) and used by both the API and the console.

## Screens and files

| File | What it does |
|---|---|
| `index.html` | Page shell, fonts, `noindex` |
| `vite.config.ts` | Port 3000, `/v1` proxy to the API (`WASLA_API_ORIGIN`, default `http://localhost:4000`), shared-package alias |
| `src/main.tsx` | React root and `QueryClient` (no retries on 4xx) |
| `src/App.tsx` | **`App`** — checks the session (`/admin/auth/me`), shows `Login` or the sidebar layout; sidebar lists only sections the role may open; sign out |
| `src/api.ts` | **`call()`** — same-origin fetch with the cookie, English errors, CSRF header on changes; on 401 returns to sign-in. **`adminApi`** — one function per endpoint |
| `src/ui.tsx` | **`useRoute`**, **`go`**, date/money formatting in Cairo time, **`Icon`**, **`Logo`**, **`Tag`** (status colours), **`ErrorBox`**, **`Card`**, **`Pager`**, **`SearchBox`** (debounced), **`ReasonAction`** (asks for a reason before suspending, reinstating or cancelling) |
| `src/styles.css` | Tokens and classes copied from the Admin design board |
| `src/pages/Login.tsx` | Email and password form |
| `src/pages/Overview.tsx` | Upcoming rides, bookings today, users, open reports (red when any are urgent), suspended accounts, urgent reports table, bookings per day for 7 days |
| `src/pages/Users.tsx` | **`UsersList`** (search by name or phone digits, status filter, rating, trips, open reports) and **`UserDetail`** (account, cars, reports against and filed, ratings with comments, recent rides and bookings, suspend/reinstate with reason) |
| `src/pages/Rides.tsx` | **`RidesList`** (search by place, status filter) and **`RideDetail`** (driver, car and plate, seats, bookings, cancel with reason) |
| `src/pages/Reports.tsx` | **`ReportsList`** (filters including "urgent") and **`ReportDetail`** (details, trip, internal note, start review / resolve / dismiss / reopen, the booking's chat for allowed roles) |
| `src/pages/Audit.tsx` | **`Audit`** — the append-only log, filter by action prefix and entity type |

## Design board sections not built yet

Verification queue, vehicles review, live rides map, refunds, payments, fraud and risk signals,
promotions and analytics. Each depends on later work (document uploads, payments, maps). They are
left out of the sidebar rather than shown as empty buttons.

## Production notes

- Serve the built `dist/` and the API under **one domain** (e.g. `ops.wasla.app` with `/v1` proxied to
  the API). The cookie then stays first-party and no CORS is involved.
- Restrict access at the network level too (VPN or IP allow-list) — the console is for staff only.
- `NODE_ENV=production` adds `Secure` to the cookie, so the console must be served over HTTPS.
