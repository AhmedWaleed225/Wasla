/**
 * Development seed. Idempotent: safe to run repeatedly.
 * Refuses to run when NODE_ENV=production.
 *
 * Test accounts (log in with the mock OTP — see README):
 *   +20 10 0000 0001  Nour El-Sayed   passenger
 *   +20 10 0000 0002  Karim Mostafa   passenger + driver
 *   +20 10 0000 0003  Youssef Samir   passenger + driver, English
 * These numbers exist only in local/test databases and never receive SMS
 * while OTP_PROVIDER=mock.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { SEED_PLACES } from './locations';

const prisma = new PrismaClient();

async function seedLocations() {
  const idBySlug = new Map<string, string>();
  for (const p of SEED_PLACES) {
    const parentId = p.parent ? idBySlug.get(p.parent) : undefined;
    if (p.parent && !parentId) throw new Error(`Seed order error: parent ${p.parent} of ${p.slug} not seeded yet`);
    const data = {
      kind: p.kind,
      nameEn: p.en,
      nameAr: p.ar,
      aliases: p.aliases ?? [],
      parentId: parentId ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      popularity: p.popularity ?? 10,
    };
    const row = await prisma.location.upsert({ where: { slug: p.slug }, create: { slug: p.slug, ...data }, update: data });
    idBySlug.set(p.slug, row.id);
  }
  return idBySlug;
}

interface SeedUser {
  phone: string;
  locale: 'ar' | 'en';
  roles: ('PASSENGER' | 'DRIVER')[];
  profile: Omit<Prisma.UserProfileCreateWithoutUserInput, 'dateOfBirth'> & { dateOfBirth: string };
  home?: string;
  work?: string;
}

const USERS: SeedUser[] = [
  {
    phone: '+201000000001',
    locale: 'ar',
    roles: ['PASSENGER'],
    profile: { fullName: 'Nour El-Sayed', dateOfBirth: '1999-03-14', gender: 'FEMALE', prefQuiet: true, prefAc: true },
    home: 'cairo.rehab.gate-13',
    work: 'giza.smart-village.b2',
  },
  {
    phone: '+201000000002',
    locale: 'ar',
    roles: ['PASSENGER', 'DRIVER'],
    profile: { fullName: 'Karim Mostafa', dateOfBirth: '1992-07-02', gender: 'MALE', bio: 'Daily Nasr City → Fifth Settlement, Sun–Thu.' },
    home: 'cairo.nasr-city.abbas-el-akkad',
    work: 'cairo.new-cairo.point-90',
  },
  {
    phone: '+201000000003',
    locale: 'en',
    roles: ['PASSENGER', 'DRIVER'],
    profile: { fullName: 'Youssef Samir', dateOfBirth: '2005-01-20', gender: 'MALE', prefMusicOk: true },
    home: 'giza.zayed.allegria',
    work: 'cairo.new-cairo.auc',
  },
];

async function seedUsers(idBySlug: Map<string, string>) {
  for (const u of USERS) {
    const { dateOfBirth, ...profile } = u.profile;
    const user = await prisma.user.upsert({
      where: { phoneE164: u.phone },
      create: {
        phoneE164: u.phone,
        locale: u.locale,
        roles: u.roles,
        phoneVerifiedAt: new Date(),
        profile: { create: { ...profile, dateOfBirth: new Date(`${dateOfBirth}T00:00:00Z`) } },
      },
      update: { roles: u.roles, locale: u.locale },
    });
    for (const [label, slug] of [
      ['HOME', u.home],
      ['WORK', u.work],
    ] as const) {
      if (!slug) continue;
      const locationId = idBySlug.get(slug)!;
      const loc = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
      const existing = await prisma.savedLocation.findFirst({ where: { userId: user.id, label } });
      if (!existing) {
        await prisma.savedLocation.create({
          data: { userId: user.id, label, locationId, lat: loc.lat!, lng: loc.lng! },
        });
      }
    }
  }
}

function hashAdminPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('  admin: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)');
    return;
  }
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: 'Local Admin', role: 'SUPER_ADMIN', passwordHash: hashAdminPassword(password) },
    update: {},
  });
  console.log(`  admin: ${email}`);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed development data with NODE_ENV=production');
  }
  console.log('Seeding Wasla development data…');
  const ids = await seedLocations();
  console.log(`  locations: ${ids.size}`);
  await seedUsers(ids);
  console.log(`  users: ${USERS.length}`);
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
