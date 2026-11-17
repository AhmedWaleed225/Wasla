import type { Gender, Locale, LocationKind, SavedLocationLabel, UserRole, UserStatus } from './enums';
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
