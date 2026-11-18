/**
 * Search normalisation for Arabic and English place names, mirrored by the SQL
 * expression in locations.service.ts so both sides of a comparison match.
 *
 * - lower-case
 * - أ إ آ ٱ -> ا, ة -> ه, ى -> ي, ؤ -> و, ئ -> ي
 * - Arabic-Indic digits -> ASCII
 * - strips tatweel and diacritics (harakat)
 */
const PAIRS: [string, string][] = [
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['آ', 'ا'],
  ['ٱ', 'ا'],
  ['ة', 'ه'],
  ['ى', 'ي'],
  ['ؤ', 'و'],
  ['ئ', 'ي'],
  ['٠', '0'],
  ['١', '1'],
  ['٢', '2'],
  ['٣', '3'],
  ['٤', '4'],
  ['٥', '5'],
  ['٦', '6'],
  ['٧', '7'],
  ['٨', '8'],
  ['٩', '9'],
];

/** Characters for PostgreSQL translate(): from[i] becomes to[i]. */
export const SQL_TRANSLATE_FROM = PAIRS.map((p) => p[0]).join('');
export const SQL_TRANSLATE_TO = PAIRS.map((p) => p[1]).join('');
/** Removed entirely: tatweel and harakat (U+064B–U+0652). */
export const SQL_STRIP_CLASS = '[ـً-ْ]';

const MAP = new Map(PAIRS);

export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ـً-ْ]/g, '')
    .replace(/./gu, (ch) => MAP.get(ch) ?? ch)
    .replace(/\s+/g, ' ')
    .trim();
}
