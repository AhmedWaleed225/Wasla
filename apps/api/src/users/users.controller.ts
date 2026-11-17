import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';
import {
  createProfileSchema,
  setActiveRoleSchema,
  updateProfileSchema,
  type CreateProfileInput,
  type MeDto,
  type SetActiveRoleInput,
  type UpdateProfileInput,
} from '@wasla/shared';
import { AuthContext, CurrentUser } from '../auth/auth.guard';
import { ZodPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthContext): Promise<MeDto> {
    return this.users.getMe(user.userId);
  }

  /** First-time profile setup (name, date of birth, gender, preferences). */
  @Post('profile')
  createProfile(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(createProfileSchema)) body: CreateProfileInput,
  ): Promise<MeDto> {
    return this.users.createProfile(user.userId, body);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeDto> {
    return this.users.updateProfile(user.userId, body);
  }

  @Post('roles/driver')
  enableDriving(@CurrentUser() user: AuthContext): Promise<MeDto> {
    return this.users.enableDriving(user.userId);
  }

  @Put('active-role')
  setActiveRole(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(setActiveRoleSchema)) body: SetActiveRoleInput,
  ): Promise<MeDto> {
    return this.users.setActiveRole(user.userId, body.role as UserRole);
  }
}
