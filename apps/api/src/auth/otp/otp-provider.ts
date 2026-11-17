import { Injectable, Logger } from '@nestjs/common';
import type { Locale } from '@wasla/shared';

/** Delivers one-time codes. Real providers (SMS/WhatsApp) implement this in Phase 4. */
export interface OtpSender {
  readonly name: string;
  send(phoneE164: string, code: string, locale: Locale): Promise<void>;
}

export const OTP_SENDER = Symbol('OTP_SENDER');

/**
 * Development-only sender: writes the code to the API log instead of sending
 * an SMS. Config validation (src/config/env.ts) refuses to start the API with
 * this provider when NODE_ENV=production.
 */
@Injectable()
export class MockOtpSender implements OtpSender {
  readonly name = 'mock';
  private readonly logger = new Logger('MockOtp');

  async send(phoneE164: string, code: string): Promise<void> {
    this.logger.warn(`[DEV ONLY] OTP for ${phoneE164}: ${code}`);
  }
}
