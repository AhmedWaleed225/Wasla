import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminRole, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hashPassword } from '../src/admin/password';
import { bearer, createApp, loginWithProfile, makeDriver, publishRide } from './helpers';

const PASSWORD = 'correct-horse-battery-staple';
const CSRF = { 'X-Wasla-Admin': '1' };

describe('Admin console API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let n = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function makeAdmin(role: AdminRole) {
    n += 1;
    const email = `staff${Date.now()}${n}@wasla.test`;
    await prisma.adminUser.create({ data: { email, name: `${role} ${n}`, role, passwordHash: hashPassword(PASSWORD) } });
    return email;
  }

  /** A supertest agent keeps the session cookie between requests, like a browser. */
  async function signIn(role: AdminRole) {
    const email = await makeAdmin(role);
    const agent = request.agent(server);
    await agent.post('/v1/admin/auth/login').set(CSRF).send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  it('signs in with a hardened session cookie and rejects everything else', async () => {
    const email = await makeAdmin('SUPPORT');

    const wrong = await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email, password: 'nope' }).expect(401);
    const unknown = await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: 'ghost@wasla.test', password: PASSWORD }).expect(401);
    expect(wrong.body.error.code).toBe('ADMIN_LOGIN_FAILED');
    expect(unknown.body.error.code).toBe('ADMIN_LOGIN_FAILED'); // same answer: no account probing
    expect((await request(server).post('/v1/admin/auth/login').send({ email, password: PASSWORD }).expect(403)).body.error.code).toBe('ADMIN_CSRF');

    const ok = await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: email.toUpperCase(), password: PASSWORD }).expect(200);
    expect(ok.body).toMatchObject({ email, role: 'SUPPORT' });
    expect(ok.body).not.toHaveProperty('passwordHash');
    const cookie = ok.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/^wasla_admin=[\w-]{20,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/v1/admin');

    await request(server).get('/v1/admin/auth/me').expect(401);
    await request(server).get('/v1/admin/auth/me').set('Cookie', cookie.split(';')[0]!).expect(200);

    // An app user's token is no key to the console.
    const user = await loginWithProfile(app);
    await request(server).get('/v1/admin/overview').set(bearer(user.accessToken)).expect(401);
  });

  it('locks an account after 5 wrong passwords, even for the right one', async () => {
    const email = await makeAdmin('SUPPORT');
    for (let i = 0; i < 4; i++) {
      await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email, password: `bad-${i}` }).expect(401);
    }
    expect((await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email, password: 'bad-5' }).expect(429)).body.error.code).toBe('ADMIN_LOCKED');
    expect((await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email, password: PASSWORD }).expect(429)).body.error.code).toBe('ADMIN_LOCKED');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.locked' }, orderBy: { id: 'desc' } });
    expect(audit).not.toBeNull();
  });

  it('enforces role permissions and hides contact details from finance', async () => {
    const finance = await signIn('FINANCE');
    const target = await loginWithProfile(app, { fullName: 'Hana Ibrahim' });

    const overview = await finance.get('/v1/admin/overview').expect(200);
    expect(overview.body).toMatchObject({ users: expect.any(Object), rides: expect.any(Object), reports: expect.any(Object) });
    expect(overview.body.bookings.last7Days).toHaveLength(7);

    const list = await finance.get('/v1/admin/users').query({ q: 'Hana Ibrahim' }).expect(200);
    const row = list.body.items.find((u: { id: string }) => u.id === target.userId);
    expect(row.phone).toContain('••••'); // masked for finance
    expect(row.displayName).toBe('Hana I.');

    const denied = await finance.post(`/v1/admin/users/${target.userId}/suspend`).set(CSRF).send({ reason: 'test' }).expect(403);
    expect(denied.body.error.code).toBe('ADMIN_FORBIDDEN');
    await finance.get('/v1/admin/reports').expect(403);
    await finance.get('/v1/admin/audit').expect(403);

    const support = await signIn('SUPPORT');
    const seen = await support.get(`/v1/admin/users/${target.userId}`).expect(200);
    expect(seen.body.phone).not.toContain('••••'); // support can contact users
    expect(await prisma.auditLog.findFirst({ where: { action: 'admin.user_viewed', entityId: target.userId } })).not.toBeNull();
  });

  it('suspends a driver: signs them out, cancels their rides, tells passengers, and can reinstate', async () => {
    const ops = await signIn('OPERATIONS');
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await loginWithProfile(app);
    await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);

    // Changes need the CSRF header even with a valid cookie.
    await ops.post(`/v1/admin/users/${d.userId}/suspend`).send({ reason: 'Repeated unsafe driving reports' }).expect(403);
    expect((await ops.post(`/v1/admin/users/${d.userId}/suspend`).set(CSRF).send({ reason: 'x' }).expect(400)).body.error.code).toBe('ADMIN_REASON_REQUIRED');

    const res = await ops.post(`/v1/admin/users/${d.userId}/suspend`).set(CSRF).send({ reason: 'Repeated unsafe driving reports' }).expect(200);
    expect(res.body).toMatchObject({ status: 'SUSPENDED', suspendedReason: 'Repeated unsafe driving reports' });

    const blocked = await request(server).get('/v1/me').set(bearer(d.accessToken)).expect(403);
    expect(blocked.body.error.code).toBe('AUTH_ACCOUNT_SUSPENDED');
    await request(server).post('/v1/auth/refresh').send({ refreshToken: d.refreshToken }).expect(401);
    expect((await prisma.ride.findUniqueOrThrow({ where: { id: ride.id } })).status).toBe('CANCELLED');
    const inbox = await request(server).get('/v1/me/notifications').set(bearer(p.accessToken)).expect(200);
    expect(inbox.body.items[0]).toMatchObject({ type: 'RIDE_CANCELLED', rideId: ride.id });
    expect(await prisma.auditLog.findFirst({ where: { action: 'admin.user_suspended', entityId: d.userId } })).not.toBeNull();

    await ops.post(`/v1/admin/users/${d.userId}/reinstate`).set(CSRF).send({ reason: 'Appeal accepted' }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: d.userId } })).status).toBe('ACTIVE');

    // Ops can also cancel a single ride.
    const other = await publishRide(app, prisma, await makeDriver(app));
    const cancelled = await ops.post(`/v1/admin/rides/${other.id}/cancel`).set(CSRF).send({ reason: 'Duplicate listing' }).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Duplicate listing' });
  });

  it('works a report: urgent first, chat visible to support and audited, then resolved', async () => {
    const support = await signIn('SUPPORT');
    const d = await makeDriver(app);
    const ride = await publishRide(app, prisma, d);
    const p = await loginWithProfile(app, { gender: 'FEMALE' });
    const b = await request(server).post(`/v1/rides/${ride.id}/bookings`).set(bearer(p.accessToken)).send({}).expect(201);
    await request(server).post(`/v1/bookings/${b.body.id}/messages`).set(bearer(d.accessToken)).send({ body: 'Send me your number' }).expect(201);
    const rep = await request(server)
      .post('/v1/reports')
      .set(bearer(p.accessToken))
      .send({ bookingId: b.body.id, reportedUserId: d.userId, reason: 'HARASSMENT', details: 'Pushy messages' })
      .expect(201);

    const urgent = await support.get('/v1/admin/reports').query({ status: 'urgent' }).expect(200);
    expect(urgent.body.items.find((r: { id: string }) => r.id === rep.body.id)).toMatchObject({ urgent: true, reason: 'HARASSMENT' });

    const detail = await support.get(`/v1/admin/reports/${rep.body.id}`).expect(200);
    expect(detail.body).toMatchObject({ details: 'Pushy messages', status: 'OPEN' });
    expect(detail.body.messages.map((m: { body: string }) => m.body)).toEqual(['Send me your number']);
    expect(detail.body.ride).toMatchObject({ id: ride.id });
    expect(await prisma.auditLog.findFirst({ where: { action: 'admin.report_chat_viewed', entityId: rep.body.id } })).not.toBeNull();

    const done = await support.patch(`/v1/admin/reports/${rep.body.id}`).set(CSRF).send({ status: 'RESOLVED', adminNote: 'Warned the driver' }).expect(200);
    expect(done.body).toMatchObject({ status: 'RESOLVED', adminNote: 'Warned the driver', urgent: false });
    expect(done.body.resolvedAt).not.toBeNull();
    expect(done.body.handledBy).toMatch(/^SUPPORT/);
  });

  it('shows the audit log to operations and ends sessions on logout', async () => {
    const ops = await signIn('OPERATIONS');
    const audit = await ops.get('/v1/admin/audit').query({ q: 'admin.' }).expect(200);
    expect(audit.body.items.length).toBeGreaterThan(0);
    expect(audit.body.items.every((a: { action: string }) => a.action.startsWith('admin.'))).toBe(true);

    await ops.post('/v1/admin/auth/logout').set(CSRF).expect(204);
    await ops.get('/v1/admin/overview').expect(401);
  });
});
