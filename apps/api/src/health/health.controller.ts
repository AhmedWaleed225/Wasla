import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/auth.guard';
import { AppException } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException('INTERNAL_ERROR', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', database: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
