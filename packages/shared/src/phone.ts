/**
 * Egyptian mobile number handling.
 *
 * Egyptian mobile numbers are 11 digits locally: 01X XXXX XXXX, where X (the
 * network prefix) is 0, 1, 2 or 5. In international form: +20 1X XXXX XXXX.
 * Note: number portability means the prefix is the *original* network only.
 */

export type EgyptianCarrier = 'VODAFONE' | 'ETISALAT_EAND' | 'ORANGE' | 'WE';

const CARRIER_BY_PREFIX: Record<string, EgyptianCarrier> = {
  '10': 'VODAFONE',
  '11': 'ETISALAT_EAND',
  '12': 'ORANGE',
  '15': 'WE',
};

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) return String(a);
    return String(EASTERN_ARABIC_INDIC.indexOf(ch));
  });
}

/**
 * Normalises any common way of writing an Egyptian mobile number to E.164
 * (+201XXXXXXXXX). Returns null if it is not a valid Egyptian mobile number.
 *
 * Accepts: "010 1234 5678", "01012345678", "1012345678", "+20 10 1234 5678",
 * "00201012345678", "201012345678", and the same with Arabic-Indic digits.
 */
export function normalizeEgyptianMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  let digits = toAsciiDigits(input).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (digits.startsWith('0020')) national = digits.slice(4);
  else if (digits.startsWith('20') && digits.length === 12) national = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;

  // national is now 10 digits: 1X XXXX XXXX
  if (!/^1[0125]\d{8}$/.test(national)) return null;
  return `+20${national}`;
}

export function isValidEgyptianMobile(input: string): boolean {
  return normalizeEgyptianMobile(input) !== null;
}

/** Original network of a number (may differ after porting). */
export function carrierOf(e164: string): EgyptianCarrier | null {
  const n = normalizeEgyptianMobile(e164);
  if (!n) return null;
  return CARRIER_BY_PREFIX[n.slice(3, 5)] ?? null;
}

/** "+201012345678" -> "+20 10 1234 5678" */
export function formatEgyptianMobile(e164: string): string {
  const n = normalizeEgyptianMobile(e164);
  if (!n) return e164;
  const d = n.slice(3);
  return `+20 ${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}

/** "+201012345678" -> "+20 10 •••• 5678" — for showing a number without exposing it. */
export function maskEgyptianMobile(e164: string): string {
  const n = normalizeEgyptianMobile(e164);
  if (!n) return '';
  const d = n.slice(3);
  return `+20 ${d.slice(0, 2)} •••• ${d.slice(6)}`;
}
