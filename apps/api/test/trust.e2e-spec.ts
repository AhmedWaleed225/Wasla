import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bearer, completedBooking, createApp, loginWithProfile, makeDriver, publishRide } from './helpers';

const DAY = 24 * 3_600_000;
const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);

describe('Ratings, reports and blocking (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  const passenger = (fullName = 'Salma Adel') => loginWithProfile(app, { gender: 'FEMALE', fullName });
  const rate = (token: string, bookingId: string, body: Record<string, unknown>) =>
    request(server).post(`/v1/bookings/${bookingId}/rating`).set(bearer(token)).send(body);

  // ---------- Ratings ----------

  it('lets both sides rate a completed trip once, with role-appropriate tags', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();

    // Not before the trip is done.
    const early = await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);
    expect((await rate(p.accessToken, early.body.id, { stars: 5 }).expect(409)).body.error.code).toBe('RATING_NOT_ALLOWED');
    const before = await request(server).get(`/v1/bookings/${early.body.id}/rating`).set(bearer(p.accessToken)).expect(200);
    expect(before.body).toMatchObject({ canRate: false, role: 'driver', mine: null });
    await request(server).post(`/v1/bookings/${early.body.id}/cancel`).set(bearer(p.accessToken)).send({}).expect(200);

    const bookingId = await completedBooking(app, prisma, d, ride.id, p.accessToken);
    const status = await request(server).get(`/v1/bookings/${bookingId}/rating`).set(bearer(p.accessToken)).expect(200);
    expect(status.body).toMatchObject({ canRate: true, role: 'driver', ratee: { displayName: 'Driver T.' } });
    expect(status.body.deadline).not.toBeNull();

    const mine = await rate(p.accessToken, bookingId, { stars: 5, tags: ['SAFE_DRIVING', 'PUNCTUAL', 'PUNCTUAL'], comment: '  Great ride ' }).expect(201);
    expect(mine.body).toMatchObject({ stars: 5, tags: ['SAFE_DRIVING', 'PUNCTUAL'], comment: 'Great ride' });
    expect((await rate(p.accessToken, bookingId, { stars: 4 }).expect(409)).body.error.code).toBe('RATING_ALREADY_EXISTS');

    // A driver can't give a passenger driving tags.
    expect((await rate(d.accessToken, bookingId, { stars: 4, tags: ['CLEAN_CAR'] }).expect(400)).body.error.code).toBe('RATING_TAG_NOT_ALLOWED');
    await rate(d.accessToken, bookingId, { stars: 4, tags: ['RESPECTFUL'] }).expect(201);

    expect((await rate(p.accessToken, bookingId, { stars: 6 }).expect(400)).body.error.code).toBe('RATING_STARS_RANGE');
    const stranger = await passenger();
    await rate(stranger.accessToken, bookingId, { stars: 1 }).expect(404);
    await request(server).get(`/v1/bookings/${bookingId}/rating`).set(bearer(stranger.accessToken)).expect(404);
  });

  it('closes rating after 14 days', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const bookingId = await completedBooking(app, prisma, d, ride.id, p.accessToken);
    await prisma.ride.update({ where: { id: ride.id }, data: { completedAt: new Date(Date.now() - 15 * DAY) } });
    expect((await rate(p.accessToken, bookingId, { stars: 3 }).expect(409)).body.error.code).toBe('RATING_WINDOW_CLOSED');
  });

  it('shows an average only once there are 3 ratings', async () => {
    const d = await makeDriver(app, 'MALE', 4);
    const ride = await publishRide(app, prisma, d, { seats: 3 });
    const riders = await Promise.all([passenger(), passenger(), passenger()]);
    const bookingIds: string[] = [];
    for (const r of riders) {
      bookingIds.push((await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(r.accessToken)).send({}).expect(201)).body.id);
    }
    await prisma.ride.update({ where: { id: ride.id }, data: { departureAt: new Date(Date.now() - 3_600_000) } });
    await request(server).post(`/v1/rides/${ride.id}/complete`).set(bearer(d.accessToken)).expect(200);

    await rate(riders[0]!.accessToken, bookingIds[0]!, { stars: 5 }).expect(201);
    await rate(riders[1]!.accessToken, bookingIds[1]!, { stars: 4 }).expect(201);
    let me = await request(server).get('/v1/me').set(bearer(d.accessToken)).expect(200);
    expect(me.body.stats).toMatchObject({ ratingCount: 2, ratingAverage: null });

    await rate(riders[2]!.accessToken, bookingIds[2]!, { stars: 3 }).expect(201);
    me = await request(server).get('/v1/me').set(bearer(d.accessToken)).expect(200);
    expect(me.body.stats).toMatchObject({ ratingCount: 3, ratingAverage: 4 });

    // Others see it on the driver's public card too.
    const next = await publishRide(app, prisma, d, { departureAt: new Date(Date.now() + 50 * 3_600_000).toISOString() });
    const view = await request(server).get(`/v1/rides/${next.id}`).set(bearer((await passenger()).accessToken)).expect(200);
    expect(view.body.driver).toMatchObject({ ratingAverage: 4, ratingCount: 3 });
  });

  // ---------- Reports ----------

  it('accepts reports only between people who shared a trip, one open report per trip', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const b = await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);
    const stranger = await passenger();
    const report = (token: string, body: Record<string, unknown>) => request(server).post('/v1/reports').set(bearer(token)).send(body);

    const notAllowed = await report(stranger.accessToken, { bookingId: b.body.id, reportedUserId: d.userId, reason: 'HARASSMENT' }).expect(403);
    expect(notAllowed.body.error.code).toBe('REPORT_NOT_ALLOWED');
    await report(p.accessToken, { bookingId: b.body.id, reportedUserId: p.userId, reason: 'OTHER' }).expect(403);

    const ok = await report(p.accessToken, {
      bookingId: b.body.id,
      reportedUserId: d.userId,
      reason: 'INAPPROPRIATE_MESSAGES',
      details: 'Kept asking for my number',
    }).expect(201);
    expect(ok.body).toMatchObject({ reason: 'INAPPROPRIATE_MESSAGES', status: 'OPEN', bookingId: b.body.id });
    const dup = await report(p.accessToken, { bookingId: b.body.id, reportedUserId: d.userId, reason: 'OTHER' }).expect(409);
    expect(dup.body.error.code).toBe('REPORT_ALREADY_OPEN');

    // The driver can report the passenger about the same trip.
    await report(d.accessToken, { bookingId: b.body.id, reportedUserId: p.userId, reason: 'NO_SHOW' }).expect(201);

    const mine = await request(server).get('/v1/me/reports').set(bearer(p.accessToken)).expect(200);
    expect(mine.body.map((r: { id: string }) => r.id)).toEqual([ok.body.id]);
  });

  // ---------- Blocking ----------

  it('blocking hides rides, prevents booking and chat, and cancels bookings between the two', async () => {
    const d = await makeDriver(app, 'MALE', 4);
    const ride = await publishRide(app, prisma, d);
    const later = await publishRide(app, prisma, d, { departureAt: new Date(Date.now() + 52 * 3_600_000).toISOString() });
    const p = await passenger();
    const b = await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({ seats: 2 }).expect(201);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).seatsAvailable).toBe(1);

    await request(server).post('/v1/me/blocks').set(bearer(p.accessToken)).send({ userId: d.userId }).expect(204);
    await request(server).post('/v1/me/blocks').set(bearer(p.accessToken)).send({ userId: d.userId }).expect(204); // idempotent

    // The existing booking ended, seats came back, the driver was told — without the word "blocked".
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.body.id } })).status).toBe('CANCELLED_BY_PASSENGER');
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).seatsAvailable).toBe(3);
    const inbox = await request(server).get('/v1/me/notifications').set(bearer(d.accessToken)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'BOOKING_CANCELLED', bookingId: b.body.id });

    // Search, details and booking all behave as if the ride isn't there — in both directions.
    const [smart, cfc] = await Promise.all([
      prisma.location.findUniqueOrThrow({ where: { slug: 'giza.smart-village.b2' } }),
      prisma.location.findUniqueOrThrow({ where: { slug: 'cairo.new-cairo.cfc.gate-4' } }),
    ]);
    const search = await request(server)
      .get('/v1/rides/search')
      .query({ fromLocationId: smart.id, toLocationId: cfc.id, date: cairoDate(new Date(later.departureAt)) })
      .set(bearer(p.accessToken))
      .expect(200);
    expect(search.body.rides.some((r: { id: string }) => r.id === later.id)).toBe(false);
    await request(server).get(`/v1/rides/${later.id}`).set(bearer(p.accessToken)).expect(404);
    const book = await request(server).post(`/v1/rides/${later.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(403);
    expect(book.body.error.code).toBe('RIDE_NOT_AVAILABLE');

    // The chat from the cancelled booking stays readable but closed.
    const chat = await request(server).get(`/v1/bookings/${b.body.id}/messages`).set(bearer(d.accessToken)).expect(200);
    expect(chat.body.open).toBe(false);

    // Only the blocker sees the block.
    const mine = await request(server).get('/v1/me/blocks').set(bearer(p.accessToken)).expect(200);
    expect(mine.body.map((x: { user: { id: string } }) => x.user.id)).toEqual([d.userId]);
    expect((await request(server).get('/v1/me/blocks').set(bearer(d.accessToken)).expect(200)).body).toEqual([]);

    // Unblocking restores visibility.
    await request(server).delete(`/v1/me/blocks/${d.userId}`).set(bearer(p.accessToken)).expect(204);
    await request(server).get(`/v1/rides/${later.id}`).set(bearer(p.accessToken)).expect(200);
    await request(server).post(`/v1/rides/${later.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);

    expect((await request(server).post('/v1/me/blocks').set(bearer(p.accessToken)).send({ userId: p.userId }).expect(400)).body.error.code).toBe('BLOCK_SELF');
  });

  it('reporting with "block" blocks in the same step', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const b = await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);
    await request(server)
      .post('/v1/reports')
      .set(bearer(d.accessToken))
      .send({ bookingId: b.body.id, reportedUserId: p.userId, reason: 'SAFETY', block: true })
      .expect(201);
    // Driver blocked the passenger: the passenger's booking was ended as if the driver declined.
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.body.id } })).status).toBe('CANCELLED_BY_DRIVER');
    const inbox = await request(server).get('/v1/me/notifications').set(bearer(p.accessToken)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'BOOKING_DECLINED' });
  });
});
