import type {
  BookingMode,
  BookingStatus,
  Gender,
  Locale,
  LocationKind,
  NotificationType,
  PaymentMethod,
  RatingTag,
  ReportReason,
  ReportStatus,
  AdminRole,
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
  /** Shown once the person has at least 3 ratings (TRUST_RULES.minRatingsToShowAverage). */
  ratingAverage: number | null;
  ratingCount: number;
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

// ---------- Messaging & notifications ----------

export interface NotificationDto {
  id: string;
  type: NotificationType;
  rideId: string | null;
  bookingId: string | null;
  /** Values for the message template: name, from, to, departureAt (ISO). */
  data: { name?: string; fromEn?: string; fromAr?: string; toEn?: string; toAr?: string; departureAt?: string };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPageDto {
  items: NotificationDto[];
  unreadCount: number;
  /** Pass as `before` to load older items; null when there are no more. */
  nextBefore: string | null;
}

export interface MessageDto {
  id: string;
  bookingId: string;
  senderId: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface ConversationDto {
  bookingId: string;
  bookingStatus: BookingStatus;
  /** Whether new messages can still be sent. */
  open: boolean;
  role: 'driver' | 'passenger';
  other: PublicUserDto;
  ride: { id: string; departureAt: string; origin: PlacePointDto; destination: PlacePointDto; status: RideStatus };
  lastMessage: MessageDto | null;
  unreadCount: number;
}

export interface MessagePageDto {
  items: MessageDto[]; // oldest first
  open: boolean;
  /** The other person's last read time, for "seen" marks. */
  otherReadAt: string | null;
}

// ---------- Trust & safety ----------

export interface RatingDto {
  id: string;
  bookingId: string;
  stars: number;
  tags: RatingTag[];
  comment: string | null;
  createdAt: string;
}

/** What the rate screen needs: who you're rating, whether you still can, and what you gave. */
export interface RatingStatusDto {
  bookingId: string;
  role: 'driver' | 'passenger'; // the person being rated
  ratee: PublicUserDto;
  canRate: boolean;
  /** Last moment a rating is accepted. */
  deadline: string | null;
  mine: RatingDto | null;
}

export interface ReportDto {
  id: string;
  bookingId: string | null;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
}

export interface BlockedUserDto {
  user: PublicUserDto;
  blockedAt: string;
}

// ---------- Admin console ----------

export interface AdminMeDto {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

export interface AdminOverviewDto {
  users: { total: number; newLast7Days: number; drivers: number; suspended: number };
  rides: { upcoming: number; departingToday: number; completedLast7Days: number };
  bookings: { today: number; last7Days: { date: string; count: number }[] };
  reports: { open: number; urgentOpen: number };
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminUserRowDto {
  id: string;
  displayName: string;
  /** Masked unless the admin's role may see contact details. */
  phone: string;
  roles: string[];
  status: string;
  ratingAverage: number | null;
  ratingCount: number;
  ridesCompleted: number;
  openReportsAgainst: number;
  createdAt: string;
}

export interface AdminUserDetailDto extends AdminUserRowDto {
  fullName: string | null;
  gender: string | null;
  suspendedReason: string | null;
  vehicles: VehicleDto[];
  recentRatings: (RatingDto & { raterName: string })[];
  reportsAgainst: AdminReportRowDto[];
  reportsFiled: AdminReportRowDto[];
  recentRides: { id: string; departureAt: string; status: string; route: string; seatsTotal: number; seatsAvailable: number }[];
  recentBookings: { id: string; rideId: string; status: string; departureAt: string; route: string }[];
}

export interface AdminRideRowDto {
  id: string;
  departureAt: string;
  status: string;
  route: string;
  driver: { id: string; displayName: string };
  seatsTotal: number;
  seatsAvailable: number;
  pricePerSeatPiasters: number;
  bookingMode: string;
  womenOnly: boolean;
}

export interface AdminRideDetailDto extends AdminRideRowDto {
  vehicle: VehicleDto;
  notes: string | null;
  cancelReason: string | null;
  bookings: { id: string; status: string; seats: number; totalPiasters: number; passenger: { id: string; displayName: string }; createdAt: string }[];
}

export interface AdminReportRowDto {
  id: string;
  reason: ReportReason;
  status: ReportStatus;
  urgent: boolean;
  reporter: { id: string; displayName: string };
  reported: { id: string; displayName: string; status: string };
  bookingId: string | null;
  createdAt: string;
}

export interface AdminReportDetailDto extends AdminReportRowDto {
  details: string | null;
  adminNote: string | null;
  handledBy: string | null;
  resolvedAt: string | null;
  ride: AdminRideRowDto | null;
  /** The booking's chat, for roles allowed to see it. Viewing it is audited. */
  messages: { senderId: string; body: string; createdAt: string }[] | null;
}

export interface AdminAuditRowDto {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}
