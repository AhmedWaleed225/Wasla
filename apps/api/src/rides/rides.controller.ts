import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  cancelSchema,
  createBookingSchema,
  createRideSchema,
  idempotencyKeySchema,
  listScopeSchema,
  rideSearchSchema,
  updateRideSchema,
  vehicleSchema,
  type BookingDto,
  type CancelInput,
  type CreateRideData,
  type RideDetailDto,
  type RideSearchQuery,
  type RideSearchResultDto,
  type RideSummaryDto,
  type UpdateRideInput,
  type VehicleData,
  type VehicleDto,
} from '@wasla/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { notFound } from '../common/app-exception';
import { ZodPipe } from '../common/zod-validation.pipe';
import { BookingsService } from './bookings.service';
import { RidesService } from './rides.service';
import { VehiclesService } from './vehicles.service';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => notFound() });
type Scope = z.output<typeof listScopeSchema>;

@ApiTags('vehicles')
@ApiBearerAuth()
@Controller('me/vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: AuthContext): Promise<VehicleDto[]> {
    return this.vehicles.list(user.userId);
  }

  @Post()
  add(@CurrentUser() user: AuthContext, @Body(new ZodPipe(vehicleSchema)) body: VehicleData): Promise<VehicleDto> {
    return this.vehicles.add(user.userId, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(vehicleSchema)) body: VehicleData,
  ): Promise<VehicleDto> {
    return this.vehicles.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<void> {
    return this.vehicles.remove(user.userId, id);
  }
}

@ApiTags('rides')
@ApiBearerAuth()
@Controller()
export class RidesController {
  constructor(
    private readonly rides: RidesService,
    private readonly bookings: BookingsService,
  ) {}

  /** Passenger search: rides on a day whose start and end are near what was searched. */
  @Get('rides/search')
  search(@CurrentUser() user: AuthContext, @Query(new ZodPipe(rideSearchSchema)) q: RideSearchQuery): Promise<RideSearchResultDto> {
    return this.rides.search(user.userId, q);
  }

  @Post('rides')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: AuthContext, @Body(new ZodPipe(createRideSchema)) body: CreateRideData): Promise<RideDetailDto> {
    return this.rides.create(user.userId, body);
  }

  @Get('rides/:id')
  detail(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<RideDetailDto> {
    return this.rides.detail(user.userId, id);
  }

  @Patch('rides/:id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateRideSchema)) body: UpdateRideInput,
  ): Promise<RideDetailDto> {
    return this.rides.update(user.userId, id, body);
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(cancelSchema)) body: CancelInput,
  ): Promise<RideDetailDto> {
    return this.rides.cancel(user.userId, id, body.reason);
  }

  @Post('rides/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<RideDetailDto> {
    return this.rides.complete(user.userId, id);
  }

  @Get('me/rides')
  myRides(@CurrentUser() user: AuthContext, @Query(new ZodPipe(listScopeSchema)) q: Scope): Promise<RideSummaryDto[]> {
    return this.rides.listMine(user.userId, q.scope);
  }

  /**
   * Book seats. Send a fresh random `Idempotency-Key` per attempt: a retry with the
   * same key returns the original booking (200) instead of booking again (201).
   */
  @Post('rides/:id/bookings')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async book(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(createBookingSchema)) body: z.output<typeof createBookingSchema>,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookingDto> {
    const key = rawKey === undefined ? undefined : new ZodPipe(idempotencyKeySchema).transform(rawKey);
    const result = await this.bookings.create(user.userId, id, body, key);
    res.status(result.replayed ? 200 : 201);
    return result.booking;
  }

  @Get('me/bookings')
  myBookings(@CurrentUser() user: AuthContext, @Query(new ZodPipe(listScopeSchema)) q: Scope): Promise<BookingDto[]> {
    return this.bookings.listMine(user.userId, q.scope);
  }

  @Get('bookings/:id')
  booking(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<BookingDto> {
    return this.bookings.get(user.userId, id);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancelBooking(
    @CurrentUser() user: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(cancelSchema)) body: CancelInput,
  ): Promise<BookingDto> {
    return this.bookings.cancelByPassenger(user.userId, id, body.reason);
  }

  @Post('bookings/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<BookingDto> {
    return this.bookings.decide(user.userId, id, true);
  }

  @Post('bookings/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<BookingDto> {
    return this.bookings.decide(user.userId, id, false);
  }
}
