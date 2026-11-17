import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Brings the test database to the latest migration and loads seed places before e2e tests. */
export default function globalSetup() {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://wasla:wasla_local_dev@localhost:5432/wasla_test?schema=public',
  };
  const cwd = resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed/index.ts', { cwd, env, stdio: 'inherit' });
}
