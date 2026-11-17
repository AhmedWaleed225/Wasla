import { describe, expect, it } from 'vitest';
import {
  carrierOf,
  formatEgyptianMobile,
  isValidEgyptianMobile,
  maskEgyptianMobile,
  normalizeEgyptianMobile,
} from './phone';

describe('normalizeEgyptianMobile', () => {
  it.each([
    ['01012345678', '+201012345678'],
    ['010 1234 5678', '+201012345678'],
    ['1012345678', '+201012345678'],
    ['+20 10 1234 5678', '+201012345678'],
    ['+201112345678', '+201112345678'],
    ['00201212345678', '+201212345678'],
    ['201512345678', '+201512345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['010-1234-5678', '+201012345678'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeEgyptianMobile(input)).toBe(expected);
  });

  it.each([
    '01312345678', // 013 is not a mobile prefix
    '0101234567', // too short
    '010123456789', // too long
    '0221234567', // Cairo landline
    '+441012345678', // not Egypt
    'abc',
    '',
  ])('rejects %s', (input) => {
    expect(normalizeEgyptianMobile(input)).toBeNull();
    expect(isValidEgyptianMobile(input)).toBe(false);
  });
});

describe('carrier, format and mask', () => {
  it('detects the original network', () => {
    expect(carrierOf('01012345678')).toBe('VODAFONE');
    expect(carrierOf('01112345678')).toBe('ETISALAT_EAND');
    expect(carrierOf('01212345678')).toBe('ORANGE');
    expect(carrierOf('01512345678')).toBe('WE');
  });

  it('formats and masks', () => {
    expect(formatEgyptianMobile('01012345678')).toBe('+20 10 1234 5678');
    expect(maskEgyptianMobile('01012345678')).toBe('+20 10 •••• 5678');
  });
});
