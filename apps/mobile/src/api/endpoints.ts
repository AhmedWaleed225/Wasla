import type {
  CreateProfileInput,
  LocationDto,
  MeDto,
  RequestOtpResultDto,
  SavedLocationDto,
  SavedLocationInput,
  UpdateProfileInput,
  UserRole,
  VerifyOtpResultDto,
} from '@wasla/shared';
import { api } from './client';

export const authApi = {
  requestOtp: (phone: string, locale: string) =>
    api<RequestOtpResultDto>('/auth/otp/request', { method: 'POST', body: { phone, locale }, auth: false }),
  verifyOtp: (phone: string, code: string, deviceName?: string) =>
    api<VerifyOtpResultDto>('/auth/otp/verify', { method: 'POST', body: { phone, code, deviceName }, auth: false }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
};

export const meApi = {
  get: () => api<MeDto>('/me'),
  createProfile: (input: CreateProfileInput) => api<MeDto>('/me/profile', { method: 'POST', body: input }),
  updateProfile: (input: UpdateProfileInput) => api<MeDto>('/me/profile', { method: 'PATCH', body: input }),
  enableDriving: () => api<MeDto>('/me/roles/driver', { method: 'POST' }),
  setActiveRole: (role: UserRole) => api<MeDto>('/me/active-role', { method: 'PUT', body: { role } }),
};

export const locationsApi = {
  search: (q: string, kinds?: string[]) =>
    api<LocationDto[]>('/locations/search', { query: { q, kinds: kinds?.join(','), limit: 20 } }),
  saved: () => api<SavedLocationDto[]>('/me/saved-locations'),
  save: (input: SavedLocationInput) => api<SavedLocationDto>('/me/saved-locations', { method: 'POST', body: input }),
  remove: (id: string) => api<void>(`/me/saved-locations/${id}`, { method: 'DELETE' }),
};
