# 10. Development log — problems and how they were solved

A record of every significant problem hit while building Wasla, in roughly the order it happened. Kept
so the next person doesn't lose time on the same things.

## Environment and tooling

### Design wasn't ready for code on its own
**Problem:** The design canvas (13 boards plus a clickable prototype) showed screens but not the
decisions code needs. **Resolution:** Phase 1 produced a stack proposal, business rules, a data model and
a tokens file before any code was written. Tokens were copied from the "Design system & tokens" board
into `packages/shared/src/tokens.ts`.

### Disk full (0 MB free)
**Problem:** Installs and Docker started failing; several background processes hung. **Cause:** The
system drive was completely full. **Resolution:** Stopped the hung processes, measured folder sizes,
and (with the owner's approval) emptied the Recycle Bin and cleared the npm cache, freeing about 50 GB.
**Lesson:** Check free space before a large install; Docker and `node_modules` for an Expo monorepo need
several GB.

### `corepack` refused to run pnpm
**Problem:** `corepack pnpm` failed with a signature key-id error on Node 20.15. **Cause:** That Node's
bundled corepack has outdated signing keys. **Resolution:** Run a pinned version with strict checks off:
`COREPACK_ENABLE_STRICT=0 corepack pnpm@9.15.0 …`, or install pnpm globally (`npm i -g pnpm@9.15.0`).
Upgrading Node to 22 also fixes it.

### Install took about 33 minutes; Prisma engines failed to download
**Problem:** `pnpm install` repeatedly hit `ECONNRESET`, including in Prisma's postinstall that downloads
its query engine. **Resolution:** Retried with output logged to a file until it completed. Nothing in the
code needed to change.

### Expo SDK 58 needs Node 22.13+, the machine has Node 20.15
**Problem:** The current Expo SDK requires Node ≥ 22.13. **Decision:** Keep SDK 58 anyway, because Expo
Go (the app testers install from the stores) only supports the latest SDK. **Status:** Type checking and
the Android production bundle work on Node 20; running the dev server on a phone needs Node 22.13+.
`.nvmrc` says 22.

### Metro and pnpm's symlinked `node_modules`
**Problem:** React Native's bundler and some Expo native modules don't resolve pnpm's default symlinked
layout. **Resolution:** `.npmrc` → `node-linker=hoisted`.

### Docker engine stuck, then stopped, then auto-updating
**Problem 1:** `docker ps` timed out and dozens of `docker`/`docker-compose` processes were hung (left
over from the disk-full episode). **Resolution:** Asked the owner to restart Docker Desktop rather than
killing it, because another project's database container runs there.
**Problem 2:** Later Docker Desktop was fully stopped (no engine pipe). **Resolution:** Started Docker
Desktop and waited for the engine.
**Problem 3:** Mid-test-run, Docker Desktop installed an update and the engine disappeared for about a
minute, so tests failed with "can't reach database". **Resolution:** Waited for the engine and re-ran.
**Lesson:** "Can't reach localhost:5432" during tests is usually Docker, not the code: check `docker ps`.

### MinIO image no longer on Docker Hub
**Problem:** `docker compose up` failed with `pull access denied for minio/minio`, which stopped *all*
services from starting. **Cause:** MinIO stopped publishing that image. **Resolution:** File storage
isn't used until Phase 4B, so MinIO now sits behind a Compose profile and only starts with
`docker compose --profile storage up -d`. **To do in Phase 4B:** pick a maintained image or a hosted
S3-compatible service (placeholders already in `.env`).

## API

### 20 type errors after the first install
**Cause:** The Prisma client hadn't been generated (the engine download had failed). **Resolution:**
`npx prisma generate`. If types for models are "missing", that's the first thing to try.

### Jest couldn't find setup files; unit and e2e tests mixed
**Resolution:** Created `test/setup-env.ts` and split `jest.config.js` into two projects: `unit`
(`src/**/*.spec.ts`, no database) and `e2e` (`test/**/*.e2e-spec.ts`, with a global setup that prepares
the database).

### Rate limiting would break end-to-end tests
**Problem:** All test requests come from one IP, so the per-IP throttler would start returning 429.
**Resolution:** `skipIf: () => NODE_ENV === 'test'` on the throttler. Per-phone OTP limits live in the
database and are still tested.

### Arabic display names came out wrong
**Problem:** "نور السيد" became "نور ا." because the family name starts with the article "ال".
**Resolution:** `displayNameOf()` skips "ال" and uses the next letter: "نور س.".

### "Smart Village B2" found nothing
**Problem:** Location search matched only the whole phrase in order, so it missed "Smart Village —
Building B2". Caught by an end-to-end test. **Resolution:** Every word of the query must appear somewhere
in the names or aliases, in any order; exact phrase matches still rank first.

### `prisma migrate diff` needed a shadow database
**Problem:** Generating the Phase 3 migration with `--from-migrations` failed: database `wasla_shadow`
doesn't exist. **Resolution:** Diff from the already-migrated dev database instead
(`--from-url postgresql://…/wasla --to-schema-datamodel prisma/schema.prisma --script`), then append
the hand-written constraints. Alternative: create a `wasla_shadow` database.

### Circular import between users and rides
**Problem:** The ride mapper imported `displayNameOf` from the users service, and the users service
imported `completedCounts` from the ride mapper. **Resolution:** Moved `displayNameOf` into its own file,
`src/users/display-name.ts`.

### Two retries of the same booking: the second said "already booked"
**Problem:** Two requests with the same `Idempotency-Key` arrived together. Both found no earlier booking;
one took the ride lock and booked; the other waited, then saw the active booking and returned
`BOOKING_ALREADY_EXISTS` instead of the original booking. Caught by an end-to-end test. **Resolution:**
Check the key again *after* taking the lock and return the existing booking (200). Verified by running
the suite three times in a row.

### Test data piling up between runs
**Problem 1:** Random-looking plates in tests could collide with plates left by earlier runs.
**Resolution:** Fully random plates (28³ × 9000 combinations).
**Problem 2:** After many runs, more than 50 rides existed on the same route and day, so a newly
published ride fell outside the 50-result search limit and a test failed. **Resolution:** The e2e global
setup now truncates all user data before each run (and refuses any database not named `*_test`). The
dev database was checked to be untouched. `prisma db execute --stdin` needed `--schema prisma/schema.prisma`.

### Notifications that could disagree with reality
**Design decision rather than a bug:** Notifications are inserted in the same transaction as the event
(`NotificationsService.create(tx, …)`), and push is sent only after commit (`dispatch`). A rolled-back
booking never produces a notification, and a failed push never undoes a booking.

## Mobile

### Navigation during render
**Problem:** The role step called `router.replace` while rendering when reached directly. **Resolution:**
Return `<Redirect>` instead.

### Phone number reversed inside Arabic text
**Problem:** "We sent a code to +20 10 •••• 5678" rendered with the number scrambled inside Arabic.
**Resolution:** Wrap the number in Unicode isolates (U+2066 … U+2069) so it stays left-to-right. The code
boxes and phone input are always laid out left-to-right.

### React Native 0.88 type changes (9 errors)
**Problem:** Text input refs and tab icon colours no longer typechecked. **Resolution:** Refs use
`TextInputInstance` (the shared `Field` forwards it); icon colours use `ColorValue`.

### List footer types
**Problem:** `ListFooterComponent={cond ? <X/> : null}` failed to typecheck. **Resolution:** Use
`undefined` instead of `null`.

### Non-screen exports in route files
**Problem:** Expo Router treats files under `app/` as routes; exporting helpers (query keys, hooks) from
them is fragile. **Resolution:** Moved them to `src/` (`useNotificationText`, etc.) or made them local.

### Changing language needs a restart
React Native applies a new layout direction only on a fresh start, so `setLanguage()` reloads the app
(`expo-updates`, falling back to `DevSettings.reload()`). Documented in the README.

## Manual testing

### Arabic text turning into `???` in a manual test
**Problem:** A booking note sent with `curl -d '{"pickupNote":"عند البوابة"}'` was stored as `??? ???????`.
**Cause:** On Windows, the shell converted the Arabic argument to the console code page before curl sent
it; the database received literal `?` bytes. **Check:** The same request from Node (`fetch`, UTF-8)
round-tripped perfectly. **Lesson:** On Windows, send non-ASCII JSON from a UTF-8 file
(`--data-binary @body.json`).

### "Code expired" when logging in again quickly
Signing in twice within 45 seconds hits the resend cooldown, so no new code is created and the old one is
already used. Working as designed; wait 45 s or use another test account.

### Loose test assertions
Two assertions in the first draft of the messaging tests could never fail (`… || true`). They were
replaced with exact checks (push bodies `['one','two']`, Arabic title text) before the suite was accepted.

## Repository

### Empty GitHub repository and no GitHub CLI
The remote had no branches, and `gh` isn't installed on the development machine. See the PR description
for how the branch was published.

### Line-ending warnings
Git warns "LF will be replaced by CRLF" on Windows. Harmless, but a `.gitattributes` with
`* text=auto eol=lf` is recommended so every machine commits the same line endings.
