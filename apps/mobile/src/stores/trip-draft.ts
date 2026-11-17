import type { LocationDto } from '@wasla/shared';
import { create } from 'zustand';

/** Pickup and destination chosen on Home, kept across the location-search modal. */
interface TripDraft {
  from: LocationDto | null;
  to: LocationDto | null;
  set: (field: 'from' | 'to', loc: LocationDto) => void;
  swap: () => void;
}

export const useTripDraft = create<TripDraft>((set) => ({
  from: null,
  to: null,
  set: (field, loc) => set({ [field]: loc } as Pick<TripDraft, 'from' | 'to'>),
  swap: () => set((s) => ({ from: s.to, to: s.from })),
}));
