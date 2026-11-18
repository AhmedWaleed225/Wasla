# 5. Business rules and security

Every rule here is enforced by the API. The app uses the same numbers only to guide input (for example
to show the suggested price); it never decides anything on its own. Numbers live in
[`packages/shared/src/rides.ts`](../packages/shared/src/rides.ts) and
[`schemas.ts`](../packages/shared/src/schemas.ts), so changing one value changes both sides.

## Accounts

| Rule | Where |
|---|---|
| Sign-in is by Egyptian mobile number (010, 011, 012, 015) plus a 6-digit SMS code | `phone.ts`, `otp.service.ts` |
| Codes last 5 minutes; a new one can be requested after 45 s; at most 5 per hour per number; 5 wrong tries lock the code | `OTP_RULES` in `otp.service.ts` |
| Only the newest code works; requesting a new one expires older ones | `OtpService.request` |
| Users must be 18–100 | `dateOfBirthSchema` |
| Everyone is a passenger; driving is an extra role switched on by the user, recorded in the audit log | `UsersService.enableDriving`; DB check |
| The app can only *switch* between roles the user holds | `UsersService.setActiveRole` → `ROLE_NOT_GRANTED` |
| Suspended users are blocked on their next request, not when their token expires | `AuthGuard` |

## Privacy

| Data | Who can see it |
|---|---|
| Phone number | Only the owner (`GET /me`). Never in rides, bookings, chat, notifications or push |
| Full name | Only the owner. Others see `displayNameOf()`: "Nour E." / "نور س." unless the user opts to show the full last name |
| Birth date | Only the owner |
| Gender | Only if the user turns on "show gender" (women-only rides use it server-side without exposing it) |
| Car plate | The driver, and passengers with a confirmed or completed booking |
| Closed rides | Only the driver and people who booked them |
| Chat thread | Only the driver and that passenger; other passengers on the same ride can't see it |

## Publishing a ride

`RidesService.create`:

1. User holds the DRIVER role (`DRIVER_ROLE_REQUIRED`) and has a profile.
2. The car is theirs and active (`VEHICLE_NOT_FOUND`); seats ≤ the car's seats (`RIDE_SEATS_EXCEED_VEHICLE`).
3. Departure is at least **30 minutes** and at most **30 days** ahead.
4. Start and end are each a known place with coordinates or a pin with a label; at least **1 km**
   apart (`RIDE_TOO_SHORT`).
