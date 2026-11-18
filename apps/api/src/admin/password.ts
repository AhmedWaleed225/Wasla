import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Minimum length for staff passwords (checked when creating admins). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

const KEY_LENGTH = 64;

/** "scrypt$<salt b64>$<hash b64>" — scrypt with Node's defaults (N=16384, r=8, p=1) and a random 16-byte salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Constant-time check. Unknown formats never match. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Checked against when the email is unknown, so a failed login takes the same time either way. */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
