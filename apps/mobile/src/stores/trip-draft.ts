import type { LocationDto } from '@wasla/shared';
import { create } from 'zustand';

/** Which place slot the location-search modal fills. */
export type DraftField = 'from' | 'to' | 'offerFrom' | 'offerTo';
export const DRAFT_FIELDS: DraftField[] = ['from', 'to', 'offerFrom', 'offerTo'];

/**
 * Places chosen on Home (searching) and on the Offer form (publishing), kept
 * across the location-search modal. Search date and seats live here too so
 * the results screen and Home stay in step.
 */
interface TripDraft {
  from: LocationDto | null;
  to: LocationDto | null;
  offerFrom: LocationDto | null;
  offerTo: LocationDto | null;
  /** YYYY-MM-DD, device-local (Egypt). */
  date: string;
  seats: number;
  set: (field: DraftField, loc: LocationDto) => void;
  swap: () => void;
  swapOffer: () => void;
  setDate: (date: string) => void;
  setSeats: (seats: number) => void;
}

export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const useTripDraft = create<TripDraft>((set) => ({
  from: null,
  to: null,
  offerFrom: null,
  offerTo: null,
  date: localDateString(),
  seats: 1,
  set: (field, loc) => set({ [field]: loc } as Partial<TripDraft>),
  swap: () => set((s) => ({ from: s.to, to: s.from })),
  swapOffer: () => set((s) => ({ offerFrom: s.offerTo, offerTo: s.offerFrom })),
  setDate: (date) => set({ date }),
  setSeats: (seats) => set({ seats }),
}));
