import { describe, expect, it } from 'vitest';
import { distanceKm, formatEgp, normalizePlateLetters, priceLimitsEgp, PLATE_LETTERS_RE } from './rides';
import { rideSearchSchema, vehicleSchema } from './schemas';

describe('distanceKm', () => {
  it('matches known Cairo distances', () => {
    const tahrir = { lat: 30.0444, lng: 31.2357 };
    const smartVillage = { lat: 30.0715, lng: 31.017 };
    expect(distanceKm(tahrir, smartVillage)).toBeGreaterThan(20);
    expect(distanceKm(tahrir, smartVillage)).toBeLessThan(23);
    expect(distanceKm(tahrir, tahrir)).toBe(0);
  });
});

describe('priceLimitsEgp', () => {
  it('suggests a cost share and caps it', () => {
    const l = priceLimitsEgp(40); // ~52 road km
    expect(l.min).toBe(5);
    expect(l.suggested).toBe(40);
    expect(l.max).toBe(104);
  });
  it('lets short trips charge a small fixed amount', () => {
    expect(priceLimitsEgp(2)).toEqual({ min: 5, suggested: 10, max: 30 });
  });
  it('never suggests more than the cap', () => {
    for (const km of [0, 1, 5, 20, 80, 300]) {
      const l = priceLimitsEgp(km);
      expect(l.suggested).toBeLessThanOrEqual(l.max);
      expect(l.suggested).toBeGreaterThanOrEqual(l.min);
    }
  });
});

describe('plates', () => {
  it('normalises spacing', () => {
    expect(normalizePlateLetters('أبج')).toBe('أ ب ج');
    expect(normalizePlateLetters(' أ  ب ')).toBe('أ ب');
  });
  it('rejects Latin letters and too many letters', () => {
    expect(PLATE_LETTERS_RE.test('A B C')).toBe(false);
    expect(PLATE_LETTERS_RE.test('أ ب ج د')).toBe(false);
  });
  it('accepts Arabic-Indic digits', () => {
    const r = vehicleSchema.safeParse({ make: 'Kia', model: 'Rio', color: 'Red', year: 2018, seats: 3, plateLetters: 'س ط', plateDigits: '١٢٣' });
    expect(r.success && r.data.plateDigits).toBe('123');
  });
});

describe('formatEgp', () => {
  it('formats piasters in both languages', () => {
    expect(formatEgp(4500, 'en')).toBe('45 EGP');
    expect(formatEgp(4500, 'ar')).toBe('٤٥ ج.م');
  });
});

describe('rideSearchSchema', () => {
  it('needs both ends', () => {
    const r = rideSearchSchema.safeParse({ date: '2026-12-01', fromLat: 30, fromLng: 31 });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual(['SEARCH_PLACE_REQUIRED']);
  });
});
