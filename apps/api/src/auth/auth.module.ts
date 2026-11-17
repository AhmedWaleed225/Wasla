import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { MockOtpSender, OTP_SENDER } from './otp/otp-provider';
import { OtpService } from './otp/otp.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'wasla-api' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'wasla-api' },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokensService,
    {
      provide: OTP_SENDER,
      inject: [ENV],
      // Config validation already guarantees only "mock" can reach here in Phase 2.
      useFactory: (env: Env) => {
        if (env.OTP_PROVIDER === 'mock') return new MockOtpSender();
        throw new Error(`OTP provider "${env.OTP_PROVIDER}" is not implemented`);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokensService],
})
export class AuthModule {}
