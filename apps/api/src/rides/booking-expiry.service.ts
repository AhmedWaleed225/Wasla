import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { BookingsService } from './bookings.service';

/**
 * Every minute, lapses booking requests the driver didn't answer in time and
 * frees their seats. Off in tests (they call BookingsService.expireDue directly).
 * Several API instances may run this together: each booking is re-checked under a row lock.
 */
@Injectable()
export class BookingExpiryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('BookingExpiry');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bookings: BookingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.bookings.expireDue();
      if (n > 0) this.logger.log(`Expired ${n} unanswered booking request(s)`);
    } catch (err) {
      this.logger.error({ err }, 'Booking expiry run failed');
    } finally {
      this.running = false;
    }
  }
}
