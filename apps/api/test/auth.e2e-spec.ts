import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, FIXED_CODE, freshPhone, login } from './helpers';

describe('Authentication (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    server = app.getHttpServer();
  });
  afterAll(async () => app.close());

  it('rejects a non-Egyptian number with a localized error', async () => {
    const res = await request(server)
      .post('/v1/auth/otp/request')
      .set('Accept-Language', 'ar')
      .send({ phone: '01312345678' })
      .expect(400);
    expect(res.body.error.code).toBe('AUTH_INVALID_PHONE');
    expect(res.body.error.message).toContain('رقم موبايل مصري');

    const en = await request(server).post('/v1/auth/otp/request').set('Accept-Language', 'en').send({ phone: 'abc' }).expect(400);
    expect(en.body.error.message).toContain('Egyptian mobile');
  });

  it('signs up a new user, then logs the same user in again', async () => {
    const phone = freshPhone();
    const first = await login(app, phone);
    expect(first.body.isNewUser).toBe(true);
    expect(first.body.user.roles).toEqual(['PASSENGER']);
    expect(first.body.user.profile).toBeNull();

    // OTP hash only — the plain code is never stored.
    const stored = await prisma.otpChallenge.findFirst({ where: { phoneE164: phone } });
    expect(stored?.codeHash).not.toContain(FIXED_CODE);

    await prisma.otpChallenge.updateMany({ where: { phoneE164: phone }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const second = await login(app, phone);
    expect(second.body.isNewUser).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it('accepts local formats and Arabic-Indic digits for the same account', async () => {
    await prisma.otpChallenge.deleteMany({ where: { phoneE164: '+201599990001' } });
    const res = await request(server).post('/v1/auth/otp/request').send({ phone: '٠١٥٩٩٩٩٠٠٠١' }).expect(200);
    expect(res.body).toEqual({ resendAfter: 45, expiresIn: 300 });
    const v = await request(server).post('/v1/auth/otp/verify').send({ phone: '+20 15 9999 0001', code: FIXED_CODE }).expect(200);
    expect(v.body.user.phone).toBe('+201599990001');
  });

  it('enforces the resend cooldown', async () => {
    const phone = freshPhone();
    await request(server).post('/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await request(server).post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(res.body.error.code).toBe('AUTH_OTP_COOLDOWN');
    expect(res.body.error.resendAfter).toBeGreaterThan(0);
  });

  it('locks a code after 5 wrong attempts, even if the 6th guess is right', async () => {
    const phone = freshPhone();
    await request(server).post('/v1/auth/otp/request').send({ phone }).expect(200);
    for (let i = 0; i < 5; i++) {
      const r = await request(server).post('/v1/auth/otp/verify').send({ phone, code: '000000' }).expect(401);
      expect(r.body.error.code).toBe('AUTH_OTP_INVALID');
    }
    const locked = await request(server).post('/v1/auth/otp/verify').send({ phone, code: FIXED_CODE }).expect(429);
    expect(locked.body.error.code).toBe('AUTH_OTP_TOO_MANY_ATTEMPTS');
  });

  it('does not accept the same code twice', async () => {
    const { phone } = await login(app);
    const r = await request(server).post('/v1/auth/otp/verify').send({ phone, code: FIXED_CODE }).expect(401);
    expect(r.body.error.code).toBe('AUTH_OTP_EXPIRED');
  });

  it('rejects an expired code', async () => {
    const phone = freshPhone();
    await request(server).post('/v1/auth/otp/request').send({ phone }).expect(200);
    await prisma.otpChallenge.updateMany({ where: { phoneE164: phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await request(server).post('/v1/auth/otp/verify').send({ phone, code: FIXED_CODE }).expect(401);
    expect(r.body.error.code).toBe('AUTH_OTP_EXPIRED');
  });

  it('requires a token for protected routes', async () => {
    await request(server).get('/v1/me').expect(401);
    const r = await request(server).get('/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    expect(r.body.error.code).toBe('AUTH_UNAUTHENTICATED');
  });

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const s = await login(app);
    const r1 = await request(server).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    await request(server).get('/v1/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(200);

    // Replaying the first token looks like theft: everything in the family dies.
    const replay = await request(server).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('AUTH_SESSION_REVOKED');
    await request(server).post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    await request(server).get('/v1/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(401);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.refresh_token_reuse', metadata: { path: ['userId'], equals: s.userId } } });
    expect(audit).not.toBeNull();
  });

  it('logout ends the session immediately', async () => {
    const s = await login(app);
    await request(server).post('/v1/auth/logout').set('Authorization', `Bearer ${s.accessToken}`).expect(204);
    await request(server).get('/v1/me').set('Authorization', `Bearer ${s.accessToken}`).expect(401);
    await request(server).post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('blocks suspended accounts on every route and at login', async () => {
    const s = await login(app);
    await prisma.user.update({ where: { id: s.userId }, data: { status: 'SUSPENDED' } });
    const r = await request(server).get('/v1/me').set('Authorization', `Bearer ${s.accessToken}`).expect(403);
    expect(r.body.error.code).toBe('AUTH_ACCOUNT_SUSPENDED');

    await prisma.otpChallenge.updateMany({ where: { phoneE164: s.phone }, data: { createdAt: new Date(Date.now() - 60_000) } });
    await request(server).post('/v1/auth/otp/request').send({ phone: s.phone }).expect(200);
    const again = await request(server).post('/v1/auth/otp/verify').send({ phone: s.phone, code: FIXED_CODE }).expect(403);
    expect(again.body.error.code).toBe('AUTH_ACCOUNT_SUSPENDED');
  });
});
