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

// Die Anwendung verbindet sich über den Transaction-Pooler (Port 6543):
// eine Verbindung pro Aufruf, sofort wieder frei. Migrationen funktionieren
// darüber aber nicht – sie brauchen eine Sitzungsverbindung (Port 5432).
// Ist keine eigene Adresse hinterlegt, leiten wir sie ab.
if (!process.env.DIRECT_DATABASE_URL) {
  process.env.DIRECT_DATABASE_URL = ableitenDirektverbindung(process.env.DATABASE_URL);
}

function ableitenDirektverbindung(url) {
  try {
    const parsed = new URL(url);
    if (parsed.port !== '6543') return url;
    parsed.port = '5432';
    parsed.searchParams.delete('pgbouncer');
    parsed.searchParams.delete('connection_limit');
    console.log('Migrationen laufen über die Sitzungsverbindung (Port 5432).');
    return parsed.toString();
  } catch {
    return url;
  }
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
