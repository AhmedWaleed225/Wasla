# Wasla (وصلة) — Technical documentation

Wasla is a carpooling platform for Egypt: drivers offer empty seats on trips they already make, and
passengers book them. This folder documents the whole codebase as of **Phase 5, part A**
(foundation, core carpooling, chat and notifications, trust & safety, admin console).

The root [`README.md`](../README.md) is the quick start. These documents go deeper.

| # | Document | What it covers |
|---|---|---|
| 1 | [Tech stack](01-tech-stack.md) | Every technology, its version, why it was chosen, and what was rejected |
| 2 | [Architecture](02-architecture.md) | How the pieces fit: monorepo, request lifecycle, auth, data flow, diagrams |
| 3 | [Database](03-database.md) | Every table and column, constraints, indexes, triggers, migrations, seed data |
| 4 | [API reference](04-api-reference.md) | Every endpoint: method, path, input, output, errors |
| 5 | [Business rules & security](05-business-rules-and-security.md) | Ride, booking, chat and pricing rules; how each is enforced; security model |
| 6 | [Code reference — API](06-code-api.md) | Every API file and the functions/methods in it |
| 7 | [Code reference — mobile app](07-code-mobile.md) | Every screen, component, hook and store |
| 8 | [Code reference — shared package](08-code-shared.md) | Schemas, enums, errors, rules, translations, design tokens |
| 9 | [Testing](09-testing.md) | Test suites, what each test proves, how to run them |
| 10 | [Development log](10-development-log.md) | Every significant problem hit while building, and how it was solved |
| 11 | [Operations & roadmap](11-operations-and-roadmap.md) | Environment variables, provider placeholders, running locally, what's next |
| 12 | [Admin console](12-admin-console.md) | The staff console: running it, security model, roles, every screen and file |

## Status at a glance

| Phase | Scope | State |
|---|---|---|
| 1 | Audit of the design, stack proposal | Done |
| 2 | Foundation: monorepo, auth (phone + OTP), profiles, roles, places, mobile shell | Done |
| 3 | Core carpooling: cars, publishing, search, booking, driver management | Done |
| 4A | Notifications inbox, push adapter, per-booking chat | Done |
| 4B | Real SMS, online payments, maps, file storage, push registration in the app | Not started — needs provider accounts ([placeholders](11-operations-and-roadmap.md#provider-placeholders)) |
| 5A | Ratings, reports, blocking, safety screen, admin console | Done |
| 5B | Driver verification, SOS and trip sharing, staff management | Not started — verification needs file storage |
| 6 | QA, load testing, release | Not started |

## Numbers

- ~180 tracked files; TypeScript everywhere.
- 4 database migrations, 19 tables.
- 64 API endpoints under `/v1` (49 for the app, 15 for the admin console).
- 94 automated tests: 27 shared unit, 9 API unit, 58 API end-to-end (against a real PostgreSQL), run in CI.
- Every user-facing string exists in Arabic and English; Arabic is the default and lays out right-to-left.
