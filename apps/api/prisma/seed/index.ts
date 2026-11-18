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
import { PrismaClient, type Prisma } from '@prisma/client';
import { distanceKm, priceLimitsEgp } from '@wasla/shared';
import { ADMIN_PASSWORD_MIN_LENGTH, hashPassword } from '../../src/admin/password';
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

/** Creates a SUPER_ADMIN for the console when SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set. */
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('  admin: skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)');
    return;
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`);
  }
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: 'Local Admin', role: 'SUPER_ADMIN', passwordHash: hashPassword(password) },
    update: {},
  });
  console.log(`  admin: ${email}`);
}


/**
 * A car each for the two seeded drivers and a few rides over the next two days,
 * so the app has something to find. Skipped if they already have upcoming rides.
 */
async function seedRides(ids: Map<string, string>) {
  const plan = [
    {
      phone: '+201000000002',
      car: { make: 'Hyundai', model: 'Elantra', color: 'Silver', year: 2019, seats: 3, plateLetters: 'م ص ر', plateDigits: '2025' },
      rides: [
        { from: 'giza.smart-village.b2', to: 'cairo.new-cairo.cfc.gate-4', inHours: 20, mode: 'INSTANT' as const },
        { from: 'cairo.new-cairo.cfc.gate-4', to: 'giza.smart-village.b2', inHours: 30, mode: 'INSTANT' as const },
      ],
    },
    {
      phone: '+201000000003',
      car: { make: 'Kia', model: 'Cerato', color: 'White', year: 2021, seats: 4, plateLetters: 'ق ه ر', plateDigits: '7310' },
      rides: [{ from: 'cairo.rehab.gate-13', to: 'cairo.downtown.tahrir', inHours: 22, mode: 'REQUEST' as const }],
    },
  ];
  let created = 0;
  for (const d of plan) {
    const user = await prisma.user.findUniqueOrThrow({ where: { phoneE164: d.phone } });
    const upcoming = await prisma.ride.count({ where: { driverId: user.id, status: 'SCHEDULED', departureAt: { gt: new Date() } } });
    if (upcoming > 0) continue;
    const car =
      (await prisma.vehicle.findFirst({ where: { ownerId: user.id, plateLetters: d.car.plateLetters, plateDigits: d.car.plateDigits, isActive: true } })) ??
      (await prisma.vehicle.create({ data: { ownerId: user.id, ...d.car } }));
    for (const r of d.rides) {
      const [from, to] = await Promise.all([
        prisma.location.findUniqueOrThrow({ where: { id: ids.get(r.from)! } }),
        prisma.location.findUniqueOrThrow({ where: { id: ids.get(r.to)! } }),
      ]);
      const km = distanceKm({ lat: from.lat!, lng: from.lng! }, { lat: to.lat!, lng: to.lng! });
      const departureAt = new Date(Date.now() + r.inHours * 3_600_000);
      departureAt.setMinutes(0, 0, 0);
      await prisma.ride.create({
        data: {
          driverId: user.id,
          vehicleId: car.id,
          departureAt,
          originLocationId: from.id,
          originNameEn: from.nameEn,
          originNameAr: from.nameAr,
          originLat: from.lat!,
          originLng: from.lng!,
          destinationLocationId: to.id,
          destinationNameEn: to.nameEn,
          destinationNameAr: to.nameAr,
          destinationLat: to.lat!,
          destinationLng: to.lng!,
          distanceKm: km,
          seatsTotal: car.seats,
          seatsAvailable: car.seats,
          pricePerSeatPiasters: priceLimitsEgp(km).suggested * 100,
          bookingMode: r.mode,
        },
      });
      created += 1;
    }
  }
  console.log(`  rides: ${created} created`);
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
  await seedRides(ids);
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
