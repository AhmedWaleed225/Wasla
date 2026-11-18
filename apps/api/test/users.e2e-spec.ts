import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp, login, loginWithProfile } from './helpers';

describe('Profiles and roles (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
  });
  afterAll(async () => app.close());

  it('creates a profile once and shows a privacy-safe display name', async () => {
    const s = await login(app);
    const res = await request(server)
      .post('/v1/me/profile')
      .set(auth(s.accessToken))
      .send({ fullName: 'Nour El-Sayed', dateOfBirth: '1999-03-14', gender: 'FEMALE', preferences: { quietRides: true } })
      .expect(201);
    expect(res.body.profile.displayName).toBe('Nour E.');
    expect(res.body.profile.preferences.quietRides).toBe(true);

    const again = await request(server)
      .post('/v1/me/profile')
      .set(auth(s.accessToken))
      .send({ fullName: 'Someone Else', dateOfBirth: '1999-03-14', gender: 'FEMALE' })
      .expect(409);
    expect(again.body.error.code).toBe('PROFILE_ALREADY_EXISTS');
  });

  it('rejects users under 18', async () => {
    const s = await login(app);
    const year = new Date().getUTCFullYear() - 17;
    const r = await request(server)
      .post('/v1/me/profile')
      .set(auth(s.accessToken))
      .send({ fullName: 'Too Young', dateOfBirth: `${year}-01-01`, gender: 'MALE' })
      .expect(400);
    expect(r.body.error.code).toBe('PROFILE_UNDERAGE');
  });

  it('ignores role fields sent by the client', async () => {
    const s = await loginWithProfile(app);
    const r = await request(server)
      .patch('/v1/me/profile')
      .set(auth(s.accessToken))
      .send({ bio: 'Hi', roles: ['DRIVER'], activeRole: 'DRIVER', status: 'ACTIVE' })
      .expect(200);
    expect(r.body.roles).toEqual(['PASSENGER']);
    expect(r.body.activeRole).toBe('PASSENGER');
    expect(r.body.profile.bio).toBe('Hi');
  });

  it('only allows switching to a role the backend granted', async () => {
    const s = await loginWithProfile(app);
    const denied = await request(server).put('/v1/me/active-role').set(auth(s.accessToken)).send({ role: 'DRIVER' }).expect(403);
    expect(denied.body.error.code).toBe('ROLE_NOT_GRANTED');

    const enabled = await request(server).post('/v1/me/roles/driver').set(auth(s.accessToken)).expect(201);
    expect(enabled.body.roles).toEqual(['PASSENGER', 'DRIVER']);

    const switched = await request(server).put('/v1/me/active-role').set(auth(s.accessToken)).send({ role: 'DRIVER' }).expect(200);
    expect(switched.body.activeRole).toBe('DRIVER');
  });

  it('requires a profile before enabling driving', async () => {
    const s = await login(app);
    const r = await request(server).post('/v1/me/roles/driver').set(auth(s.accessToken)).expect(400);
    expect(r.body.error.code).toBe('PROFILE_REQUIRED');
  });

  it('can opt in to driving during profile setup', async () => {
    const s = await loginWithProfile(app, { wantsToDrive: true });
    const me = await request(server).get('/v1/me').set(auth(s.accessToken)).expect(200);
    expect(me.body.roles).toContain('DRIVER');
  });

  it('switches the account language', async () => {
    const s = await loginWithProfile(app);
    const r = await request(server).patch('/v1/me/profile').set(auth(s.accessToken)).send({ locale: 'en' }).expect(200);
    expect(r.body.locale).toBe('en');
  });
});
