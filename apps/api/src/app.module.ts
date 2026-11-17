import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { HealthModule } from './health/health.controller';
import { LocationsModule } from './locations/locations.module';
import { PrismaModule } from './prisma/prisma.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
          genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
          // Never log credentials, tokens or one-time codes.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.code', 'req.body.refreshToken', 'res.body'],
            censor: '[redacted]',
          },
          transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        },
      }),
    }),
    // In-memory limits for a single instance; moves to Redis storage before horizontal scaling.
    // Per-IP limits are skipped in automated tests (all requests share one IP);
    // the per-phone OTP limits in OtpService still apply there.
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => env.NODE_ENV === 'test',
      }),
    }),
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    LocationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
