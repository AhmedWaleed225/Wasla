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
