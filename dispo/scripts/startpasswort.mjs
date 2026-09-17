/**
 * Startpasswort setzen.
 *
 * Laeuft beim Deployment. Wer noch kein Passwort hat, bekommt das aus
 * DISPO_START_PASSWORT. Wer schon eines hat, wird nicht angefasst - sonst
 * wuerde jedes Deployment die selbst gewaehlten Passwoerter zuruecksetzen.
 *
 * Absichtlich zentral: Niemand vergibt sich sein Passwort selbst, und die
 * Verwaltung kommt in jedes Konto, ohne jemanden fragen zu muessen.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const passwort = process.env.DISPO_START_PASSWORT?.trim();
if (!passwort) {
  console.log('Kein DISPO_START_PASSWORT gesetzt – Passwoerter bleiben, wie sie sind.');
  process.exit(0);
}
if (passwort.length < 10) {
  console.error('✗ DISPO_START_PASSWORT braucht mindestens 10 Zeichen.');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  const offen = await prisma.user.findMany({
    where: { passwordHash: null },
    select: { id: true, email: true },
  });

  for (const user of offen) {
    const salz = randomBytes(16).toString('hex');
    const hash = await scryptAsync(passwort, salz, 64);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: `${salz}:${hash.toString('hex')}` },
    });
    console.log(`Startpasswort gesetzt: ${user.email}`);
  }

  if (offen.length === 0) {
    console.log('Alle Konten haben bereits ein Passwort.');
  }
} finally {
  await prisma.$disconnect();
}
