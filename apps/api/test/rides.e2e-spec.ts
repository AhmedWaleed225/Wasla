import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { BookingsService } from '../src/rides/bookings.service';
import { createApp, loginWithProfile } from './helpers';

const HOUR = 3_600_000;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
/** The Egyptian calendar day of a moment, as the API's search expects it. */
const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);

// The test database keeps data between runs, so plates are random (28³ × 9000 combinations).
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const pick = () => ARABIC[Math.floor(Math.random() * ARABIC.length)]!;
const randomPlate = () => ({
  plateLetters: `${pick()} ${pick()} ${pick()}`,
  plateDigits: String(1000 + Math.floor(Math.random() * 9000)),
});

describe('Vehicles, rides and bookings (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  const place: Record<string, string> = {};

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    server = app.getHttpServer();
    const slugs = ['giza.smart-village.b2', 'cairo.new-cairo.cfc.gate-4', 'cairo.rehab.gate-13', 'cairo.rehab.gate-6', 'cairo.downtown.tahrir'];
    for (const s of await prisma.location.findMany({ where: { slug: { in: slugs } } })) place[s.slug] = s.id;
  });
  afterAll(() => app.close());

  async function driver(gender: 'FEMALE' | 'MALE' = 'MALE', seats = 4) {
    const s = await loginWithProfile(app, { gender, fullName: 'Driver Test' });
    await request(server).post('/v1/me/roles/driver').set(auth(s.accessToken)).expect(201);
    const v = await request(server)
      .post('/v1/me/vehicles')
      .set(auth(s.accessToken))
      .send({ make: 'Hyundai', model: 'Elantra', color: 'Silver', year: 2019, seats, ...randomPlate() })
      .expect(201);
    return { ...s, vehicleId: v.body.id as string };
  }

  const passenger = (gender: 'FEMALE' | 'MALE' = 'FEMALE') => loginWithProfile(app, { gender });

  function rideBody(vehicleId: string, overrides: Record<string, unknown> = {}) {
    return {
      vehicleId,
      origin: { locationId: place['giza.smart-village.b2'] },
      destination: { locationId: place['cairo.new-cairo.cfc.gate-4'] },
      departureAt: new Date(Date.now() + 26 * HOUR).toISOString(),
      seats: 3,
      pricePerSeatEgp: 60,
      ...overrides,
    };
  }

  async function publish(d: { accessToken: string; vehicleId: string }, overrides: Record<string, unknown> = {}) {
    const res = await request(server).post('/v1/rides').set(auth(d.accessToken)).send(rideBody(d.vehicleId, overrides)).expect(201);
    return res.body as { id: string; departureAt: string; seatsAvailable: number };
  }

  const book = (token: string, rideId: string, body: Record<string, unknown> = {}, key?: string) => {
    const r = request(server).post(`/v1/rides/${rideId}/bookings`).set(auth(token));
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  };

  const seatsLeft = async (rideId: string) =>
    (await prisma.ride.findUniqueOrThrow({ where: { id: rideId }, select: { seatsAvailable: true } })).seatsAvailable;

  // ---------- Vehicles ----------

  it('only drivers can add cars; plates are validated, normalised and unique', async () => {
    const p = await passenger();
    const body = { make: 'Kia', model: 'Cerato', color: 'White', year: 2020, seats: 4, plateLetters: 'ط ق ل', plateDigits: '٧٣٢١' };
    const notDriver = await request(server).post('/v1/me/vehicles').set(auth(p.accessToken)).send(body).expect(403);
    expect(notDriver.body.error.code).toBe('DRIVER_ROLE_REQUIRED');

    await request(server).post('/v1/me/roles/driver').set(auth(p.accessToken)).expect(201);
    const bad = await request(server)
      .post('/v1/me/vehicles')
      .set(auth(p.accessToken))
      .send({ ...body, plateLetters: 'ABC' })
      .expect(400);
    expect(bad.body.error.code).toBe('VEHICLE_PLATE_FORMAT');

    const ok = await request(server)
      .post('/v1/me/vehicles')
      .set(auth(p.accessToken))
      .send({ ...body, plateLetters: 'طقل' })
      .expect(201);
    expect(ok.body.plate).toBe('ط ق ل 7321'); // letters spaced, Arabic-Indic digits converted

    const other = await driver();
    const dup = await request(server).post('/v1/me/vehicles').set(auth(other.accessToken)).send(body).expect(409);
    expect(dup.body.error.code).toBe('VEHICLE_PLATE_TAKEN');
    await prisma.vehicle.update({ where: { id: ok.body.id }, data: { isActive: false } }); // free the plate for re-runs
  });

  // ---------- Publishing rules ----------

  it('enforces publishing rules on the server', async () => {
    const d = await driver('MALE', 3);
    const post = (o: Record<string, unknown>) => request(server).post('/v1/rides').set(auth(d.accessToken)).send(rideBody(d.vehicleId, o));
    const code = async (o: Record<string, unknown>, status: number) => (await post(o).expect(status)).body.error.code;

    expect(await code({ departureAt: new Date(Date.now() + 10 * 60_000).toISOString() }, 400)).toBe('RIDE_DEPARTURE_TOO_SOON');
    expect(await code({ departureAt: new Date(Date.now() + 40 * 24 * HOUR).toISOString() }, 400)).toBe('RIDE_DEPARTURE_TOO_FAR');
    expect(await code({ seats: 4 }, 400)).toBe('RIDE_SEATS_EXCEED_VEHICLE');
    expect(await code({ pricePerSeatEgp: 500 }, 400)).toBe('RIDE_PRICE_TOO_HIGH');
    expect(await code({ pricePerSeatEgp: 2 }, 400)).toBe('RIDE_PRICE_TOO_LOW');
    expect(await code({ destination: { locationId: place['giza.smart-village.b2'] } }, 400)).toBe('RIDE_TOO_SHORT');
    expect(await code({ womenOnly: true }, 403)).toBe('RIDE_WOMEN_ONLY_DRIVER');
    expect(await code({ origin: { lat: 30.07, lng: 31.01 } }, 400)).toBe('LOCATION_REQUIRED'); // a pin needs a label

    const other = await driver();
    expect(await code({ vehicleId: other.vehicleId }, 404)).toBe('VEHICLE_NOT_FOUND');

    const first = await publish(d);
    expect(first.seatsAvailable).toBe(3);
    const overlap = await post({ departureAt: new Date(new Date(first.departureAt).getTime() + 30 * 60_000).toISOString() }).expect(409);
    expect(overlap.body.error.code).toBe('RIDE_OVERLAP');

    // Passengers cannot publish, whatever they send.
    const p = await passenger();
    const asPassenger = await request(server).post('/v1/rides').set(auth(p.accessToken)).send(rideBody(d.vehicleId)).expect(403);
    expect(asPassenger.body.error.code).toBe('DRIVER_ROLE_REQUIRED');
  });

  it('accepts a map pin with a label as a pickup point', async () => {
    const d = await driver();
    const ride = await publish(d, { origin: { lat: 30.0721, lng: 31.0158, label: 'Gas station by B2' } });
    const detail = await request(server).get(`/v1/rides/${ride.id}`).set(auth(d.accessToken)).expect(200);
    expect(detail.body.origin).toMatchObject({ locationId: null, nameEn: 'Gas station by B2', lat: 30.0721 });
  });

  // ---------- Search ----------

  it('finds rides near both ends on the right day, hiding own, full and women-only rides', async () => {
    const d = await driver();
    const ride = await publish(d);
    const date = cairoDate(new Date(ride.departureAt));
    const male = await passenger('MALE');

    const byPlace = await request(server)
      .get('/v1/rides/search')
      .query({ fromLocationId: place['giza.smart-village.b2'], toLocationId: place['cairo.new-cairo.cfc.gate-4'], date })
      .set(auth(male.accessToken))
      .expect(200);
    const hit = byPlace.body.rides.find((r: { id: string }) => r.id === ride.id);
    expect(hit).toBeDefined();
    expect(hit.vehicle.plate).toBeNull(); // plate only after a confirmed booking
    expect(hit.driver).not.toHaveProperty('phone');
    expect(hit.driver.displayName).toBe('Driver T.');
    expect(hit.match.pickupKm).toBeLessThan(0.1);

    // ~2 km away from both ends still matches within the default 5 km.
    const nearby = await request(server)
      .get('/v1/rides/search')
      .query({ fromLat: 30.085, fromLng: 31.03, toLat: 30.04, toLng: 31.42, date })
      .set(auth(male.accessToken))
      .expect(200);
    expect(nearby.body.rides.some((r: { id: string }) => r.id === ride.id)).toBe(true);

    // Wrong direction, wrong day, own ride, and too many seats all miss.
    const miss = async (q: Record<string, unknown>, token = male.accessToken) => {
      const res = await request(server).get('/v1/rides/search').query(q).set(auth(token)).expect(200);
      return !res.body.rides.some((r: { id: string }) => r.id === ride.id);
    };
    const base = { fromLocationId: place['giza.smart-village.b2'], toLocationId: place['cairo.new-cairo.cfc.gate-4'], date };
    expect(await miss({ ...base, fromLocationId: base.toLocationId, toLocationId: base.fromLocationId })).toBe(true);
    expect(await miss({ ...base, date: cairoDate(new Date(Date.now() + 5 * 24 * HOUR)) })).toBe(true);
    expect(await miss(base, d.accessToken)).toBe(true);
    expect(await miss({ ...base, seats: 4 })).toBe(true);

    const bad = await request(server).get('/v1/rides/search').query({ date }).set(auth(male.accessToken)).expect(400);
    expect(bad.body.error.code).toBe('SEARCH_PLACE_REQUIRED');

    // Women-only rides: invisible to men, visible to women, and men can't book them directly.
    const woman = await driver('FEMALE');
    const wRide = await publish(woman, { womenOnly: true });
    const wDate = cairoDate(new Date(wRide.departureAt));
    const female = await passenger('FEMALE');
    const forMale = await request(server).get('/v1/rides/search').query({ ...base, date: wDate }).set(auth(male.accessToken)).expect(200);
    expect(forMale.body.rides.some((r: { id: string }) => r.id === wRide.id)).toBe(false);
    const forFemale = await request(server).get('/v1/rides/search').query({ ...base, date: wDate }).set(auth(female.accessToken)).expect(200);
    expect(forFemale.body.rides.some((r: { id: string }) => r.id === wRide.id)).toBe(true);
    const blocked = await book(male.accessToken, wRide.id).expect(403);
    expect(blocked.body.error.code).toBe('BOOKING_WOMEN_ONLY');
    await book(female.accessToken, wRide.id).expect(201);
  });

  // ---------- Booking ----------

  it('books instantly, reveals the plate, and refuses double or own bookings', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();

    const res = await book(p.accessToken, ride.id, { seats: 2, pickupNote: 'Blue gate' }).expect(201);
    expect(res.body).toMatchObject({ status: 'CONFIRMED', seats: 2, pricePerSeatPiasters: 6000, totalPiasters: 12000, paymentMethod: 'CASH' });
    expect(res.body.ride.vehicle.plate).toMatch(/\d+$/);
    expect(await seatsLeft(ride.id)).toBe(1);

    const again = await book(p.accessToken, ride.id).expect(409);
    expect(again.body.error.code).toBe('BOOKING_ALREADY_EXISTS');
    const tooMany = await book((await passenger()).accessToken, ride.id, { seats: 2 }).expect(409);
    expect(tooMany.body.error.code).toBe('BOOKING_NOT_ENOUGH_SEATS');
    const own = await book(d.accessToken, ride.id).expect(403);
    expect(own.body.error.code).toBe('BOOKING_OWN_RIDE');
    const limit = await book(p.accessToken, ride.id, { seats: 5 }).expect(400);
    expect(limit.body.error.code).toBe('BOOKING_SEATS_LIMIT');

    // The driver sees the passenger by display name only.
    const asDriver = await request(server).get(`/v1/rides/${ride.id}`).set(auth(d.accessToken)).expect(200);
    expect(asDriver.body.bookings).toHaveLength(1);
    expect(asDriver.body.bookings[0].passenger.displayName).toBe('Test R.');
    expect(asDriver.body.bookings[0].passenger).not.toHaveProperty('phone');
    expect(asDriver.body.bookings[0].pickupNote).toBe('Blue gate');
  });

  it('never oversells seats when many passengers book at the same moment', async () => {
    const d = await driver('MALE', 3);
    const ride = await publish(d, { seats: 3 });
    const riders = await Promise.all(Array.from({ length: 8 }, () => passenger()));

    const results = await Promise.all(riders.map((r) => book(r.accessToken, ride.id)));
    const ok = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(full).toHaveLength(5);
    expect(full.every((r) => r.body.error.code === 'BOOKING_NOT_ENOUGH_SEATS')).toBe(true);

    expect(await seatsLeft(ride.id)).toBe(0);
    const held = await prisma.booking.aggregate({ where: { rideId: ride.id, status: { in: ['PENDING', 'CONFIRMED'] } }, _sum: { seats: true } });
    expect(held._sum.seats).toBe(3);
  });

  it('gives one booking to a passenger who taps "book" several times at once', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();
    const results = await Promise.all(Array.from({ length: 5 }, () => book(p.accessToken, ride.id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'BOOKING_ALREADY_EXISTS')).toBe(true);
    expect(await seatsLeft(ride.id)).toBe(2);
  });

  it('replays a retried request with the same idempotency key instead of booking twice', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();
    const key = `test-${Date.now()}-abc`;

    const [a, b] = await Promise.all([book(p.accessToken, ride.id, {}, key), book(p.accessToken, ride.id, {}, key)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await seatsLeft(ride.id)).toBe(2);

    const later = await book(p.accessToken, ride.id, {}, key).expect(200);
    expect(later.body.id).toBe(a.body.id);

    const otherRide = await publish(await driver());
    const reused = await book(p.accessToken, otherRide.id, {}, key).expect(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const badKey = await book(p.accessToken, otherRide.id, {}, 'x').expect(400);
    expect(badKey.body.error.code).toBe('IDEMPOTENCY_KEY_FORMAT');
  });

  it('lets a passenger cancel before departure and returns the seats', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();
    const b = await book(p.accessToken, ride.id, { seats: 2 }).expect(201);
    expect(await seatsLeft(ride.id)).toBe(1);

    const cancelled = await request(server).post(`/v1/bookings/${b.body.id}/cancel`).set(auth(p.accessToken)).send({}).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED_BY_PASSENGER');
    expect(await seatsLeft(ride.id)).toBe(3);
    const twice = await request(server).post(`/v1/bookings/${b.body.id}/cancel`).set(auth(p.accessToken)).send({}).expect(409);
    expect(twice.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');

    // Someone else's booking is invisible.
    const stranger = await passenger();
    await request(server).post(`/v1/bookings/${b.body.id}/cancel`).set(auth(stranger.accessToken)).send({}).expect(404);
    await request(server).get(`/v1/bookings/${b.body.id}`).set(auth(stranger.accessToken)).expect(404);

    // Booking again after cancelling is allowed.
    await book(p.accessToken, ride.id).expect(201);
  });

  it('request mode: seats are held while pending; the driver accepts or declines; silence expires', async () => {
    const d = await driver();
    const ride = await publish(d, { bookingMode: 'REQUEST' });
    const [p1, p2, p3] = await Promise.all([passenger(), passenger(), passenger()]);

    const r1 = await book(p1.accessToken, ride.id).expect(201);
    expect(r1.body.status).toBe('PENDING');
    expect(r1.body.expiresAt).not.toBeNull();
    expect(r1.body.ride.vehicle.plate).toBeNull(); // not confirmed yet
    const r2 = await book(p2.accessToken, ride.id).expect(201);
    const r3 = await book(p3.accessToken, ride.id).expect(201);
    expect(await seatsLeft(ride.id)).toBe(0);

    // Only this ride's driver can answer.
    await request(server).post(`/v1/bookings/${r1.body.id}/accept`).set(auth(p2.accessToken)).expect(404);

    const accepted = await request(server).post(`/v1/bookings/${r1.body.id}/accept`).set(auth(d.accessToken)).expect(200);
    expect(accepted.body.status).toBe('CONFIRMED');
    const again = await request(server).post(`/v1/bookings/${r1.body.id}/decline`).set(auth(d.accessToken)).expect(409);
    expect(again.body.error.code).toBe('BOOKING_NOT_PENDING');

    const declined = await request(server).post(`/v1/bookings/${r2.body.id}/decline`).set(auth(d.accessToken)).expect(200);
    expect(declined.body.status).toBe('DECLINED');
    expect(await seatsLeft(ride.id)).toBe(1);

    // The driver doesn't answer the third request in time.
    await prisma.booking.update({ where: { id: r3.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await request(server).post(`/v1/bookings/${r3.body.id}/accept`).set(auth(d.accessToken)).expect(409);
    expect(late.body.error.code).toBe('BOOKING_NOT_PENDING');
    expect(await app.get(BookingsService).expireDue()).toBeGreaterThanOrEqual(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: r3.body.id } })).status).toBe('EXPIRED');
    expect(await seatsLeft(ride.id)).toBe(2);
  });

  // ---------- Driver changes ----------

  it('locks price and time once booked, and never lets seats drop below what is booked', async () => {
    const d = await driver('MALE', 4);
    const ride = await publish(d, { seats: 3 });
    const patch = (body: Record<string, unknown>) => request(server).patch(`/v1/rides/${ride.id}`).set(auth(d.accessToken)).send(body);

    // Before any booking, the price can change.
    expect((await patch({ pricePerSeatEgp: 70 }).expect(200)).body.pricePerSeatPiasters).toBe(7000);

    const p = await passenger();
    await book(p.accessToken, ride.id, { seats: 2 }).expect(201);
    expect((await patch({ pricePerSeatEgp: 80 }).expect(409)).body.error.code).toBe('RIDE_HAS_BOOKINGS');
    expect((await patch({ seats: 1 }).expect(409)).body.error.code).toBe('RIDE_SEATS_BELOW_BOOKED');
    expect((await patch({ seats: 5 }).expect(400)).body.error.code).toBe('RIDE_SEATS_EXCEED_VEHICLE');

    const more = await patch({ seats: 4, notes: 'Leaving from the north side' }).expect(200);
    expect(more.body).toMatchObject({ seatsTotal: 4, seatsAvailable: 2, notes: 'Leaving from the north side' });

    // Someone else can't edit it.
    await request(server).patch(`/v1/rides/${ride.id}`).set(auth(p.accessToken)).send({ seats: 4 }).expect(404);
  });

  it('cancelling a ride cancels its bookings and closes it to new ones', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();
    const b = await book(p.accessToken, ride.id).expect(201);

    const res = await request(server).post(`/v1/rides/${ride.id}/cancel`).set(auth(d.accessToken)).send({ reason: 'Car broke down' }).expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.bookings[0].status).toBe('CANCELLED_BY_DRIVER');

    const mine = await request(server).get(`/v1/bookings/${b.body.id}`).set(auth(p.accessToken)).expect(200);
    expect(mine.body.status).toBe('CANCELLED_BY_DRIVER');
    const late = await book((await passenger()).accessToken, ride.id).expect(409);
    expect(late.body.error.code).toBe('RIDE_NOT_SCHEDULED');

    // Closed rides are visible only to the people involved.
    await request(server).get(`/v1/rides/${ride.id}`).set(auth((await passenger()).accessToken)).expect(404);
    await request(server).get(`/v1/rides/${ride.id}`).set(auth(p.accessToken)).expect(200);

    const past = await request(server).get('/v1/me/bookings?scope=past').set(auth(p.accessToken)).expect(200);
    expect(past.body.some((x: { id: string }) => x.id === b.body.id)).toBe(true);
  });

  it('completes a ride only after departure and counts the trip for both sides', async () => {
    const d = await driver();
    const ride = await publish(d);
    const p = await passenger();
    const b = await book(p.accessToken, ride.id).expect(201);

    const upcoming = await request(server).get('/v1/me/bookings').set(auth(p.accessToken)).expect(200);
    expect(upcoming.body.map((x: { id: string }) => x.id)).toContain(b.body.id);
    const driverUpcoming = await request(server).get('/v1/me/rides').set(auth(d.accessToken)).expect(200);
    expect(driverUpcoming.body.map((x: { id: string }) => x.id)).toContain(ride.id);

    const early = await request(server).post(`/v1/rides/${ride.id}/complete`).set(auth(d.accessToken)).expect(409);
    expect(early.body.error.code).toBe('RIDE_NOT_DEPARTED');

    // Time passes: the ride has left.
    await prisma.ride.update({ where: { id: ride.id }, data: { departureAt: new Date(Date.now() - HOUR) } });
    const cancelLate = await request(server).post(`/v1/bookings/${b.body.id}/cancel`).set(auth(p.accessToken)).send({}).expect(409);
    expect(cancelLate.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');

    const done = await request(server).post(`/v1/rides/${ride.id}/complete`).set(auth(d.accessToken)).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.bookings[0].status).toBe('COMPLETED');

    const meP = await request(server).get('/v1/me').set(auth(p.accessToken)).expect(200);
    const meD = await request(server).get('/v1/me').set(auth(d.accessToken)).expect(200);
    expect(meP.body.stats.ridesCompleted).toBe(1);
    expect(meD.body.stats.ridesCompleted).toBe(1);
  });
});
