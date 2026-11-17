// Test environment: a separate database and a fixed mock OTP code.
// These values are for automated tests only.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://wasla:wasla_local_dev@localhost:5432/wasla_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789-0123456789-abcdef';
process.env.OTP_HASH_SECRET = 'test-otp-secret-0123456789-0123456789-abcdefgh';
process.env.OTP_PROVIDER = 'mock';
process.env.OTP_MOCK_ENABLED = 'true';
process.env.OTP_MOCK_FIXED_CODE = '123456';
process.env.CORS_ORIGINS = '';
