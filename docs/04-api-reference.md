# 4. API reference

Base URL: `http://localhost:4000/v1` locally. Interactive docs (Swagger) at `http://localhost:4000/docs`
outside production.

## Conventions

- **Auth:** every route needs `Authorization: Bearer <accessToken>` unless marked **public**.
- **Language:** send `Accept-Language: ar` or `en` (default `ar`). Only error messages change; data is
  the same.
- **Bodies** are JSON. Unknown fields are silently dropped (so a client can't slip in `roles`).
- **Times** are ISO 8601 UTC strings. Search `date` is a `YYYY-MM-DD` day in Egypt.
- **Money** is integer piasters: `pricePerSeatPiasters: 4500` = 45 EGP. Drivers *send* whole pounds
  (`pricePerSeatEgp: 45`).
- **Ids** are UUIDs. A malformed id returns 404, same as a missing one.
- **Errors** always look like:

```json
{
  "error": {
    "code": "BOOKING_NOT_ENOUGH_SEATS",
    "message": "مفيش كراسي كفاية في الرحلة دي.",
    "fields": { "seats": "BOOKING_SEATS_LIMIT" },
    "requestId": "9e3894d2-…"
  }
}
```

`fields` appears on validation errors; extra keys appear for some codes (`resendAfter` on
`AUTH_OTP_COOLDOWN`). Apps must branch on `code`. The full list of codes with both languages is in
`packages/shared/src/errors.ts`.

- **Rate limits:** 120 requests/minute per IP overall, tighter where noted. Exceeding returns 429
  `RATE_LIMITED`.

## Health

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/health` | public | `{ status: "ok", database: "ok" }` (checks the database connection) |

## Auth (`src/auth/auth.controller.ts`)

| Method | Path | Auth | Body | Returns | Notes |
|---|---|---|---|---|---|
| POST | `/auth/otp/request` | public, 5/min | `{ phone, locale? }` | `{ resendAfter: 45, expiresIn: 300 }` | Any Egyptian format: `01012345678`, `+20 10…`, Arabic digits. Errors: `AUTH_INVALID_PHONE`, `AUTH_OTP_COOLDOWN` (429, with `resendAfter`), `AUTH_OTP_RATE_LIMITED` (5/hour), `AUTH_OTP_SEND_FAILED` (502) |
| POST | `/auth/otp/verify` | public, 10/min | `{ phone, code, deviceName? }` | `{ accessToken, accessTokenExpiresIn, refreshToken, user: MeDto, isNewUser }` | Creates the account on first login. Errors: `AUTH_OTP_INVALID`, `AUTH_OTP_EXPIRED`, `AUTH_OTP_TOO_MANY_ATTEMPTS`, `AUTH_ACCOUNT_SUSPENDED` |
| POST | `/auth/refresh` | public, 30/min | `{ refreshToken }` | `{ accessToken, accessTokenExpiresIn, refreshToken }` | Single use. Reusing an old token revokes the whole login (`AUTH_SESSION_REVOKED`) |
| POST | `/auth/logout` | yes | — | 204 | Revokes this login's session family |

## Me, profile, roles (`src/users/users.controller.ts`)

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/me` | — | `MeDto` | Phone and birth date are only ever returned here, to the owner. `stats.ridesCompleted` counts completed trips as driver or passenger |
| POST | `/me/profile` | `{ fullName, dateOfBirth: "YYYY-MM-DD", gender, preferences?, wantsToDrive? }` | `MeDto` | 18+ only (`PROFILE_UNDERAGE`); once (`PROFILE_ALREADY_EXISTS`). `wantsToDrive` adds the DRIVER role |
| PATCH | `/me/profile` | any of `{ fullName, bio, preferences, showGender, showFullLastName, locale }` | `MeDto` | Birth date and gender can't be changed here |
| POST | `/me/roles/driver` | — | `MeDto` | Turns on driving (`PROFILE_REQUIRED` first) |
| PUT | `/me/active-role` | `{ role }` | `MeDto` | `ROLE_NOT_GRANTED` (403) if the user doesn't hold the role |

## Places (`src/locations/locations.controller.ts`)

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| GET | `/locations/search` | `?q=&kinds=GATE,MALL&limit=15` | `LocationDto[]` | Arabic or English; every word must match; ignores hamza forms, taa marbuta, harakat, Arabic-Indic digits; matches aliases ("CFC", "AUC") |
| GET | `/locations/:id` | — | `LocationDto` | |
| GET | `/me/saved-locations` | — | `SavedLocationDto[]` | |
| POST | `/me/saved-locations` | `{ label: HOME\|WORK\|OTHER, locationId? \| lat+lng, customName?, pickupNote? }` | `SavedLocationDto` | HOME/WORK replace the previous one; OTHER needs `customName`. Coordinates must be inside Egypt |
| DELETE | `/me/saved-locations/:id` | — | 204 | Owner only (others get 404) |

## Cars (`VehiclesController` in `src/rides/rides.controller.ts`)

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/me/vehicles` | — | `VehicleDto[]` | Active cars, plate included (owner) |
| POST | `/me/vehicles` | `{ make, model, color, year, seats (1–6), plateLetters, plateDigits }` | `VehicleDto` | Driver role required (`DRIVER_ROLE_REQUIRED`). Plate: up to 3 Arabic letters, 1–4 digits (Arabic digits accepted). `VEHICLE_PLATE_TAKEN` (409) |
| PUT | `/me/vehicles/:id` | same as POST | `VehicleDto` | Can't drop seats below what an upcoming ride offers (`VEHICLE_IN_USE`) |
| DELETE | `/me/vehicles/:id` | — | 204 | Soft delete; refused while it has scheduled rides |

## Rides (`RidesController`)

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| GET | `/rides/search` | `?fromLocationId \| fromLat+fromLng`, `toLocationId \| toLat+toLng`, `date=YYYY-MM-DD`, `seats=1`, `radiusKm=5` (1–25) | `{ rides: RideSummaryDto[], from, to }` | Up to 50, by departure time then closeness. Each ride has `match.pickupKm/dropoffKm`. Hides full, past, own, suspended drivers' and (for non-women) women-only rides |
| POST | `/rides` | `{ vehicleId, origin, destination, departureAt, seats, pricePerSeatEgp, bookingMode?, womenOnly?, notes?, preferences? }` | `RideDetailDto` (201) | 20/min. `origin`/`destination` = `{ locationId }` or `{ lat, lng, label }`. See [rules](05-business-rules-and-security.md#publishing-a-ride) for every check |
| GET | `/rides/:id` | — | `RideDetailDto` | Open rides: anyone signed in. Closed rides: only the driver and people who booked. The driver also gets `bookings[]` |
| PATCH | `/rides/:id` | any of `{ seats, pricePerSeatEgp, departureAt, notes }` | `RideDetailDto` | Driver only. Time and price locked once anyone booked (`RIDE_HAS_BOOKINGS`) |
| POST | `/rides/:id/cancel` | `{ reason? }` | `RideDetailDto` | Cancels all active bookings and notifies passengers |
| POST | `/rides/:id/complete` | — | `RideDetailDto` | After departure only (`RIDE_NOT_DEPARTED`) |
| GET | `/me/rides` | `?scope=upcoming\|past` | `RideSummaryDto[]` | Driver's own rides. Upcoming = still `SCHEDULED` |

## Bookings

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| POST | `/rides/:id/bookings` | `{ seats (1–4), pickupNote? }`, header `Idempotency-Key` (optional, 8–64 of `A-Za-z0-9_-`) | `BookingDto` — **201** new, **200** replay of the same key | 30/min. Errors: `BOOKING_OWN_RIDE`, `BOOKING_WOMEN_ONLY`, `BOOKING_ALREADY_EXISTS`, `BOOKING_NOT_ENOUGH_SEATS`, `RIDE_NOT_SCHEDULED`, `RIDE_ALREADY_DEPARTED`, `IDEMPOTENCY_KEY_REUSED` (422) |
| GET | `/me/bookings` | `?scope=upcoming\|past` | `BookingDto[]` | Upcoming = holding seats on an open ride |
| GET | `/bookings/:id` | — | `BookingDto` | Passenger or the ride's driver |
| POST | `/bookings/:id/cancel` | `{ reason? }` | `BookingDto` | Passenger, before departure (`BOOKING_NOT_CANCELLABLE`) |
| POST | `/bookings/:id/accept` | — | `BookingDto` | Driver of that ride; pending and not expired (`BOOKING_NOT_PENDING`) |
| POST | `/bookings/:id/decline` | — | `BookingDto` | Same; seats return to the ride |

## Chat (`src/chat/chat.controller.ts`)

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| GET | `/me/conversations` | — | `ConversationDto[]` | Active bookings and any with messages, newest activity first, with unread counts |
| GET | `/me/conversations/unread-count` | — | `{ unreadCount }` | For the tab badge |
| GET | `/bookings/:id/messages` | `?before=<messageId>` or `?after=<messageId>` | `{ items (oldest first), open, otherReadAt }` | 50 per page. `after` is for polling new messages. Only the driver and that passenger (others get 404) |
| POST | `/bookings/:id/messages` | `{ body }` | `MessageDto` (201) | 30/min. Trimmed, control characters removed, 1–1000 chars. `CHAT_CLOSED` (409) after cancellation or 24 h after departure |
| POST | `/bookings/:id/messages/read` | — | 204 | Marks the thread read for the caller |

## Notifications (`src/notifications/notifications.controller.ts`)

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| GET | `/me/notifications` | `?before=<notificationId>` | `{ items, unreadCount, nextBefore }` | 30 per page, newest first |
| GET | `/me/notifications/unread-count` | — | `{ unreadCount }` | |
| POST | `/me/notifications/read` | `{ ids: [...] }` or `{ all: true }` | `{ unreadCount }` | Only the caller's own notifications are touched |
| POST | `/me/push-devices` | `{ token: "ExponentPushToken[…]", platform: ios\|android }` | 204 | Re-registering moves a token to the current user |
| DELETE | `/me/push-devices` | `{ token }` | 204 | Call on logout |

## Ratings, reports and blocking (`src/trust/trust.controller.ts`)

| Method | Path | Input | Returns | Notes |
|---|---|---|---|---|
| GET | `/bookings/:id/rating` | — | `RatingStatusDto` | Who you'd rate, `canRate`, deadline, your rating. Booking parties only |
| POST | `/bookings/:id/rating` | `{ stars (1–5), tags?, comment? }` | `RatingDto` (201) | 20/min. `RATING_NOT_ALLOWED` before completion, `RATING_WINDOW_CLOSED` after 14 days, `RATING_ALREADY_EXISTS`, `RATING_TAG_NOT_ALLOWED` (driving tags on a passenger) |
| POST | `/reports` | `{ bookingId, reportedUserId, reason, details?, block? }` | `ReportDto` (201) | 10/min, 10/day. `REPORT_NOT_ALLOWED` unless both shared that booking; `REPORT_ALREADY_OPEN`. `block: true` also blocks |
| GET | `/me/reports` | — | `ReportDto[]` | Reports you filed |
| GET | `/me/blocks` | — | `BlockedUserDto[]` | Only people *you* blocked |
| POST | `/me/blocks` | `{ userId }` | 204 | Idempotent; ends bookings between you on rides that haven't left. `BLOCK_SELF` |
| DELETE | `/me/blocks/:userId` | — | 204 | |

## Admin console (`src/admin/admin.controller.ts`)

Authenticated by the `wasla_admin` cookie, not a bearer token. Every request that changes data must
send `X-Wasla-Admin: 1` (`ADMIN_CSRF` otherwise). Each route needs a permission
([roles](12-admin-console.md#roles)); `ADMIN_FORBIDDEN` otherwise. Hidden from Swagger.

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/admin/auth/login` | — | `{ email, password }` → `AdminMeDto` + cookie. 5/min. `ADMIN_LOGIN_FAILED`, `ADMIN_LOCKED` |
| POST | `/admin/auth/logout` | signed in | Revokes the session, clears the cookie |
| GET | `/admin/auth/me` | signed in | `AdminMeDto` |
| GET | `/admin/overview` | viewOverview | Counts and 7-day bookings |
| GET | `/admin/users` | viewUsers | `?q=&status=&page=` — name or phone digits; phone masked unless viewUserContact |
| GET | `/admin/users/:id` | viewUsers | Account, cars, ratings with comments, reports, recent rides and bookings (audited) |
| POST | `/admin/users/:id/suspend` | suspendUsers | `{ reason }` — signs out, cancels rides and bookings |
| POST | `/admin/users/:id/reinstate` | suspendUsers | `{ reason }` |
| GET | `/admin/rides` | viewRides | `?q=&status=&page=` |
| GET | `/admin/rides/:id` | viewRides | With car, plate and bookings |
| POST | `/admin/rides/:id/cancel` | cancelRides | `{ reason }` — passengers notified |
| GET | `/admin/reports` | viewReports | `?status=urgent|OPEN|…&page=` — open first |
| GET | `/admin/reports/:id` | viewReports | With the trip and (viewReportChat) its chat — audited |
| PATCH | `/admin/reports/:id` | handleReports | `{ status?, adminNote? }` |
| GET | `/admin/audit` | viewAudit | `?q=<action prefix>&status=<entity type>&page=` |

## Main response shapes

Defined in `packages/shared/src/api-types.ts`:

- **`MeDto`** `{ id, phone, locale, roles, activeRole, status, createdAt, profile: ProfileDto|null, stats }`
- **`ProfileDto`** `{ fullName, displayName, dateOfBirth, gender, bio, photoUrl, preferences, showGender, showFullLastName }`
- **`PublicUserDto`** `{ id, displayName, gender|null, memberSince, ridesCompleted, ratingAverage|null, ratingCount }` — what *other* people see; the average appears from 3 ratings
- **`VehicleDto`** `{ id, make, model, color, year, seats, plate|null }` — `plate` only for the owner and confirmed passengers
- **`RideSummaryDto`** `{ id, status, departureAt, origin, destination, distanceKm, pricePerSeatPiasters, currency, seatsTotal, seatsAvailable, bookingMode, womenOnly, driver, vehicle, match? }`
- **`RideDetailDto`** = summary + `{ notes, preferences, priceLimits, isMine, myBooking, bookings (driver only), cancelReason }`
- **`BookingDto`** `{ id, rideId, status, seats, pricePerSeatPiasters, totalPiasters, paymentMethod, pickupNote, expiresAt, createdAt, ride }`
- **`NotificationDto`** `{ id, type, rideId, bookingId, data: { name, fromEn, fromAr, toEn, toAr, departureAt }, readAt, createdAt }`
- **`MessageDto`** `{ id, bookingId, senderId, mine, body, createdAt }`
- **`ConversationDto`** `{ bookingId, bookingStatus, open, role, other, ride, lastMessage, unreadCount }`

## Example: search and book

```bash
curl "http://localhost:4000/v1/rides/search?fromLocationId=<B2 id>&toLocationId=<CFC id>&date=2026-11-19" \
  -H "Authorization: Bearer $TOKEN" -H "Accept-Language: en"
```

```bash
curl -X POST http://localhost:4000/v1/rides/<rideId>/bookings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: m-lx3k9a-4f8s0d2k1q" \
  -d '{"seats":2,"pickupNote":"By the blue gate"}'
```

On Windows, send Arabic text from a UTF-8 file (`--data-binary @body.json`) rather than inline:
the shell can turn it into `???` before curl sends it (see the [development log](10-development-log.md#arabic-text-turning-into--in-a-manual-test)).
