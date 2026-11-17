import { Injectable } from '@nestjs/common';
import { Prisma, type LocationKind, type SavedLocationLabel } from '@prisma/client';
import type { LocationDto, SavedLocationDto, SavedLocationInput } from '@wasla/shared';
import { badRequest, notFound } from '../common/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { SQL_STRIP_CLASS, SQL_TRANSLATE_FROM, SQL_TRANSLATE_TO, normalizeForSearch } from './arabic-normalize';

interface LocationRow {
  id: string;
  kind: LocationKind;
  name_en: string;
  name_ar: string;
  parent_name_en: string | null;
  parent_name_ar: string | null;
  lat: number | null;
  lng: number | null;
}

const toDto = (r: LocationRow): LocationDto => ({
  id: r.id,
  kind: r.kind,
  nameEn: r.name_en,
  nameAr: r.name_ar,
  parentNameEn: r.parent_name_en,
  parentNameAr: r.parent_name_ar,
  lat: r.lat,
  lng: r.lng,
});

/** SQL fragment applying the same normalisation as normalizeForSearch(). */
const norm = (column: Prisma.Sql) =>
  Prisma.sql`translate(regexp_replace(lower(${column}), ${SQL_STRIP_CLASS}, '', 'g'), ${SQL_TRANSLATE_FROM}, ${SQL_TRANSLATE_TO})`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Landmark-first search across English names, Arabic names and aliases.
   * Every word of the query must appear somewhere in the place's names or aliases, in any order,
   * so "Smart Village B2" finds "Smart Village — Building B2".
   * Ranking: whole-phrase prefix > phrase at a word start > phrase anywhere > words only, then popularity.
   */
  async search(q: string, kinds: string[] | undefined, limit: number): Promise<LocationDto[]> {
    const term = normalizeForSearch(q);
    if (!term) return [];
    const words = [...new Set(term.split(' ').filter(Boolean))].slice(0, 6);
    const contains = `%${escapeLike(term)}%`;
    const prefix = `${escapeLike(term)}%`;
    const wordPrefix = `% ${escapeLike(term)}%`;

    const nameEn = norm(Prisma.sql`l.name_en`);
    const nameAr = norm(Prisma.sql`l.name_ar`);
    const alias = norm(Prisma.sql`a`);
    const haystack = norm(Prisma.sql`concat_ws(' ', l.name_en, l.name_ar, array_to_string(l.aliases, ' '))`);
    const everyWord = Prisma.join(
      words.map((w) => Prisma.sql`${haystack} LIKE ${`%${escapeLike(w)}%`}`),
      ' AND ',
    );
    const kindFilter =
      kinds && kinds.length > 0 ? Prisma.sql`AND l.kind::text IN (${Prisma.join(kinds)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<LocationRow[]>`
      SELECT l.id, l.kind, l.name_en, l.name_ar, l.lat, l.lng,
             p.name_en AS parent_name_en, p.name_ar AS parent_name_ar
      FROM locations l
      LEFT JOIN locations p ON p.id = l.parent_id
      WHERE l.is_active
        ${kindFilter}
        AND (${everyWord})
      ORDER BY
        CASE
          WHEN ${nameEn} LIKE ${prefix} OR ${nameAr} LIKE ${prefix}
            OR EXISTS (SELECT 1 FROM unnest(l.aliases) a WHERE ${alias} LIKE ${prefix}) THEN 0
          WHEN ${nameEn} LIKE ${wordPrefix} OR ${nameAr} LIKE ${wordPrefix} THEN 1
          WHEN ${haystack} LIKE ${contains} THEN 2
          ELSE 3
        END,
        l.popularity DESC,
        l.name_en ASC
      LIMIT ${limit}
    `;
    return rows.map(toDto);
  }

  async getById(id: string): Promise<LocationDto> {
    const rows = await this.prisma.$queryRaw<LocationRow[]>`
      SELECT l.id, l.kind, l.name_en, l.name_ar, l.lat, l.lng,
             p.name_en AS parent_name_en, p.name_ar AS parent_name_ar
      FROM locations l LEFT JOIN locations p ON p.id = l.parent_id
      WHERE l.id = ${id}::uuid AND l.is_active
    `;
    if (!rows[0]) throw notFound('LOCATION_NOT_FOUND');
    return toDto(rows[0]);
  }

  // ---------- Saved places ----------

  private async savedToDto(s: { id: string; label: SavedLocationLabel; customName: string | null; locationId: string | null; lat: number; lng: number; pickupNote: string | null }): Promise<SavedLocationDto> {
    return {
      id: s.id,
      label: s.label,
      customName: s.customName,
      location: s.locationId ? await this.getById(s.locationId).catch(() => null) : null,
      lat: s.lat,
      lng: s.lng,
      pickupNote: s.pickupNote,
    };
  }

  async listSaved(userId: string): Promise<SavedLocationDto[]> {
    const rows = await this.prisma.savedLocation.findMany({ where: { userId }, orderBy: [{ label: 'asc' }, { createdAt: 'asc' }] });
    return Promise.all(rows.map((r) => this.savedToDto(r)));
  }

  /** HOME and WORK are one-per-user (replaced on save); OTHER places are added. */
  async save(userId: string, input: SavedLocationInput): Promise<SavedLocationDto> {
    let lat = input.lat;
    let lng = input.lng;
    if (input.locationId) {
      const loc = await this.prisma.location.findFirst({ where: { id: input.locationId, isActive: true } });
      if (!loc) throw notFound('LOCATION_NOT_FOUND');
      if (loc.lat === null || loc.lng === null) throw badRequest('LOCATION_REQUIRED');
      lat ??= loc.lat;
      lng ??= loc.lng;
    }
    if (lat === undefined || lng === undefined) throw badRequest('LOCATION_REQUIRED');

    const label = input.label as SavedLocationLabel;
    const data = {
      label,
      customName: label === 'OTHER' ? (input.customName ?? null) : null,
      locationId: input.locationId ?? null,
      lat,
      lng,
      pickupNote: input.pickupNote ?? null,
    };

    const saved = await this.prisma.$transaction(async (tx) => {
      if (label !== 'OTHER') {
        const existing = await tx.savedLocation.findFirst({ where: { userId, label } });
        if (existing) return tx.savedLocation.update({ where: { id: existing.id }, data });
      }
      return tx.savedLocation.create({ data: { userId, ...data } });
    });
    return this.savedToDto(saved);
  }

  async removeSaved(userId: string, id: string): Promise<void> {
    // Scoped by owner: another user's id is indistinguishable from a missing one.
    const result = await this.prisma.savedLocation.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw notFound();
  }
}
