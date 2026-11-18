import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AdminRole, PrismaClient } from '@prisma/client';
import request from 'supertest';
import { hashPassword } from '../src/admin/password';
import { createApp } from './helpers';

const PASSWORD = 'correct-horse-battery-staple';
const CSRF = { 'X-Wasla-Admin': '1' };

describe('Staff management (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let n = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    server = app.getHttpServer();
  });
  afterAll(() => app.close());

  const email = () => `staff${Date.now()}${(n += 1)}@wasla.test`;

  async function signIn(role: AdminRole) {
    const e = email();
    const admin = await prisma.adminUser.create({ data: { email: e, name: `${role} ${n}`, role, passwordHash: hashPassword(PASSWORD) } });
    const agent = request.agent(server);
    await agent.post('/v1/admin/auth/login').set(CSRF).send({ email: e, password: PASSWORD }).expect(200);
    return { agent, id: admin.id };
  }

  it('only super admins manage staff', async () => {
    const ops = await signIn('OPERATIONS');
    expect((await ops.agent.get('/v1/admin/staff').expect(403)).body.error.code).toBe('ADMIN_FORBIDDEN');
    await ops.agent.post('/v1/admin/staff').set(CSRF).send({ email: email(), name: 'X Y', role: 'SUPPORT' }).expect(403);
  });

  it('creates staff with a one-time password that must be changed before anything else', async () => {
    const sup = await signIn('SUPER_ADMIN');
    const newEmail = email();
    const created = await sup.agent.post('/v1/admin/staff').set(CSRF).send({ email: newEmail.toUpperCase(), name: 'Mona Kamal', role: 'SUPPORT' }).expect(201);
    expect(created.body).toMatchObject({ email: newEmail, role: 'SUPPORT', mustChangePassword: true, disabled: false });
    expect(created.body.temporaryPassword).toMatch(/^[\w-]{24}$/);
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { email: newEmail } });
    expect(stored.passwordHash).not.toContain(created.body.temporaryPassword); // only a hash is kept

    expect((await sup.agent.post('/v1/admin/staff').set(CSRF).send({ email: newEmail, name: 'Again', role: 'SUPPORT' }).expect(409)).body.error.code).toBe('ADMIN_EMAIL_TAKEN');
    const list = await sup.agent.get('/v1/admin/staff').expect(200);
    expect(list.body.some((s: { email: string }) => s.email === newEmail)).toBe(true);

    // The new person signs in with the temporary password: only "me", password change and sign-out work.
    const mona = request.agent(server);
    const me = await mona.post('/v1/admin/auth/login').set(CSRF).send({ email: newEmail, password: created.body.temporaryPassword }).expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    expect((await mona.get('/v1/admin/overview').expect(403)).body.error.code).toBe('ADMIN_PASSWORD_CHANGE_REQUIRED');
    await mona.get('/v1/admin/auth/me').expect(200);

    const tooShort = await mona.post('/v1/admin/auth/password').set(CSRF).send({ currentPassword: created.body.temporaryPassword, newPassword: 'short' }).expect(400);
    expect(tooShort.body.error.code).toBe('ADMIN_PASSWORD_WEAK');
    const wrong = await mona.post('/v1/admin/auth/password').set(CSRF).send({ currentPassword: 'not-it', newPassword: 'a-much-better-password' }).expect(400);
    expect(wrong.body.error.code).toBe('ADMIN_WRONG_PASSWORD');

    const changed = await mona.post('/v1/admin/auth/password').set(CSRF).send({ currentPassword: created.body.temporaryPassword, newPassword: 'a-much-better-password' }).expect(200);
    expect(changed.body.mustChangePassword).toBe(false);
    await mona.get('/v1/admin/overview').expect(200); // same session keeps working
    await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: newEmail, password: created.body.temporaryPassword }).expect(401);
    expect(await prisma.auditLog.findFirst({ where: { action: 'admin.staff_created', entityId: stored.id } })).not.toBeNull();
  });

  it('changes roles, disables (signing out) and resets passwords — never for yourself', async () => {
    const sup = await signIn('SUPER_ADMIN');
    const target = await signIn('SUPPORT');

    expect((await sup.agent.patch(`/v1/admin/staff/${sup.id}`).set(CSRF).send({ role: 'SUPPORT' }).expect(403)).body.error.code).toBe('ADMIN_SELF_CHANGE');
    await sup.agent.patch(`/v1/admin/staff/${sup.id}`).set(CSRF).send({ disabled: true }).expect(403);
    await sup.agent.post(`/v1/admin/staff/${sup.id}/reset-password`).set(CSRF).expect(403);

    const promoted = await sup.agent.patch(`/v1/admin/staff/${target.id}`).set(CSRF).send({ role: 'OPERATIONS' }).expect(200);
    expect(promoted.body.role).toBe('OPERATIONS');
    await target.agent.get('/v1/admin/audit').expect(200); // new role applies on the next request

    await sup.agent.patch(`/v1/admin/staff/${target.id}`).set(CSRF).send({ disabled: true }).expect(200);
    await target.agent.get('/v1/admin/overview').expect(401);
    const t = await prisma.adminUser.findUniqueOrThrow({ where: { id: target.id } });
    await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: t.email, password: PASSWORD }).expect(401);

    await sup.agent.patch(`/v1/admin/staff/${target.id}`).set(CSRF).send({ disabled: false }).expect(200);
    const reset = await sup.agent.post(`/v1/admin/staff/${target.id}/reset-password`).set(CSRF).expect(200);
    expect(reset.body).toMatchObject({ mustChangePassword: true, locked: false });
    await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: t.email, password: PASSWORD }).expect(401);
    await request(server).post('/v1/admin/auth/login').set(CSRF).send({ email: t.email, password: reset.body.temporaryPassword }).expect(200);

    const actions = (await prisma.auditLog.findMany({ where: { entityId: target.id, actorId: sup.id } })).map((a) => a.action).sort();
    expect(actions).toEqual(['admin.staff_disabled', 'admin.staff_enabled', 'admin.staff_password_reset', 'admin.staff_role_changed']);
  });
});
