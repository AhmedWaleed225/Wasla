/** Unit tests (no database) and e2e tests (real PostgreSQL test database). */
const base = {
  testEnvironment: 'node',
  rootDir: '.',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 30000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'], globalSetup: '<rootDir>/test/global-setup.ts' },
  ],
};
