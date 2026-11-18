import type {
  BookingMode,
  BookingStatus,
  Gender,
  Locale,
  LocationKind,
  PaymentMethod,
  RideStatus,
  SavedLocationLabel,
  UserRole,
  UserStatus,
} from './enums';
import type { PriceLimits } from './rides';
import type { RidePreferences } from './schemas';

/** Response shapes returned by the API (v1). */

export interface ProfileDto {
  fullName: string;
  displayName: string; // "Nour E." unless the user chose to show the full last name
  dateOfBirth: string; // YYYY-MM-DD — only ever returned to the owner
  gender: Gender;
  bio: string | null;
  photoUrl: string | null;
  preferences: RidePreferences;
  showGender: boolean;
  showFullLastName: boolean;
}

export interface MeDto {
  id: string;
  phone: string; // E.164, only ever returned to the owner
  locale: Locale;
  roles: UserRole[];
  activeRole: UserRole;
  status: UserStatus;
  createdAt: string;
  profile: ProfileDto | null;
  stats: { ridesCompleted: number; ratingAverage: number | null; ratingCount: number };
}

export interface AuthTokensDto {
  accessToken: string;
  accessTokenExpiresIn: number; // seconds
  refreshToken: string;
}

export interface VerifyOtpResultDto extends AuthTokensDto {
  user: MeDto;
  isNewUser: boolean;
}

export interface RequestOtpResultDto {
  /** Seconds until another code may be requested. */
  resendAfter: number;
  /** Seconds the code stays valid. */
  expiresIn: number;
}

export interface LocationDto {
  id: string;
  kind: LocationKind;
  nameEn: string;
  nameAr: string;
  parentNameEn: string | null;
  parentNameAr: string | null;
  lat: number | null;
  lng: number | null;
}

export interface SavedLocationDto {
  id: string;
  label: SavedLocationLabel;
  customName: string | null;
  location: LocationDto | null;
  lat: number;
  lng: number;
  pickupNote: string | null;
}

// ---------- Rides ----------

export interface VehicleDto {
  id: string;
  make: string;
  model: string;
  color: string;
  year: number;
  seats: number;
  /** "ا ب ج 1234" — returned only to the owner and to confirmed passengers. */
  plate: string | null;
}

export interface PlacePointDto {
  locationId: string | null;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

/** What other users may see about a driver or passenger. Never phone, full name or birth date. */
export interface PublicUserDto {
  id: string;
  displayName: string;
  /** Only if the user chose to show it. */
  gender: Gender | null;
  memberSince: string;
  ridesCompleted: number;
  /** Ratings arrive in Phase 5. */
  ratingAverage: number | null;
}

export interface RideSummaryDto {
  id: string;
  status: RideStatus;
  departureAt: string; // ISO 8601, UTC
  origin: PlacePointDto;
  destination: PlacePointDto;
  distanceKm: number;
  pricePerSeatPiasters: number;
  currency: 'EGP';
  seatsTotal: number;
  seatsAvailable: number;
  bookingMode: BookingMode;
  womenOnly: boolean;
  driver: PublicUserDto;
  vehicle: VehicleDto;
  /** Search results only: how far the pickup and drop-off are from what was searched. */
  match?: { pickupKm: number; dropoffKm: number };
}

export interface BookingSummaryDto {
  id: string;
  rideId: string;
  status: BookingStatus;
  seats: number;
  pricePerSeatPiasters: number;
  totalPiasters: number;
  paymentMethod: PaymentMethod;
  pickupNote: string | null;
  /** Pending requests only: when the request lapses if the driver doesn't answer. */
  expiresAt: string | null;
  createdAt: string;
}

export interface DriverBookingDto extends BookingSummaryDto {
  passenger: PublicUserDto;
}

export interface RideDetailDto extends RideSummaryDto {
  notes: string | null;
  preferences: RidePreferences;
  priceLimits: PriceLimits;
  isMine: boolean;
  /** The viewer's own active or latest booking on this ride. */
  myBooking: BookingSummaryDto | null;
  /** Driver only. */
  bookings: DriverBookingDto[] | null;
  cancelReason: string | null;
}

export interface BookingDto extends BookingSummaryDto {
  ride: RideSummaryDto;
}

export interface RideSearchResultDto {
  rides: RideSummaryDto[];
  /** Resolved search ends, so the app can show what was searched. */
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}
