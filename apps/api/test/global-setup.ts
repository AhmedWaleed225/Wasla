import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Before e2e tests: bring the test database to the latest migration, wipe data
 * left by earlier runs (so results never depend on history), then load seed data.
 * Refuses to touch any database whose name doesn't end in "_test".
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://wasla:wasla_local_dev@localhost:5432/wasla_test?schema=public';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": test database names must end in _test`);

  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url };
  const cwd = resolve(__dirname, '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'inherit' });
  // CASCADE reaches every table that references users (profiles, sessions, cars, rides, bookings, chat, notifications).
  execSync('npx prisma db execute --stdin --schema prisma/schema.prisma', {
    cwd,
    env,
    input: 'TRUNCATE users, otp_challenges, audit_logs, admin_users RESTART IDENTITY CASCADE;',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  execSync('npx tsx prisma/seed/index.ts', { cwd, env, stdio: 'inherit' });
}
