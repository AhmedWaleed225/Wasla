import { Global, Injectable, Logger, Module } from '@nestjs/common';
import type { ActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Append-only audit trail. Never put secrets, codes or tokens in metadata. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    try {
      await db.auditLog.create({ data: { ...entry, actorId: entry.actorId ?? null, ip: entry.ip ?? null } });
    } catch (err) {
      // Inside a transaction the caller must see the failure; outside, never break the request.
      if (tx) throw err;
      this.logger.error({ err, action: entry.action }, 'Failed to write audit log');
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
