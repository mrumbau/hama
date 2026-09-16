/**
 * Bereitet die Datenbank beim Deployment vor.
 *
 * Läuft im Build (siehe `vercel-build` in der package.json), weil die
 * Buildumgebung die Datenbank erreicht. Reihenfolge:
 *   1. Migrationen anwenden
 *   2. optional Demo-Daten einspielen (nur wenn ausdrücklich gewünscht)
 *
 * Der Seed ist idempotent: er ersetzt ausschließlich Datensätze mit
 * `isDemo = true` und lässt echte Daten unberührt.
 */
import { execSync } from 'node:child_process';

const run = (cmd) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
};

if (!process.env.DATABASE_URL) {
  console.error(
    '\n✗ DATABASE_URL ist nicht gesetzt. Ohne Datenbank kann nicht deployt werden.',
  );
  process.exit(1);
}

run('prisma migrate deploy');

if (process.env.DISPO_SEED_ON_DEPLOY === '1') {
  console.log('\nDISPO_SEED_ON_DEPLOY=1 → Demo-Daten werden aufgefrischt.');
  run('tsx prisma/seed.ts');
} else {
  console.log('\nDISPO_SEED_ON_DEPLOY ist nicht gesetzt – keine Demo-Daten.');
}
