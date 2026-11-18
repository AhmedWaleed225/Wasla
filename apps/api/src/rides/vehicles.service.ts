import { HttpStatus, Injectable } from '@nestjs/common';
import type { VehicleData, VehicleDto } from '@wasla/shared';
import { AuditService } from '../audit/audit.service';
import { AppException, conflict, forbidden, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { isAnyUniqueViolation, toVehicleDto } from './ride-mapper';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async requireDriver(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { roles: true } });
    if (!user.roles.includes('DRIVER')) throw forbidden('DRIVER_ROLE_REQUIRED');
  }

  async list(userId: string): Promise<VehicleDto[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { ownerId: userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((v) => toVehicleDto(v, true));
  }

  async add(userId: string, input: VehicleData): Promise<VehicleDto> {
    await this.requireDriver(userId);
    try {
      const v = await this.prisma.vehicle.create({ data: { ownerId: userId, ...input } });
      await this.audit.record({ actorType: 'USER', actorId: userId, action: 'VEHICLE_ADDED', entityType: 'vehicle', entityId: v.id });
      return toVehicleDto(v, true);
    } catch (err) {
      if (isAnyUniqueViolation(err)) throw conflict('VEHICLE_PLATE_TAKEN');
      throw err;
    }
  }

  async update(userId: string, id: string, input: VehicleData): Promise<VehicleDto> {
    const existing = await this.prisma.vehicle.findFirst({ where: { id, ownerId: userId, isActive: true } });
    if (!existing) throw notFound('VEHICLE_NOT_FOUND');
    // A car with upcoming rides keeps its seat count, so booked passengers aren't stranded.
    if (input.seats < existing.seats) {
      const maxOffered = await this.prisma.ride.aggregate({
        where: { vehicleId: id, status: 'SCHEDULED' },
        _max: { seatsTotal: true },
      });
      if ((maxOffered._max.seatsTotal ?? 0) > input.seats) throw conflict('VEHICLE_IN_USE');
    }
    try {
      const v = await this.prisma.vehicle.update({ where: { id }, data: input });
      return toVehicleDto(v, true);
    } catch (err) {
      if (isAnyUniqueViolation(err)) throw conflict('VEHICLE_PLATE_TAKEN');
      throw err;
    }
  }

  /** Soft delete: past rides still point at the car. */
  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.vehicle.findFirst({ where: { id, ownerId: userId, isActive: true } });
    if (!existing) throw notFound('VEHICLE_NOT_FOUND');
    const upcoming = await this.prisma.ride.count({ where: { vehicleId: id, status: 'SCHEDULED' } });
    if (upcoming > 0) throw new AppException('VEHICLE_IN_USE', HttpStatus.CONFLICT);
    await this.prisma.vehicle.update({ where: { id }, data: { isActive: false } });
    await this.audit.record({ actorType: 'USER', actorId: userId, action: 'VEHICLE_REMOVED', entityType: 'vehicle', entityId: id });
  }
}
