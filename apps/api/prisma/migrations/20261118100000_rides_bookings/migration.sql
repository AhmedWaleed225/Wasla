-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingMode" AS ENUM ('INSTANT', 'REQUEST');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "make" VARCHAR(30) NOT NULL,
    "model" VARCHAR(30) NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "year" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL,
    "plate_letters" VARCHAR(8) NOT NULL,
    "plate_digits" VARCHAR(4) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "status" "RideStatus" NOT NULL DEFAULT 'SCHEDULED',
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "origin_location_id" UUID,
    "origin_name_en" VARCHAR(120) NOT NULL,
    "origin_name_ar" VARCHAR(120) NOT NULL,
    "origin_lat" DOUBLE PRECISION NOT NULL,
    "origin_lng" DOUBLE PRECISION NOT NULL,
    "destination_location_id" UUID,
    "destination_name_en" VARCHAR(120) NOT NULL,
    "destination_name_ar" VARCHAR(120) NOT NULL,
    "destination_lat" DOUBLE PRECISION NOT NULL,
    "destination_lng" DOUBLE PRECISION NOT NULL,
    "distance_km" DOUBLE PRECISION NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "seats_available" INTEGER NOT NULL,
    "price_per_seat_piasters" INTEGER NOT NULL,
    "booking_mode" "BookingMode" NOT NULL DEFAULT 'INSTANT',
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(280),
    "pref_quiet" BOOLEAN NOT NULL DEFAULT false,
    "pref_music_ok" BOOLEAN NOT NULL DEFAULT true,
    "pref_ac" BOOLEAN NOT NULL DEFAULT true,
    "pref_smoking_ok" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(200),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "seats" INTEGER NOT NULL,
    "price_per_seat_piasters" INTEGER NOT NULL,
    "total_piasters" INTEGER NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "pickup_note" VARCHAR(140),
    "idempotency_key" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles"("owner_id");

-- CreateIndex
CREATE INDEX "rides_status_departure_at_idx" ON "rides"("status", "departure_at");

-- CreateIndex
CREATE INDEX "rides_driver_id_departure_at_idx" ON "rides"("driver_id", "departure_at");

-- CreateIndex
CREATE INDEX "bookings_ride_id_status_idx" ON "bookings"("ride_id", "status");

-- CreateIndex
CREATE INDEX "bookings_passenger_id_status_idx" ON "bookings"("passenger_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_passenger_id_idempotency_key_key" ON "bookings"("passenger_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Integrity rules Prisma's schema language cannot express (added by hand).
-- ---------------------------------------------------------------------------

-- Vehicles: sane values, and one active registration per plate.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_seats_range" CHECK ("seats" BETWEEN 1 AND 6);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_year_range" CHECK ("year" BETWEEN 1990 AND 2100);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plate_digits_format" CHECK ("plate_digits" ~ '^[0-9]{1,4}$');
CREATE UNIQUE INDEX "vehicles_active_plate_unique"
  ON "vehicles" ("plate_letters", "plate_digits") WHERE "is_active";

-- Rides: seats can never go negative or above what was offered — the last line of
-- defence against overbooking if application logic were ever wrong.
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_total_range" CHECK ("seats_total" BETWEEN 1 AND 6);
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_available_range" CHECK ("seats_available" BETWEEN 0 AND "seats_total");
ALTER TABLE "rides" ADD CONSTRAINT "rides_price_positive" CHECK ("price_per_seat_piasters" > 0);
ALTER TABLE "rides" ADD CONSTRAINT "rides_coordinates_range" CHECK (
  "origin_lat" BETWEEN -90 AND 90 AND "origin_lng" BETWEEN -180 AND 180
  AND "destination_lat" BETWEEN -90 AND 90 AND "destination_lng" BETWEEN -180 AND 180
);

-- Bookings: seat and money arithmetic is consistent.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_seats_range" CHECK ("seats" BETWEEN 1 AND 4);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_total_matches" CHECK ("total_piasters" = "seats" * "price_per_seat_piasters");

-- One active booking per passenger per ride: blocks double booking even under concurrent requests.
CREATE UNIQUE INDEX "bookings_one_active_per_passenger"
  ON "bookings" ("ride_id", "passenger_id") WHERE "status" IN ('PENDING', 'CONFIRMED');

-- Great-circle distance in km (matches distanceKm() in packages/shared/src/rides.ts).
CREATE FUNCTION wasla_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- Search narrows by bounding box first, then by exact distance.
CREATE INDEX "rides_open_origin_box" ON "rides" ("origin_lat", "origin_lng") WHERE "status" = 'SCHEDULED';
