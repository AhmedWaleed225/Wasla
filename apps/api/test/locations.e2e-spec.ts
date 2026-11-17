import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp, loginWithProfile } from './helpers';

describe('Locations and saved places (e2e)', () => {
  let app: NestExpressApplication;
  let server: ReturnType<NestExpressApplication['getHttpServer']>;
  let token: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    token = (await loginWithProfile(app)).accessToken;
  });
  afterAll(async () => app.close());

  const search = (q: string, extra = '') =>
    request(server).get(`/v1/locations/search?q=${encodeURIComponent(q)}${extra}`).set(auth(token)).expect(200);

  it('finds a gate by its common abbreviation', async () => {
    const r = await search('CFC gate');
    expect(r.body[0].nameEn).toBe('Cairo Festival City — Gate 4');
    expect(r.body[0].parentNameEn).toBe('Cairo Festival City Mall');
  });

  it('finds places by Arabic alias', async () => {
    const r = await search('التجمع');
    expect(r.body.map((l: { nameEn: string }) => l.nameEn)).toContain('New Cairo');
  });

  it('matches Arabic without hamza and with Arabic-Indic digits', async () => {
    const alex = await search('الاسكندريه');
    expect(alex.body[0].nameEn).toBe('Alexandria');
    const gate = await search('بوابة ١٣');
    expect(gate.body[0].nameEn).toBe('El Rehab — Gate 13');
  });

  it('filters by kind and treats LIKE wildcards literally', async () => {
    const unis = await search('cairo', '&kinds=UNIVERSITY');
    expect(unis.body.length).toBeGreaterThan(0);
    expect(unis.body.every((l: { kind: string }) => l.kind === 'UNIVERSITY')).toBe(true);
    const wild = await search('%');
    expect(wild.body).toEqual([]);
  });

  it('keeps one HOME per user and protects other users’ places', async () => {
    const [b2] = (await search('Smart Village B2')).body;
    const [gate13] = (await search('Rehab Gate 13')).body;

    const home1 = await request(server).post('/v1/me/saved-locations').set(auth(token)).send({ label: 'HOME', locationId: gate13.id }).expect(201);
    const home2 = await request(server)
      .post('/v1/me/saved-locations')
      .set(auth(token))
      .send({ label: 'HOME', locationId: b2.id, pickupNote: 'Gate 2' })
      .expect(201);
    expect(home2.body.id).toBe(home1.body.id); // replaced, not duplicated
    expect(home2.body.pickupNote).toBe('Gate 2');

    const list = await request(server).get('/v1/me/saved-locations').set(auth(token)).expect(200);
    expect(list.body.filter((s: { label: string }) => s.label === 'HOME')).toHaveLength(1);

    const other = await loginWithProfile(app);
    await request(server).delete(`/v1/me/saved-locations/${home2.body.id}`).set(auth(other.accessToken)).expect(404);
    await request(server).delete(`/v1/me/saved-locations/${home2.body.id}`).set(auth(token)).expect(204);
  });

  it('rejects coordinates outside Egypt', async () => {
    const r = await request(server)
      .post('/v1/me/saved-locations')
      .set(auth(token))
      .send({ label: 'OTHER', customName: 'Paris', lat: 48.85, lng: 2.35 })
      .expect(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('reports the health of the database', async () => {
    const r = await request(server).get('/v1/health').expect(200);
    expect(r.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
