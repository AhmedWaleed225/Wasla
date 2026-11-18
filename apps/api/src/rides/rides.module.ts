import { Module } from '@nestjs/common';
import { BookingExpiryService } from './booking-expiry.service';
import { BookingsService } from './bookings.service';
import { RidesController, VehiclesController } from './rides.controller';
import { RidesService } from './rides.service';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [VehiclesController, RidesController],
  providers: [VehiclesService, RidesService, BookingsService, BookingExpiryService],
  exports: [BookingsService],
})
export class RidesModule {}
