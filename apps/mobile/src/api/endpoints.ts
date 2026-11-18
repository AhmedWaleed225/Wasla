import type {
  BookingDto,
  CancelInput,
  CreateBookingInput,
  CreateRideInput,
  CreateProfileInput,
  ListScope,
  RideDetailDto,
  RideSearchInput,
  RideSearchResultDto,
  RideSummaryDto,
  UpdateRideInput,
  VehicleDto,
  VehicleInput,
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

export const vehiclesApi = {
  list: () => api<VehicleDto[]>('/me/vehicles'),
  add: (input: VehicleInput) => api<VehicleDto>('/me/vehicles', { method: 'POST', body: input }),
  update: (id: string, input: VehicleInput) => api<VehicleDto>(`/me/vehicles/${id}`, { method: 'PUT', body: input }),
  remove: (id: string) => api<void>(`/me/vehicles/${id}`, { method: 'DELETE' }),
};

export const ridesApi = {
  search: (q: RideSearchInput) =>
    api<RideSearchResultDto>('/rides/search', { query: q as Record<string, string | number | undefined> }),
  publish: (input: CreateRideInput) => api<RideDetailDto>('/rides', { method: 'POST', body: input }),
  get: (id: string) => api<RideDetailDto>(`/rides/${id}`),
  update: (id: string, input: UpdateRideInput) => api<RideDetailDto>(`/rides/${id}`, { method: 'PATCH', body: input }),
  cancel: (id: string, input: CancelInput = {}) => api<RideDetailDto>(`/rides/${id}/cancel`, { method: 'POST', body: input }),
  complete: (id: string) => api<RideDetailDto>(`/rides/${id}/complete`, { method: 'POST' }),
  mine: (scope: ListScope) => api<RideSummaryDto[]>('/me/rides', { query: { scope } }),
};

export const bookingsApi = {
  /** `idempotencyKey` stays the same for every retry of one booking attempt. */
  create: (rideId: string, input: CreateBookingInput, idempotencyKey: string) =>
    api<BookingDto>(`/rides/${rideId}/bookings`, { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } }),
  mine: (scope: ListScope) => api<BookingDto[]>('/me/bookings', { query: { scope } }),
  get: (id: string) => api<BookingDto>(`/bookings/${id}`),
  cancel: (id: string, input: CancelInput = {}) => api<BookingDto>(`/bookings/${id}/cancel`, { method: 'POST', body: input }),
  accept: (id: string) => api<BookingDto>(`/bookings/${id}/accept`, { method: 'POST' }),
  decline: (id: string) => api<BookingDto>(`/bookings/${id}/decline`, { method: 'POST' }),
};
