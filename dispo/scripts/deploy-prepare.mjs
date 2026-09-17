/**
 * Bereitet die Datenbank beim Deployment vor.
 *
 * Läuft im Build (siehe `vercel-build` in der package.json), weil die
 * Buildumgebung die Datenbank erreicht. Reihenfolge:
 *   1. Migrationen anwenden
 *   2. Demo-Daten einspielen, wenn die Datenbank noch leer ist
 *
 * Es genügt eine einzige Umgebungsvariable: DATABASE_URL.
 */
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

if (!process.env.DATABASE_URL) {
  console.error('\n✗ DATABASE_URL ist nicht gesetzt. Ohne Datenbank kann nicht deployt werden.');
  process.exit(1);
}

// Migrationen brauchen eine Verbindung ohne Transaction-Pooling. Wer dafür
// eine eigene Adresse hat, setzt DIRECT_DATABASE_URL; sonst genügt dieselbe.
if (!process.env.DIRECT_DATABASE_URL) {
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
  console.log('DIRECT_DATABASE_URL nicht gesetzt – es wird DATABASE_URL verwendet.');
}

run('prisma migrate deploy');

// --- Demo-Daten ---------------------------------------------------------
// Eingespielt wird nur in eine leere Datenbank (oder auf ausdrücklichen
// Wunsch). So überschreibt ein erneutes Deployment niemals echte Planung.
let leer = false;
try {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  leer = (await prisma.project.count()) === 0;
  await prisma.$disconnect();
} catch (e) {
  console.warn('Konnte den Datenbestand nicht prüfen:', e instanceof Error ? e.message : e);
}

if (process.env.DISPO_SEED_ON_DEPLOY === '1' || leer) {
  console.log(leer ? '\nDatenbank ist leer → Demo-Daten werden angelegt.' : '\nDemo-Daten werden aufgefrischt.');
  run('tsx prisma/seed.ts');
} else {
  console.log('\nDatenbank enthält bereits Projekte – Demo-Daten werden nicht angefasst.');
}
