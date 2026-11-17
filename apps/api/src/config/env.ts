import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const PLACEHOLDER = 'replace-with';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    CORS_ORIGINS: z.string().default(''),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().optional(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    OTP_HASH_SECRET: z.string().min(32, 'OTP_HASH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    OTP_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
    OTP_MOCK_ENABLED: bool.default(false),
    OTP_MOCK_FIXED_CODE: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().regex(/^\d{6}$/, 'OTP_MOCK_FIXED_CODE must be 6 digits').optional()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (env.OTP_PROVIDER === 'mock' && !env.OTP_MOCK_ENABLED) {
      fail('OTP_PROVIDER=mock also requires OTP_MOCK_ENABLED=true (two explicit switches).');
    }
    if (env.OTP_PROVIDER === 'twilio') {
      fail('OTP_PROVIDER=twilio is not implemented yet (planned for Phase 4).');
    }

    if (env.NODE_ENV === 'production') {
      // Hard guards: the mock OTP must never be reachable in production.
      if (env.OTP_PROVIDER === 'mock') fail('The mock OTP provider cannot be used when NODE_ENV=production.');
      if (env.OTP_MOCK_ENABLED) fail('OTP_MOCK_ENABLED must be false when NODE_ENV=production.');
      if (env.OTP_MOCK_FIXED_CODE) fail('OTP_MOCK_FIXED_CODE must be empty when NODE_ENV=production.');
      for (const key of ['JWT_ACCESS_SECRET', 'OTP_HASH_SECRET'] as const) {
        if (env[key].includes(PLACEHOLDER)) fail(`${key} still has the example placeholder value.`);
      }
      if (env.JWT_ACCESS_SECRET === env.OTP_HASH_SECRET) fail('JWT_ACCESS_SECRET and OTP_HASH_SECRET must differ.');
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables once at startup. Throws with every problem listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
