#!/usr/bin/env node
/**
 * Eine Sicherung zurückspielen.
 *
 * Eine Sicherung, die noch nie jemand zurückgespielt hat, ist eine
 * Vermutung. Deshalb gibt es diesen Weg – und deshalb läuft er ohne
 * `--wirklich` nur trocken: Er sagt, was er täte, und schreibt nichts.
 *
 *   node scripts/sicherung-einspielen.mjs dispo-sicherung-2026-09-18.json
 *   node scripts/sicherung-einspielen.mjs datei.json --wirklich
 *
 * Absichtlich kein HTTP-Weg: Etwas, das eine ganze Datenbank überschreibt,
 * soll man nicht aus Versehen anklicken können. Es braucht einen Menschen an
 * einer Kommandozeile mit den Zugangsdaten in der Hand.
 *
 * Was vorher drinsteht, wird gelöscht. Das ist keine Härte, sondern der
 * Sinn der Sache: Zwei Stände nebeneinander hieße, dass hinterher niemand
 * sagen kann, welcher gilt. Auch eine frisch migrierte Datenbank ist nie
 * leer – die Migrationen legen Gewerke, Bauleiter und Zugänge selbst an.
 * Alles läuft in einer Transaktion: Entweder steht am Ende der Stand aus der
 * Datei, oder es ändert sich gar nichts.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

/* Die Reihenfolge ist die Reihenfolge aus src/server/sicherung.ts: Ein
 * Einsatz braucht das Projekt, das Projekt braucht den Bauleiter. */
const TABELLEN = [
  ['trades', 'trade'],
  ['siteManagers', 'siteManager'],
  ['employees', 'employee'],
  ['employeeTrades', 'employeeTrade'],
  ['subcontractors', 'subcontractor'],
  ['subcontractorTrades', 'subcontractorTrade'],
  ['users', 'user'],
  ['projects', 'project'],
  ['projectNotes', 'projectNote'],
  ['assignments', 'assignment'],
  ['communications', 'communication'],
  ['changeRequests', 'changeRequest'],
  ['warningDismissals', 'warningDismissal'],
  ['auditLog', 'auditLog'],
  ['settings', 'setting'],
];

/** Datumsfelder stehen im JSON als Text und müssen wieder Datum werden. */
function zurueckwandeln(zeile) {
  const raus = {};
  for (const [feld, wert] of Object.entries(zeile)) {
    raus[feld] =
      typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(wert) ? new Date(wert) : wert;
  }
  return raus;
}

async function main() {
  const [datei, ...rest] = process.argv.slice(2);
  const wirklich = rest.includes('--wirklich');

  if (!datei) {
    console.error('Aufruf: node scripts/sicherung-einspielen.mjs <datei.json> [--wirklich]');
    process.exit(1);
  }

  const sicherung = JSON.parse(readFileSync(datei, 'utf8'));
  console.log(`Sicherung vom ${sicherung.stand} (Umgebung: ${sicherung.umgebung})`);
  console.log(`Migrationsstand: ${sicherung.migration ?? 'unbekannt'}`);
  console.log('');

  const prisma = new PrismaClient();
  try {
    console.log('Tabelle               vorher     aus der Datei');
    let gesamt = 0;
    let weg = 0;
    for (const [name, modell] of TABELLEN) {
      const vorhanden = await prisma[modell].count();
      const zeilen = sicherung.daten?.[name]?.length ?? 0;
      gesamt += zeilen;
      weg += vorhanden;
      console.log(
        `${name.padEnd(20)} ${String(vorhanden).padStart(6)} ${String(zeilen).padStart(17)}`,
      );
    }

    console.log('');
    if (!wirklich) {
      console.log(`Trockenlauf – nichts geschrieben.`);
      console.log(`${weg} vorhandene Datensätze würden gelöscht, ${gesamt} eingespielt.`);
      console.log('Mit --wirklich noch einmal aufrufen.');
      return;
    }

    /* In einer Transaktion: Ein Abbruch mittendrin wäre das Schlimmste –
     * halb alter, halb neuer Stand, und niemand merkt es. */
    await prisma.$transaction(async (tx) => {
      // Rückwärts löschen: Erst der Einsatz, dann das Projekt, auf das er zeigt.
      for (const [, modell] of [...TABELLEN].reverse()) await tx[modell].deleteMany();
      for (const [name, modell] of TABELLEN) {
        const zeilen = (sicherung.daten?.[name] ?? []).map(zurueckwandeln);
        if (zeilen.length) await tx[modell].createMany({ data: zeilen });
      }
    });

    console.log(`${weg} Datensätze ersetzt durch ${gesamt} aus der Sicherung.`);
    console.log('Kennwörter sind nicht Teil der Sicherung – die Anmeldung läuft über Microsoft.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((fehler) => {
  console.error(fehler);
  process.exit(1);
});