5. Price within the [cost-sharing limits](#pricing).
6. **Women-only** rides can only be offered by women (`RIDE_WOMEN_ONLY_DRIVER`).
7. No other scheduled ride by this driver within **±60 minutes** (`RIDE_OVERLAP`). Two parallel publish
   requests are serialised by locking the user row, so both can't slip past this check.
8. Preferences default to the driver's profile, overridable per ride.

## Pricing

Wasla is cost sharing, not a taxi service. Per seat, in whole pounds:

```
roadKm    = straightLineKm × 1.3
max       = max(30, ceil(roadKm × 2))           // EGP
suggested = clamp(round5(roadKm × 0.75), 10, max)
min       = 5
```

Example: Smart Village → Cairo Festival City is ~40 km straight, ~52 road km → suggested 40 EGP, max
104 EGP. Short trips may always charge up to 30 EGP.

**These constants are business assumptions to confirm** (`PRICE_RULES` in `rides.ts`). They're based
on fuel at roughly 2 EGP per km per car.

## Searching

`RidesService.search`: rides on the given **Egyptian calendar day** (`departure_at AT TIME ZONE
'Africa/Cairo'`), still in the future and `SCHEDULED`, with at least the requested seats, start within
`radiusKm` (default 5, max 25) of the searched start **and** end within `radiusKm` of the searched end.
Excludes your own rides, rides by suspended drivers, and women-only rides unless the searcher's profile
is female. Sorted by departure time, then total walking distance; 50 results maximum.

## Booking

`BookingsService.create`:

| Check | Error |
|---|---|
| Ride exists | `RIDE_NOT_FOUND` (404) |
| Not your own ride | `BOOKING_OWN_RIDE` (403) |
| Ride is open and its driver active | `RIDE_NOT_SCHEDULED` (409) |
| Not departed | `RIDE_ALREADY_DEPARTED` (409) |
| Women-only ride needs a female passenger | `BOOKING_WOMEN_ONLY` (403) |
| 1–4 seats | `BOOKING_SEATS_LIMIT` (400) |
| No other active booking by you on this ride | `BOOKING_ALREADY_EXISTS` (409) |
| Enough seats left | `BOOKING_NOT_ENOUGH_SEATS` (409) |

- **Instant** rides confirm immediately. **Request** rides create a `PENDING` booking that **holds the
  seats** until the driver answers, for up to **12 hours** or until departure, whichever is sooner.
- The price is **copied onto the booking**, so later edits never change what a passenger agreed to.
- **Payment is cash** at pickup in this phase. No online payment is simulated.
- **Retries are safe:** the app sends a random `Idempotency-Key` per booking attempt; a repeat with the
  same key returns the original booking (200) instead of booking again. Reusing a key for a different
  ride is rejected (422).

### How overbooking is prevented

1. The booking transaction locks the ride row (`SELECT … FOR UPDATE`), so bookings on one ride run
   one at a time.
2. The seat decrement is conditional: `UPDATE rides SET seats_available = seats_available - n WHERE
   … AND seats_available >= n`. Zero rows updated → `BOOKING_NOT_ENOUGH_SEATS`.
3. A database CHECK forbids negative seats anyway.
4. A partial unique index forbids two active bookings by the same passenger on one ride.

Tested with 8 passengers booking a 3-seat ride at the same instant (exactly 3 succeed) and one
passenger tapping "book" 5 times at once (exactly 1 booking).

## Cancelling, answering, expiring, completing

| Action | Who | Rule | Seats |
|---|---|---|---|
| Cancel booking | Passenger | Booking pending or confirmed, ride not departed | Returned |
| Accept request | That ride's driver | Pending and not past `expires_at` | Stay held |
| Decline request | That ride's driver | Pending | Returned |
| Expire request | System (every minute) | Pending and past `expires_at` | Returned |
| Edit ride | Driver | Open and not departed. Time and price **locked once anyone booked**; seats can't go below what's booked or above the car | Recalculated |
| Cancel ride | Driver | Open | All active bookings → `CANCELLED_BY_DRIVER` |
| Complete ride | Driver | Open and **departed** | Confirmed → `COMPLETED`; pending → `EXPIRED` |

Every one of these writes an audit entry and notifies the other side in the same transaction.

## Chat

- One thread per booking: the ride's driver and that passenger.
- **Open** while the booking is pending, confirmed or completed, the ride isn't cancelled, and until
  **24 hours after departure** (so a forgotten bag can be sorted out). Closed threads stay readable.
- Messages are trimmed, have control characters removed, and are 1–1000 characters. 30 per minute.
- Messages can't be edited (database trigger). There is no delete.
- The app shows a safety note: keep chats on Wasla, never share codes, don't pay outside the agreed fare.

## Notifications

| Event | Who is notified | Type |
|---|---|---|
| Instant booking | Driver | `BOOKING_CONFIRMED` |
| Booking request | Driver | `BOOKING_REQUESTED` |
| Request accepted / declined | Passenger | `BOOKING_ACCEPTED` / `BOOKING_DECLINED` |
| Request lapsed | Passenger | `BOOKING_EXPIRED` |
| Passenger cancelled | Driver | `BOOKING_CANCELLED` |
| Driver cancelled ride | Every passenger still booked | `RIDE_CANCELLED` |
| Driver completed ride | Confirmed passengers | `RIDE_COMPLETED` |
| New chat message | The other person | Push only (shown in the Messages tab, not the inbox) |

## Ratings

- After a trip is **completed**, the passenger rates the driver and the driver rates the passenger:
  1–5 stars, up to 4 tags, optional comment.
- Once per person per trip, within **14 days** of completion.
- Driving tags (safe driving, clean car, unsafe driving) only apply when rating a driver.
- An **average is shown only once someone has 3 ratings**, so a single rating can't be traced to the
  one passenger who left it. The count is always shown.
- Comments are visible to staff only, in the admin console.

## Reports

- You can only report someone you shared a booking with (either side), so reports can't be used to
  harass strangers.
- One open report per person per trip; up to 10 reports a day.
- Safety and harassment reports are flagged **urgent** and listed first for staff.
- The report screen shows the police number (122) for emergencies.
- Staff can read the trip's chat when handling a report; every such view is audited.

## Blocking

- Either person blocking the other hides each other's rides, prevents booking, closes chat between them,
  and cancels active bookings between them on rides that haven't left.
- Neither side is ever told they were blocked: messages are neutral ("ride not available", "your booking
  ended").
- `GET /me/blocks` lists only the people you blocked, never who blocked you.

## Suspension

- Staff (Operations, Super admin) can suspend with a written reason. The user is signed out everywhere,
  their upcoming rides are cancelled (passengers notified) and their active bookings cancelled.
- A suspended user gets "This account is suspended" (403), not a generic "log in again", so they know to
  contact support. Reinstating restores access.

## Security measures

| Area | Measure |
|---|---|
| Secrets | Only in `.env` files (gitignored). Startup validation refuses placeholder secrets and identical JWT/OTP secrets in production |
| Mock OTP | Needs **two** switches (`OTP_PROVIDER=mock` and `OTP_MOCK_ENABLED=true`). The API **refuses to start** with either, or with a fixed code, when `NODE_ENV=production` (unit-tested in `env.spec.ts`) |
| OTP storage | HMAC-SHA256 with a server secret; compared in constant time; attempts counted atomically before comparing |
| Refresh tokens | Random 48 bytes, stored as SHA-256 only, single use, rotation with reuse detection that revokes the whole login |
| Sessions | Checked on every request: logout and suspension are immediate |
| Authorisation | Global guard; roles reloaded from the database; resource checks scope every query by owner (another user's id behaves exactly like a missing one) |
| Input | Zod validation of every body and query; unknown keys stripped; lengths capped; coordinates must be inside Egypt |
| Rate limiting | Global 120/min per IP; OTP 5 and 10/min; refresh 30/min; publish 20/min; booking and chat 30/min. Plus per-phone OTP limits stored in the database |
| Headers | helmet; `trust proxy` for correct client IPs behind a load balancer; CORS limited to `CORS_ORIGINS` |
| Logging | pino with redaction of `Authorization`, cookies, OTP codes, refresh tokens and all response bodies |
| Audit | Append-only `audit_logs` for role changes, publishing, every booking state change, token reuse |
| SQL injection | Prisma parameters everywhere, including raw SQL (tagged templates) |
| Admin console | Separate staff accounts; scrypt passwords; lockout after 5 failures; HttpOnly, SameSite=Strict, path-scoped session cookie; CSRF header on every change; per-route role permissions checked on every request; contact details masked by role; every action audited. See [Admin console](12-admin-console.md) |
| Women-only rides | Enforced in search, booking and publishing, not only hidden in the UI |

## Known gaps (tracked for later phases)

- **No driver verification** (ID, licence, car papers). Anyone with driver mode on can publish. Must be
  in place before public launch (Phase 5).
- **Rate limits are per API instance** (in memory). They move to Redis before running more than one
  instance.
- **No account deletion or data export** yet (needed for privacy compliance).
- **No intermediate stops**; search matches the ride's start and end only.
