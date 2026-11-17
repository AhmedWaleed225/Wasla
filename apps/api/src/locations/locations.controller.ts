import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  locationSearchSchema,
  savedLocationSchema,
  type LocationDto,
  type SavedLocationDto,
  type SavedLocationInput,
} from '@wasla/shared';
import type { z } from 'zod';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { notFound } from '../common/app-exception';
import { ZodPipe } from '../common/zod-validation.pipe';
import { LocationsService } from './locations.service';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => notFound() });

@ApiTags('locations')
@ApiBearerAuth()
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  /** Search Egyptian places by landmark, compound, area or gate, in Arabic or English. */
  @Get('locations/search')
  search(@Query(new ZodPipe(locationSearchSchema)) q: z.output<typeof locationSearchSchema>): Promise<LocationDto[]> {
    return this.locations.search(q.q, q.kinds, q.limit);
  }

  @Get('locations/:id')
  get(@Param('id', uuid) id: string): Promise<LocationDto> {
    return this.locations.getById(id);
  }

  @Get('me/saved-locations')
  listSaved(@CurrentUser() user: AuthContext): Promise<SavedLocationDto[]> {
    return this.locations.listSaved(user.userId);
  }

  @Post('me/saved-locations')
  save(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(savedLocationSchema)) body: SavedLocationInput,
  ): Promise<SavedLocationDto> {
    return this.locations.save(user.userId, body);
  }

  @Delete('me/saved-locations/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthContext, @Param('id', uuid) id: string): Promise<void> {
    await this.locations.removeSaved(user.userId, id);
  }
}
