import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';

export const FIXED_CODE = '123456';

export async function createApp(overrides: { provide: unknown; useValue: unknown }[] = []) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

let counter = 0;
/** A fresh, valid Egyptian test number per call (+20 15 9xxx xxxx range) so tests don't share OTP limits. */
export function freshPhone(): string {
  counter += 1;
  const n = (Date.now() % 1_000_000) * 100 + counter;
  return `+2015${String(9_000_0000 + (n % 1_000_0000)).padStart(8, '0')}`;
}

export async function login(app: NestExpressApplication, phone = freshPhone()) {
  const server = app.getHttpServer();
  await request(server).post('/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(server).post('/v1/auth/otp/verify').send({ phone, code: FIXED_CODE }).expect(200);
  return {
    phone,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    userId: res.body.user.id as string,
    body: res.body,
  };
}

export async function loginWithProfile(app: NestExpressApplication, overrides: Record<string, unknown> = {}) {
  const session = await login(app);
  await request(app.getHttpServer())
    .post('/v1/me/profile')
    .set('Authorization', `Bearer ${session.accessToken}`)
    .send({ fullName: 'Test Rider', dateOfBirth: '1995-05-05', gender: 'FEMALE', ...overrides })
    .expect(201);
  return session;
}

// ---------- Rides ----------

const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const pick = () => ARABIC[Math.floor(Math.random() * ARABIC.length)]!;
/** The test database keeps data between runs, so plates are random. */
export const randomPlate = () => ({
  plateLetters: `${pick()} ${pick()} ${pick()}`,
  plateDigits: String(1000 + Math.floor(Math.random() * 9000)),
});

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/** A signed-in driver with a car. */
export async function makeDriver(app: NestExpressApplication, gender: 'FEMALE' | 'MALE' = 'MALE', seats = 4, fullName = 'Driver Test') {
  const s = await loginWithProfile(app, { gender, fullName });
  const server = app.getHttpServer();
  await request(server).post('/v1/me/roles/driver').set(bearer(s.accessToken)).expect(201);
  const v = await request(server)
    .post('/v1/me/vehicles')
    .set(bearer(s.accessToken))
    .send({ make: 'Hyundai', model: 'Elantra', color: 'Silver', year: 2019, seats, ...randomPlate() })
    .expect(201);
  return { ...s, vehicleId: v.body.id as string };
}

/** Publishes Smart Village B2 -> CFC Gate 4, about a day ahead. */
export async function publishRide(
  app: NestExpressApplication,
  prisma: { location: { findUniqueOrThrow: (a: { where: { slug: string } }) => Promise<{ id: string }> } },
  d: { accessToken: string; vehicleId: string },
  overrides: Record<string, unknown> = {},
) {
  const [from, to] = await Promise.all([
    prisma.location.findUniqueOrThrow({ where: { slug: 'giza.smart-village.b2' } }),
    prisma.location.findUniqueOrThrow({ where: { slug: 'cairo.new-cairo.cfc.gate-4' } }),
  ]);
  const res = await request(app.getHttpServer())
    .post('/v1/rides')
    .set(bearer(d.accessToken))
    .send({
      vehicleId: d.vehicleId,
      origin: { locationId: from.id },
      destination: { locationId: to.id },
      departureAt: new Date(Date.now() + 26 * 3_600_000).toISOString(),
      seats: 3,
      pricePerSeatEgp: 60,
      ...overrides,
    })
    .expect(201);
  return res.body as { id: string; departureAt: string };
}

/** Passenger books, the ride "leaves", the driver marks it done. Returns the booking id. */
export async function completedBooking(
  app: NestExpressApplication,
  prisma: { ride: { update: (a: { where: { id: string }; data: { departureAt: Date } }) => Promise<unknown> } },
  driver: { accessToken: string },
  rideId: string,
  passengerToken: string,
): Promise<string> {
  const server = app.getHttpServer();
  const b = await request(server).post(`/v1/rides/${rideId}/bookings`).set(bearer(passengerToken)).send({}).expect(201);
  await prisma.ride.update({ where: { id: rideId }, data: { departureAt: new Date(Date.now() - 3_600_000) } });
  await request(server).post(`/v1/rides/${rideId}/complete`).set(bearer(driver.accessToken)).expect(200);
  return b.body.id as string;
}
