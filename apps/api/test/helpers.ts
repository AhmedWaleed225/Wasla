import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';

export const FIXED_CODE = '123456';

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
