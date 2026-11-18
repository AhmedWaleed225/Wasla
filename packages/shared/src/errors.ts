import type { Locale } from './enums';

/**
 * Every error the API returns has a stable `code`. Apps show the localized
 * message; logic must branch on the code, never on the message text.
 */
export const ERROR_MESSAGES = {
  VALIDATION_FAILED: { en: 'Some details are missing or invalid.', ar: 'في بيانات ناقصة أو مش صحيحة.' },
  VALIDATION_EMPTY_UPDATE: { en: 'Nothing to update.', ar: 'مفيش حاجة تتعدّل.' },
  AUTH_INVALID_PHONE: {
    en: 'Enter a valid Egyptian mobile number (010, 011, 012 or 015).',
    ar: 'اكتب رقم موبايل مصري صحيح (٠١٠ أو ٠١١ أو ٠١٢ أو ٠١٥).',
  },
  AUTH_OTP_FORMAT: { en: 'The code is 6 digits.', ar: 'الكود ٦ أرقام.' },
  AUTH_OTP_INVALID: { en: "That code isn't right. Check the SMS and try again.", ar: 'الكود مش صحيح. راجع الرسالة وجرّب تاني.' },
  AUTH_OTP_EXPIRED: { en: 'This code has expired. Request a new one.', ar: 'الكود انتهى. اطلب كود جديد.' },
  AUTH_OTP_TOO_MANY_ATTEMPTS: {
    en: 'Too many wrong attempts. Request a new code.',
    ar: 'محاولات غلط كتير. اطلب كود جديد.',
  },
  AUTH_OTP_COOLDOWN: { en: 'Please wait before requesting another code.', ar: 'استنى شوية قبل ما تطلب كود تاني.' },
  AUTH_OTP_RATE_LIMITED: {
    en: 'Too many code requests. Try again in an hour.',
    ar: 'طلبت أكواد كتير. جرّب بعد ساعة.',
  },
  AUTH_OTP_SEND_FAILED: { en: "We couldn't send the SMS. Try again shortly.", ar: 'معرفناش نبعت الرسالة. جرّب كمان شوية.' },
  AUTH_UNAUTHENTICATED: { en: 'Please log in again.', ar: 'من فضلك سجّل دخول تاني.' },
  AUTH_SESSION_REVOKED: { en: 'Your session ended. Please log in again.', ar: 'الجلسة انتهت. سجّل دخول تاني.' },
  AUTH_ACCOUNT_SUSPENDED: {
    en: 'This account is suspended. Contact support.',
    ar: 'الحساب ده موقوف. كلّم خدمة العملاء.',
  },
  AUTH_FORBIDDEN: { en: "You don't have access to this.", ar: 'مش مسموح لك بده.' },
  PROFILE_NAME_LENGTH: { en: 'Name must be 2–80 characters.', ar: 'الاسم لازم يكون من ٢ لـ ٨٠ حرف.' },
  PROFILE_NAME_CHARS: { en: 'Use letters only in your name.', ar: 'استخدم حروف بس في الاسم.' },
  PROFILE_DOB_FORMAT: { en: 'Enter a valid date of birth.', ar: 'اكتب تاريخ ميلاد صحيح.' },
  PROFILE_UNDERAGE: { en: 'You must be 18 or older to use Wasla.', ar: 'لازم يكون سنك ١٨ سنة أو أكتر.' },
  PROFILE_ALREADY_EXISTS: { en: 'Your profile is already set up.', ar: 'ملفك الشخصي متظبط خلاص.' },
  PROFILE_REQUIRED: { en: 'Finish setting up your profile first.', ar: 'كمّل بيانات ملفك الأول.' },
  ROLE_NOT_GRANTED: {
    en: 'Turn on driving in your profile before switching to driver mode.',
    ar: 'فعّل السواقة من ملفك قبل ما تحوّل لوضع السائق.',
  },
  LOCATION_REQUIRED: { en: 'Choose a place on the map or from the list.', ar: 'اختار مكان من الخريطة أو القايمة.' },
  LOCATION_NAME_REQUIRED: { en: 'Give this place a name.', ar: 'سمّي المكان ده.' },
  LOCATION_NOT_FOUND: { en: "We couldn't find that place.", ar: 'ملقيناش المكان ده.' },
  VEHICLE_FIELD_LENGTH: { en: 'Check the car make, model and colour.', ar: 'راجع ماركة وموديل ولون العربية.' },
  VEHICLE_YEAR_RANGE: { en: 'Enter a model year from 1990 onward.', ar: 'اكتب سنة صنع من ١٩٩٠ وطالع.' },
  VEHICLE_SEATS_RANGE: { en: 'Offer between 1 and 6 seats.', ar: 'اعرض من ١ لـ ٦ كراسي.' },
  VEHICLE_PLATE_FORMAT: {
    en: 'Enter the plate as on the car: up to 3 Arabic letters and up to 4 numbers.',
    ar: 'اكتب اللوحة زي ما هي على العربية: لحد ٣ حروف عربي ولحد ٤ أرقام.',
  },
  VEHICLE_PLATE_TAKEN: { en: 'This plate is already registered on Wasla.', ar: 'اللوحة دي متسجلة على وصلة قبل كده.' },
  VEHICLE_NOT_FOUND: { en: "We couldn't find that car.", ar: 'ملقيناش العربية دي.' },
  VEHICLE_IN_USE: {
    en: 'This car has upcoming rides. Cancel them before removing it.',
    ar: 'العربية دي عليها رحلات جاية. الغيها الأول قبل ما تشيلها.',
  },
  DRIVER_ROLE_REQUIRED: { en: 'Turn on driving in your profile first.', ar: 'فعّل السواقة من ملفك الأول.' },
  PLACE_NO_COORDINATES: {
    en: "That place has no map position yet. Pick a nearby gate or landmark.",
    ar: 'المكان ده ملوش مكان على الخريطة لسه. اختار بوابة أو علامة قريبة.',
  },
  RIDE_DEPARTURE_FORMAT: { en: 'Choose a departure date and time.', ar: 'اختار ميعاد ويوم التحرك.' },
  RIDE_DEPARTURE_TOO_SOON: {
    en: 'Rides must leave at least 30 minutes from now.',
    ar: 'الرحلة لازم تتحرك بعد ٣٠ دقيقة على الأقل من دلوقتي.',
  },
  RIDE_DEPARTURE_TOO_FAR: { en: 'You can publish rides up to 30 days ahead.', ar: 'تقدر تنزّل رحلات لحد ٣٠ يوم قدام.' },
  RIDE_TOO_SHORT: { en: 'Start and destination are too close together.', ar: 'نقطة التحرك والوصول قريبين من بعض أوي.' },
  RIDE_SEATS_EXCEED_VEHICLE: { en: "That's more seats than this car has.", ar: 'ده عدد كراسي أكتر من اللي في العربية.' },
  RIDE_PRICE_WHOLE: { en: 'Use whole pounds for the price.', ar: 'اكتب السعر بالجنيه من غير كسور.' },
  RIDE_PRICE_TOO_LOW: { en: 'The price is too low.', ar: 'السعر قليل أوي.' },
  RIDE_PRICE_TOO_HIGH: {
    en: 'Wasla is for sharing costs. Lower the price to the suggested range.',
    ar: 'وصلة لمشاركة التكلفة. قلّل السعر للحدود المقترحة.',
  },
  RIDE_OVERLAP: {
    en: 'You already have a ride leaving within an hour of this time.',
    ar: 'عندك رحلة تانية بتتحرك في خلال ساعة من الميعاد ده.',
  },
  RIDE_WOMEN_ONLY_DRIVER: { en: 'Only women drivers can offer women-only rides.', ar: 'رحلات السيدات بس للسواقين الستات.' },
  RIDE_NOT_FOUND: { en: "We couldn't find that ride.", ar: 'ملقيناش الرحلة دي.' },
  RIDE_NOT_SCHEDULED: { en: 'This ride is no longer open.', ar: 'الرحلة دي مبقتش متاحة.' },
  RIDE_HAS_BOOKINGS: {
    en: "Passengers have booked, so the time and price can't change. Cancel the ride instead.",
    ar: 'في ركاب حجزوا، فمينفعش تغيّر الميعاد أو السعر. الغي الرحلة بدل كده.',
  },
  RIDE_SEATS_BELOW_BOOKED: { en: "You can't offer fewer seats than are already booked.", ar: 'مينفعش تقلّل الكراسي عن اللي اتحجز.' },
  RIDE_NOT_DEPARTED: { en: "You can mark the ride done after it leaves.", ar: 'تقدر تقفل الرحلة بعد ما تتحرك.' },
  RIDE_ALREADY_DEPARTED: { en: 'This ride has already left.', ar: 'الرحلة دي اتحركت خلاص.' },
  SEARCH_PLACE_REQUIRED: { en: 'Choose where you are leaving from and going to.', ar: 'اختار انت طالع منين ورايح فين.' },
  SEARCH_DATE_FORMAT: { en: 'Choose a valid date.', ar: 'اختار تاريخ صحيح.' },
  BOOKING_OWN_RIDE: { en: "You can't book your own ride.", ar: 'مينفعش تحجز في رحلتك.' },
  BOOKING_NOT_ENOUGH_SEATS: { en: 'Not enough seats left on this ride.', ar: 'مفيش كراسي كفاية في الرحلة دي.' },
  BOOKING_ALREADY_EXISTS: { en: 'You already have a booking on this ride.', ar: 'عندك حجز في الرحلة دي بالفعل.' },
  BOOKING_WOMEN_ONLY: { en: 'This ride is for women only.', ar: 'الرحلة دي للسيدات بس.' },
  BOOKING_SEATS_LIMIT: { en: 'Book between 1 and 4 seats.', ar: 'احجز من ١ لـ ٤ كراسي.' },
  BOOKING_NOT_FOUND: { en: "We couldn't find that booking.", ar: 'ملقيناش الحجز ده.' },
  BOOKING_NOT_PENDING: { en: 'This request was already answered or has expired.', ar: 'الطلب ده اترد عليه أو انتهى.' },
  BOOKING_NOT_CANCELLABLE: { en: 'This booking can no longer be cancelled.', ar: 'الحجز ده مبقاش ينفع يتلغي.' },
  IDEMPOTENCY_KEY_FORMAT: { en: 'Invalid request key.', ar: 'مفتاح الطلب مش صحيح.' },
  IDEMPOTENCY_KEY_REUSED: { en: 'This request key was already used for something else.', ar: 'مفتاح الطلب ده اتستخدم في حاجة تانية.' },
  CHAT_NOT_ALLOWED: { en: 'Only the driver and this passenger can see this chat.', ar: 'الشات ده للسائق والراكب ده بس.' },
  CHAT_CLOSED: { en: 'This chat is closed.', ar: 'الشات ده اتقفل.' },
  CHAT_MESSAGE_EMPTY: { en: 'Write a message first.', ar: 'اكتب رسالة الأول.' },
  CHAT_MESSAGE_TOO_LONG: { en: 'Messages can be up to 1000 characters.', ar: 'الرسالة لحد ١٠٠٠ حرف.' },
  PUSH_TOKEN_FORMAT: { en: 'Invalid notification token.', ar: 'رمز الإشعارات مش صحيح.' },
  RATING_NOT_ALLOWED: { en: 'You can rate a trip only after it is completed.', ar: 'تقدر تقيّم الرحلة بعد ما تخلص بس.' },
  RATING_WINDOW_CLOSED: { en: 'The time to rate this trip has passed.', ar: 'وقت تقييم الرحلة دي فات.' },
  RATING_ALREADY_EXISTS: { en: 'You already rated this trip.', ar: 'انت قيّمت الرحلة دي قبل كده.' },
  RATING_STARS_RANGE: { en: 'Choose 1 to 5 stars.', ar: 'اختار من ١ لـ ٥ نجوم.' },
  RATING_TAG_NOT_ALLOWED: { en: 'That tag is for drivers only.', ar: 'العلامة دي للسواقين بس.' },
  REPORT_NOT_ALLOWED: { en: 'You can only report someone you shared a trip with.', ar: 'تقدر تبلّغ عن حد كنت معاه في رحلة بس.' },
  REPORT_ALREADY_OPEN: { en: 'You already have an open report about this trip.', ar: 'عندك بلاغ مفتوح عن الرحلة دي بالفعل.' },
  REPORT_LIMIT: { en: 'Too many reports today. Contact support if it is urgent.', ar: 'بلاغات كتير النهارده. كلّم خدمة العملاء لو الموضوع عاجل.' },
  BLOCK_SELF: { en: "You can't block yourself.", ar: 'مينفعش تعمل بلوك لنفسك.' },
  RIDE_NOT_AVAILABLE: { en: "This ride isn't available to you.", ar: 'الرحلة دي مش متاحة ليك.' },
  ADMIN_LOGIN_FAILED: { en: 'Wrong email or password.', ar: 'الإيميل أو كلمة السر غلط.' },
  ADMIN_LOCKED: { en: 'Too many failed attempts. Try again in 15 minutes.', ar: 'محاولات غلط كتير. جرّب بعد ١٥ دقيقة.' },
  ADMIN_UNAUTHENTICATED: { en: 'Please sign in to the console.', ar: 'سجّل دخول للوحة التحكم.' },
  ADMIN_FORBIDDEN: { en: "Your role can't do this.", ar: 'دورك مش مسموح له بده.' },
  ADMIN_CSRF: { en: 'Request blocked. Reload the console and try again.', ar: 'الطلب اترفض. حمّل لوحة التحكم تاني وجرّب.' },
  ADMIN_REASON_REQUIRED: { en: 'Give a reason (3–200 characters).', ar: 'اكتب سبب (من ٣ لـ ٢٠٠ حرف).' },
  ADMIN_PASSWORD_CHANGE_REQUIRED: { en: 'Set a new password before continuing.', ar: 'غيّر كلمة السر الأول قبل ما تكمل.' },
  ADMIN_PASSWORD_WEAK: {
    en: 'Use at least 12 characters, different from the current password.',
    ar: 'استخدم ١٢ حرف على الأقل، ومختلفة عن كلمة السر الحالية.',
  },
  ADMIN_WRONG_PASSWORD: { en: 'Your current password is not right.', ar: 'كلمة السر الحالية مش صحيحة.' },
  ADMIN_EMAIL_TAKEN: { en: 'A staff account with this email already exists.', ar: 'في حساب موظف بالإيميل ده بالفعل.' },
  ADMIN_SELF_CHANGE: { en: "You can't change your own role or disable your own account.", ar: 'مينفعش تغيّر دورك أو توقف حسابك بنفسك.' },
  STAFF_NOT_FOUND: { en: "We couldn't find that staff account.", ar: 'ملقيناش حساب الموظف ده.' },
  USER_NOT_FOUND: { en: "We couldn't find that user.", ar: 'ملقيناش المستخدم ده.' },
  REPORT_NOT_FOUND: { en: "We couldn't find that report.", ar: 'ملقيناش البلاغ ده.' },
  NOT_FOUND: { en: "We couldn't find that.", ar: 'ملقيناش اللي بتدوّر عليه.' },
  RATE_LIMITED: { en: 'Too many requests. Slow down a little.', ar: 'طلبات كتير. استنى شوية.' },
  INTERNAL_ERROR: { en: 'Something went wrong on our side. Try again.', ar: 'حصلت مشكلة عندنا. جرّب تاني.' },
} as const satisfies Record<string, Record<Locale, string>>;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && v in ERROR_MESSAGES;
}

export function errorMessage(code: string, locale: Locale): string {
  const entry = isErrorCode(code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.INTERNAL_ERROR;
  return entry[locale];
}

/** Shape of every error response body from the API. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, ErrorCode>;
    requestId?: string;
  };
}
