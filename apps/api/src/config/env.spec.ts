import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  OTP_HASH_SECRET: 'b'.repeat(40),
};

describe('loadEnv', () => {
  it('accepts a development config with the mock OTP explicitly enabled', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'development', OTP_PROVIDER: 'mock', OTP_MOCK_ENABLED: 'true' });
    expect(env.OTP_PROVIDER).toBe('mock');
    expect(env.OTP_MOCK_ENABLED).toBe(true);
  });

  it('requires both switches for the mock provider', () => {
    expect(() => loadEnv({ ...base, OTP_PROVIDER: 'mock' })).toThrow(/OTP_MOCK_ENABLED=true/);
  });

  it('refuses the mock OTP in production even if both switches are set', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', OTP_PROVIDER: 'mock', OTP_MOCK_ENABLED: 'true' }),
    ).toThrow(/cannot be used when NODE_ENV=production/);
  });

  it('refuses a fixed OTP code in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', OTP_PROVIDER: 'mock', OTP_MOCK_ENABLED: 'false', OTP_MOCK_FIXED_CODE: '123456' }),
    ).toThrow(/OTP_MOCK_FIXED_CODE must be empty/);
  });

  it('refuses placeholder secrets in production', () => {
    expect(() =>
      loadEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace-with-a-long-random-string',
        OTP_PROVIDER: 'twilio',
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short', OTP_PROVIDER: 'mock', OTP_MOCK_ENABLED: 'true' })).toThrow(
      /at least 32/,
    );
  });
});
