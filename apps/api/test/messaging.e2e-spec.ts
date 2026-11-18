import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PUSH_SENDER, type PushMessage, type PushSender } from '../src/notifications/push-sender';
import { BookingsService } from '../src/rides/bookings.service';
import { bearer, createApp, loginWithProfile, makeDriver, publishRide } from './helpers';

/** Records what would be pushed instead of calling Expo. */
class FakePush implements PushSender {
  sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return { invalidTokens: messages.map((m) => m.token).filter((t) => this.invalid.has(t)) };
  }
}

const tokenFor = () => `ExponentPushToken[test${Math.random().toString(36).slice(2, 14)}]`;
/** Push delivery runs after the response; give it a moment. */
const settle = () => new Promise((r) => setTimeout(r, 150));

describe('Notifications and chat (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  const push = new FakePush();

  beforeAll(async () => {
    ({ app, prisma } = await createApp([{ provide: PUSH_SENDER, useValue: push }]));
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  const inbox = async (token: string) => (await request(server).get('/v1/me/notifications').set(bearer(token)).expect(200)).body;
  const latest = async (token: string) => (await inbox(token)).items[0];
  const book = (token: string, rideId: string) => request(server).post(`/v1/rides/${rideId}/bookings`).set(bearer(token)).send({});
  const passenger = (fullName = 'Salma Adel') => loginWithProfile(app, { gender: 'FEMALE', fullName });

  // ---------- Notifications ----------

  it('tells the driver about an instant booking, in the same transaction, without private data', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const b = await book(p.accessToken, ride.id).expect(201);

    const n = await latest(d.accessToken);
    expect(n).toMatchObject({ type: 'BOOKING_CONFIRMED', rideId: ride.id, bookingId: b.body.id, readAt: null });
    expect(n.data).toMatchObject({ name: 'Salma A.', fromEn: 'Smart Village — Building B2', toEn: 'Cairo Festival City — Gate 4' });
    expect(JSON.stringify(n)).not.toContain(p.phone);
    expect((await inbox(d.accessToken)).unreadCount).toBe(1);
    // The passenger gets nothing for their own action.
    expect((await inbox(p.accessToken)).items).toHaveLength(0);
  });

  it('covers the request flow: requested, accepted, declined, expired', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d, { bookingMode: 'REQUEST' });
    const [p1, p2, p3] = await Promise.all([passenger(), passenger(), passenger()]);
    const b1 = await book(p1.accessToken, ride.id).expect(201);
    const b2 = await book(p2.accessToken, ride.id).expect(201);
    const b3 = await book(p3.accessToken, ride.id).expect(201);
    expect((await inbox(d.accessToken)).items.map((x: { type: string }) => x.type)).toEqual([
      'BOOKING_REQUESTED',
      'BOOKING_REQUESTED',
      'BOOKING_REQUESTED',
    ]);

    await request(server).post(`/v1/bookings/${b1.body.id}/accept`).set(bearer(d.accessToken)).expect(200);
    await request(server).post(`/v1/bookings/${b2.body.id}/decline`).set(bearer(d.accessToken)).expect(200);
    expect(await latest(p1.accessToken)).toMatchObject({ type: 'BOOKING_ACCEPTED', data: { name: 'Driver T.' } });
    expect(await latest(p2.accessToken)).toMatchObject({ type: 'BOOKING_DECLINED' });

    await prisma.booking.update({ where: { id: b3.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await app.get(BookingsService).expireDue();
    expect(await latest(p3.accessToken)).toMatchObject({ type: 'BOOKING_EXPIRED', bookingId: b3.body.id });
  });

  it('tells the driver when a passenger cancels, and every passenger when the driver cancels', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const [p1, p2] = await Promise.all([passenger(), passenger()]);
    const b1 = await book(p1.accessToken, ride.id).expect(201);
    await book(p2.accessToken, ride.id).expect(201);

    await request(server).post(`/v1/bookings/${b1.body.id}/cancel`).set(bearer(p1.accessToken)).send({}).expect(200);
    expect(await latest(d.accessToken)).toMatchObject({ type: 'BOOKING_CANCELLED', bookingId: b1.body.id });

    await request(server).post(`/v1/rides/${ride.id}/cancel`).set(bearer(d.accessToken)).send({}).expect(200);
    expect(await latest(p2.accessToken)).toMatchObject({ type: 'RIDE_CANCELLED', data: { name: 'Driver T.' } });
    // p1 had already cancelled, so isn't told again.
    expect((await inbox(p1.accessToken)).items.some((x: { type: string }) => x.type === 'RIDE_CANCELLED')).toBe(false);
  });

  it('marks only your own notifications as read, and pages through older ones', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d, { seats: 3 });
    const riders = await Promise.all([passenger(), passenger(), passenger()]);
    for (const r of riders) await book(r.accessToken, ride.id).expect(201);
    const all = await inbox(d.accessToken);
    expect(all.unreadCount).toBe(3);

    // Someone else's ids are ignored.
    const stranger = await passenger();
    await request(server).post('/v1/me/notifications/read').set(bearer(stranger.accessToken)).send({ ids: [all.items[0].id] }).expect(200);
    expect((await inbox(d.accessToken)).unreadCount).toBe(3);

    const one = await request(server).post('/v1/me/notifications/read').set(bearer(d.accessToken)).send({ ids: [all.items[0].id] }).expect(200);
    expect(one.body.unreadCount).toBe(2);
    const rest = await request(server).post('/v1/me/notifications/read').set(bearer(d.accessToken)).send({ all: true }).expect(200);
    expect(rest.body.unreadCount).toBe(0);
    await request(server).post('/v1/me/notifications/read').set(bearer(d.accessToken)).send({}).expect(400);

    const older = await request(server).get(`/v1/me/notifications?before=${all.items[0].id}`).set(bearer(d.accessToken)).expect(200);
    expect(older.body.items.map((x: { id: string }) => x.id)).toEqual(all.items.slice(1).map((x: { id: string }) => x.id));
  });

  // ---------- Push ----------

  it('pushes in the reader’s language to registered devices and drops dead tokens', async () => {
    const d = await makeDriver(app);
    await request(server).patch('/v1/me/profile').set(bearer(d.accessToken)).send({ locale: 'ar' }).expect(200);
    const good = tokenFor();
    const dead = tokenFor();
    push.invalid.add(dead);
    for (const token of [good, dead]) {
      await request(server).post('/v1/me/push-devices').set(bearer(d.accessToken)).send({ token, platform: 'android' }).expect(204);
    }
    const bad = await request(server).post('/v1/me/push-devices').set(bearer(d.accessToken)).send({ token: 'abc', platform: 'android' }).expect(400);
    expect(bad.body.error.code).toBe('PUSH_TOKEN_FORMAT');

    const ride = await publishRide(app, prisma, d);
    const p = await passenger('Mona Hassan');
    await book(p.accessToken, ride.id).expect(201);
    await settle();

    const sent = push.sent.filter((m) => m.token === good);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain('Mona H.');
    expect(sent[0]!.body).toContain('حجز في رحلتك'); // Arabic template
    expect(sent[0]!.data).toMatchObject({ type: 'BOOKING_CONFIRMED', rideId: ride.id });
    const deadRow = await prisma.pushDevice.findUniqueOrThrow({ where: { token: dead } });
    expect(deadRow.disabledAt).not.toBeNull();

    // A token moves to whoever registers it last (shared phone, new account), and logout removes it.
    await request(server).post('/v1/me/push-devices').set(bearer(p.accessToken)).send({ token: good, platform: 'android' }).expect(204);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token: good } })).userId).toBe(p.userId);
    await request(server).delete('/v1/me/push-devices').set(bearer(p.accessToken)).send({ token: good }).expect(204);
    expect(await prisma.pushDevice.findUnique({ where: { token: good } })).toBeNull();
  });

  // ---------- Chat ----------

  it('lets only the driver and that passenger read and write their thread', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const other = await passenger();
    const b = (await book(p.accessToken, ride.id).expect(201)).body;
    const ob = (await book(other.accessToken, ride.id).expect(201)).body;
    const send = (token: string, bookingId: string, body: unknown) =>
      request(server).post(`/v1/bookings/${bookingId}/messages`).set(bearer(token)).send({ body });

    const m1 = await send(p.accessToken, b.id, '  Hi! I am by the gate \u0007 ').expect(201);
    expect(m1.body).toMatchObject({ mine: true, body: 'Hi! I am by the gate' }); // trimmed, control char removed
    await send(d.accessToken, b.id, 'On my way, 5 minutes').expect(201);

    const asPassenger = await request(server).get(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).expect(200);
    expect(asPassenger.body.items.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Hi! I am by the gate', true],
      ['On my way, 5 minutes', false],
    ]);
    expect(asPassenger.body.open).toBe(true);

    // Another passenger on the same ride, and a stranger, can't see or post.
    await request(server).get(`/v1/bookings/${b.id}/messages`).set(bearer(other.accessToken)).expect(404);
    await send(other.accessToken, b.id, 'hello').expect(404);
    await request(server).get(`/v1/bookings/${ob.id}/messages`).set(bearer(p.accessToken)).expect(404);

    expect((await send(p.accessToken, b.id, '   ').expect(400)).body.error.code).toBe('CHAT_MESSAGE_EMPTY');
    expect((await send(p.accessToken, b.id, 'x'.repeat(1001)).expect(400)).body.error.code).toBe('CHAT_MESSAGE_TOO_LONG');

    // Messages are a record: the database refuses edits.
    await expect(prisma.message.update({ where: { id: m1.body.id }, data: { body: 'edited' } })).rejects.toThrow();
  });

  it('tracks unread messages, polls for new ones, and closes the chat when the booking ends', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger('Nada Fathy');
    const b = (await book(p.accessToken, ride.id).expect(201)).body;
    const driverToken = tokenFor();
    await request(server).post('/v1/me/push-devices').set(bearer(d.accessToken)).send({ token: driverToken, platform: 'ios' }).expect(204);

    // The conversation exists as soon as there's a booking, before any message.
    const before = await request(server).get('/v1/me/conversations').set(bearer(d.accessToken)).expect(200);
    const conv = before.body.find((c: { bookingId: string }) => c.bookingId === b.id);
    expect(conv).toMatchObject({ role: 'driver', open: true, lastMessage: null, unreadCount: 0, other: { displayName: 'Nada F.' } });
    expect(conv.other).not.toHaveProperty('phone');

    const first = await request(server).post(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).send({ body: 'one' }).expect(201);
    await request(server).post(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).send({ body: 'two' }).expect(201);
    await settle();
    const chatPushes = push.sent.filter((m) => m.token === driverToken && m.data.type === 'MESSAGE');
    expect(chatPushes.map((m) => m.body)).toEqual(['one', 'two']);
    expect(chatPushes[0]!.title).toBe('رسالة جديدة من Nada F.'); // the driver's language is Arabic by default
    expect(chatPushes[0]!.data).toEqual({ type: 'MESSAGE', bookingId: b.id });

    const convs = await request(server).get('/v1/me/conversations').set(bearer(d.accessToken)).expect(200);
    expect(convs.body.find((c: { bookingId: string }) => c.bookingId === b.id)).toMatchObject({ unreadCount: 2, lastMessage: { body: 'two', mine: false } });
    expect((await request(server).get('/v1/me/conversations/unread-count').set(bearer(d.accessToken)).expect(200)).body.unreadCount).toBeGreaterThanOrEqual(2);

    const newer = await request(server).get(`/v1/bookings/${b.id}/messages?after=${first.body.id}`).set(bearer(d.accessToken)).expect(200);
    expect(newer.body.items.map((m: { body: string }) => m.body)).toEqual(['two']);

    await request(server).post(`/v1/bookings/${b.id}/messages/read`).set(bearer(d.accessToken)).expect(204);
    const after = await request(server).get('/v1/me/conversations').set(bearer(d.accessToken)).expect(200);
    expect(after.body.find((c: { bookingId: string }) => c.bookingId === b.id).unreadCount).toBe(0);
    const seen = await request(server).get(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).expect(200);
    expect(seen.body.otherReadAt).not.toBeNull(); // the passenger can see the driver read it

    // Cancelled booking: history stays readable, nobody can post.
    await request(server).post(`/v1/bookings/${b.id}/cancel`).set(bearer(p.accessToken)).send({}).expect(200);
    const closed = await request(server).post(`/v1/bookings/${b.id}/messages`).set(bearer(d.accessToken)).send({ body: 'still there?' }).expect(409);
    expect(closed.body.error.code).toBe('CHAT_CLOSED');
    const history = await request(server).get(`/v1/bookings/${b.id}/messages`).set(bearer(d.accessToken)).expect(200);
    expect(history.body).toMatchObject({ open: false });
    expect(history.body.items).toHaveLength(2);
  });

  it('keeps the chat open for a day after departure, then closes it', async () => {
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await passenger();
    const b = (await book(p.accessToken, ride.id).expect(201)).body;

    await prisma.ride.update({ where: { id: ride.id }, data: { departureAt: new Date(Date.now() - 3 * 3_600_000) } });
    await request(server).post(`/v1/rides/${ride.id}/complete`).set(bearer(d.accessToken)).expect(200);
    expect(await latest(p.accessToken)).toMatchObject({ type: 'RIDE_COMPLETED' });
    await request(server).post(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).send({ body: 'I left my umbrella' }).expect(201);

    await prisma.ride.update({ where: { id: ride.id }, data: { departureAt: new Date(Date.now() - 25 * 3_600_000) } });
    await request(server).post(`/v1/bookings/${b.id}/messages`).set(bearer(p.accessToken)).send({ body: 'hello?' }).expect(409);
  });
});
