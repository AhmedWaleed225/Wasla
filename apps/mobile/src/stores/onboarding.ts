import type { Gender } from '@wasla/shared';
import { create } from 'zustand';

/** Answers collected across the profile-setup steps, sent to the API in one request at the end. */
interface OnboardingDraft {
  fullName: string;
  dateOfBirth: string;
  gender: Gender | null;
  setIdentity: (v: { fullName: string; dateOfBirth: string; gender: Gender }) => void;
}

export const useOnboarding = create<OnboardingDraft>((set) => ({
  fullName: '',
  dateOfBirth: '',
  gender: null,
  setIdentity: (v) => set(v),
}));
