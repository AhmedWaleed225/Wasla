import { Body, Controller, Get, HttpCode, Inject, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  adminLoginSchema,
  adminPageSchema,
  adminReasonSchema,
  adminUpdateReportSchema,
  type AdminAuditRowDto,
  type AdminLoginInput,
  type AdminMeDto,
  type AdminOverviewDto,
  type AdminPageQuery,
  type AdminReasonInput,
  type AdminReportDetailDto,
  type AdminReportRowDto,
  type AdminRideDetailDto,
  type AdminRideRowDto,
  type AdminUpdateReportInput,
  type AdminUserDetailDto,
  type AdminUserRowDto,
  type Paged,
} from '@wasla/shared';
import type { Request, Response } from 'express';
import { AuthModule } from '../auth/auth.module';
import { Public } from '../auth/auth.guard';
import { notFound } from '../common/app-exception';
import { ReqMeta, type RequestMeta } from '../common/request-meta';
import { ZodPipe } from '../common/zod-validation.pipe';
import { ENV, type Env } from '../config/env';
import { RidesModule } from '../rides/rides.module';
import { ADMIN_SESSION_HOURS, AdminAuthService, toAdminMe } from './admin-auth.service';
import { AdminGuard, AdminPerm, CurrentAdmin, checkCsrf, type AdminContext } from './admin.guard';
import { AdminService } from './admin.service';
import { clearedCookie, sessionCookie } from './cookies';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => notFound() });

/**
 * Console sign-in. Marked @Public() so the app's user guard skips it; staff
 * authentication is the session cookie set here.
 */
@ApiExcludeController()
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Req() req: Request,
    @Body(new ZodPipe(adminLoginSchema)) body: AdminLoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminMeDto> {
    checkCsrf(req);
    const { token, admin } = await this.auth.login(body.email, body.password, meta);
    res.setHeader('Set-Cookie', sessionCookie(token, ADMIN_SESSION_HOURS * 3600, this.env.NODE_ENV === 'production'));
    return admin;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  async logout(@CurrentAdmin() ctx: AdminContext, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(ctx.sessionId, ctx.admin.id, meta);
    res.setHeader('Set-Cookie', clearedCookie(this.env.NODE_ENV === 'production'));
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() ctx: AdminContext): AdminMeDto {
    return toAdminMe(ctx.admin);
  }
}

/** Staff-only endpoints. Every route names the permission it needs; see ADMIN_PERMISSIONS. */
@ApiExcludeController()
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @AdminPerm('viewOverview')
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  @Get('users')
  @AdminPerm('viewUsers')
  users(@CurrentAdmin() ctx: AdminContext, @Query(new ZodPipe(adminPageSchema)) q: AdminPageQuery): Promise<Paged<AdminUserRowDto>> {
    return this.admin.users(ctx.admin, q);
  }

  @Get('users/:id')
  @AdminPerm('viewUsers')
  user(@CurrentAdmin() ctx: AdminContext, @Param('id', uuid) id: string): Promise<AdminUserDetailDto> {
    return this.admin.user(ctx.admin, id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @AdminPerm('suspendUsers')
  suspend(
    @CurrentAdmin() ctx: AdminContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(adminReasonSchema)) body: AdminReasonInput,
  ): Promise<AdminUserDetailDto> {
    return this.admin.suspend(ctx.admin, id, body.reason);
  }

  @Post('users/:id/reinstate')
  @HttpCode(200)
  @AdminPerm('suspendUsers')
  reinstate(
    @CurrentAdmin() ctx: AdminContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(adminReasonSchema)) body: AdminReasonInput,
  ): Promise<AdminUserDetailDto> {
    return this.admin.reinstate(ctx.admin, id, body.reason);
  }

  @Get('rides')
  @AdminPerm('viewRides')
  rides(@Query(new ZodPipe(adminPageSchema)) q: AdminPageQuery): Promise<Paged<AdminRideRowDto>> {
    return this.admin.ridesList(q);
  }

  @Get('rides/:id')
  @AdminPerm('viewRides')
  ride(@Param('id', uuid) id: string): Promise<AdminRideDetailDto> {
    return this.admin.ride(id);
  }

  @Post('rides/:id/cancel')
  @HttpCode(200)
  @AdminPerm('cancelRides')
  cancelRide(
    @CurrentAdmin() ctx: AdminContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(adminReasonSchema)) body: AdminReasonInput,
  ): Promise<AdminRideDetailDto> {
    return this.admin.cancelRide(ctx.admin, id, body.reason);
  }

  @Get('reports')
  @AdminPerm('viewReports')
  reports(@Query(new ZodPipe(adminPageSchema)) q: AdminPageQuery): Promise<Paged<AdminReportRowDto>> {
    return this.admin.reports(q);
  }

  @Get('reports/:id')
  @AdminPerm('viewReports')
  report(@CurrentAdmin() ctx: AdminContext, @Param('id', uuid) id: string): Promise<AdminReportDetailDto> {
    return this.admin.report(ctx.admin, id);
  }

  @Patch('reports/:id')
  @AdminPerm('handleReports')
  updateReport(
    @CurrentAdmin() ctx: AdminContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(adminUpdateReportSchema)) body: AdminUpdateReportInput,
  ): Promise<AdminReportDetailDto> {
    return this.admin.updateReport(ctx.admin, id, body);
  }

  @Get('audit')
  @AdminPerm('viewAudit')
  audit(@Query(new ZodPipe(adminPageSchema)) q: AdminPageQuery): Promise<Paged<AdminAuditRowDto>> {
    return this.admin.auditLog(q);
  }
}

@Module({
  imports: [AuthModule, RidesModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminAuthService, AdminService, AdminGuard],
})
export class AdminModule {}
