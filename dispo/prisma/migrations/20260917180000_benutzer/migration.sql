-- Benutzer und Rollen.
--
-- Drei Bauleiter brauchen keine Rechtematrix, sondern eine nachvollziehbare
-- Abstufung: wer alles darf, wer das Protokoll sieht, wer plant.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'LEITUNG', 'BAULEITER');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BAULEITER',
    "passwordHash" TEXT,
    "siteManagerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_active_idx" ON "users"("active");

ALTER TABLE "users" ADD CONSTRAINT "users_siteManagerId_fkey"
  FOREIGN KEY ("siteManagerId") REFERENCES "site_managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
