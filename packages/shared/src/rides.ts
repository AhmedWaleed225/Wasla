/**
 * Ride and booking rules shared by the API (which enforces them) and the apps
 * (which use them only to guide input). Changing a number here changes both.
 */

export const RIDE_RULES = {
  /** A ride must be published at least this long before it leaves. */
  minLeadMinutes: 30,
  /** …and no further ahead than this. */
  maxDaysAhead: 30,
  /** Origin and destination must be at least this far apart (straight line). */
  minDistanceKm: 1,
  /** Passenger seats a car can offer. */
  maxSeats: 6,
  /** Seats one passenger can take in one booking. */
  maxSeatsPerBooking: 4,
  /** A driver cannot have two scheduled rides leaving closer together than this. */
  driverOverlapMinutes: 60,
  /** A booking request the driver hasn't answered expires after this (or at departure, if sooner). */
  pendingRequestTtlHours: 12,
  notesMax: 280,
} as const;

export const SEARCH_RULES = {
  defaultRadiusKm: 5,
  maxRadiusKm: 25,
  maxResults: 50,
} as const;

/**
 * Wasla is cost sharing, not a taxi service: drivers may cover their costs but
 * not run a business. Prices are per seat, in whole Egyptian pounds.
 * Assumptions (adjust here): roads are ~30% longer than the straight line;
 * a fair share is ~0.75 EGP per road km; the cap is 2 EGP per road km.
 */
export const PRICE_RULES = {
  roadFactor: 1.3,
  suggestedEgpPerKm: 0.75,
  maxEgpPerKm: 2,
  minEgp: 5,
  minSuggestedEgp: 10,
  /** Short trips may always charge up to this, whatever the distance. */
  floorCapEgp: 30,
} as const;

export interface PriceLimits {
  min: number;
  suggested: number;
  max: number;
}

export function priceLimitsEgp(straightLineKm: number): PriceLimits {
  const roadKm = Math.max(0, straightLineKm) * PRICE_RULES.roadFactor;
  const max = Math.max(PRICE_RULES.floorCapEgp, Math.ceil(roadKm * PRICE_RULES.maxEgpPerKm));
  const rawSuggested = Math.round((roadKm * PRICE_RULES.suggestedEgpPerKm) / 5) * 5;
  const suggested = Math.min(max, Math.max(PRICE_RULES.minSuggestedEgp, rawSuggested));
  return { min: PRICE_RULES.minEgp, suggested, max };
}

/** Great-circle distance in kilometres (same formula as the SQL function wasla_distance_km). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const PIASTERS_PER_EGP = 100;

/** "45 EGP" / "٤٥ ج.م" — amounts are stored in piasters. */
export function formatEgp(piasters: number, locale: 'ar' | 'en'): string {
  const egp = piasters / PIASTERS_PER_EGP;
  const n = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(egp);
  return locale === 'ar' ? `${n} ج.م` : `${n} EGP`;
}

/** Egyptian private-car plates: up to 3 Arabic letters and up to 4 digits. */
export const PLATE_LETTERS_RE = /^[ء-ي](?: ?[ء-ي]){0,2}$/u;
export const PLATE_DIGITS_RE = /^\d{1,4}$/;

/** "ا ب ج" — one space between letters, as painted on the plate. */
export function normalizePlateLetters(input: string): string {
  return input.replace(/\s+/g, '').split('').join(' ');
}
