/**
 * Auswertung der festen Zeilen: Lager, Besorgungsfahrten, Urlaub, Krank.
 *
 * Die Frage dahinter ist eine kaufmännische, keine dispositive: Wie viele
 * Lagertage sind angefallen? Wer war wie oft krank? Wer hatte wie viel
 * Urlaub? Deshalb steht das nicht auf der Plantafel, sondern auf einer
 * eigenen Seite – und immer nach Monat aufgeschlüsselt, weil man Urlaub
 * nach Jahr zählt und Krankheit nach Monat betrachtet.
 *
 * Gezählt werden Kalendertage im jeweiligen Monat, nicht Einsätze: Ein
 * Urlaub vom 28. Juli bis 8. August ist nicht „ein Urlaub im Juli",
 * sondern vier Tage Juli und sechs Tage August.
 *
 * Wochenenden zählen mit. Wer sie herausrechnen will, braucht zuerst einen
 * Arbeitszeitkalender – und den gibt es hier nicht, also wird auch nicht so
 * getan, als gäbe es ihn.
 */
import { prisma } from '@/lib/db';
import { dbDateToIso } from '@/lib/dates';
import { fullName } from '@/lib/utils';

export const AUSWERTBAR = ['LAGER', 'BESORGUNG', 'URLAUB', 'KRANK'] as const;
export type AuswertbarerSchluessel = (typeof AUSWERTBAR)[number];

export interface MonatsWert {
  /** 1 = Januar. */
  monat: number;
  tage: number;
  /** Nur gesetzt, wenn an allen Einsätzen Uhrzeiten hinterlegt sind. */
  stunden: number | null;
  /** Wie viele einzelne Einträge – für „wie oft war jemand krank". */
  eintraege: number;
}

export interface PersonenZeile {
  name: string;
  /** Null bei Subunternehmern und Platzhaltern. */
  employeeId: string | null;
  monate: MonatsWert[];
  summeTage: number;
  summeStunden: number | null;
  summeEintraege: number;
}

export interface AuswertungsBlock {
  schluessel: AuswertbarerSchluessel;
  bezeichnung: string;
  personen: PersonenZeile[];
  gesamt: MonatsWert[];
}

function leereMonate(): MonatsWert[] {
  return Array.from({ length: 12 }, (_, i) => ({
    monat: i + 1,
    tage: 0,
    stunden: 0,
    eintraege: 0,
  }));
}

/** Stunden aus „07:30" und „16:00". Null, wenn eine Angabe fehlt. */
export function stundenJeTag(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return null;
  const minuten = eh * 60 + em - (sh * 60 + sm);
  return minuten > 0 ? minuten / 60 : null;
}

/**
 * Verteilt einen Einsatz auf die Monate, die er berührt.
 *
 * Gibt je Monat die Anzahl der Kalendertage zurück, die in diesem Jahr und
 * diesem Monat liegen.
 */
export function tageJeMonat(
  von: string,
  bis: string,
  jahr: number,
): { monat: number; tage: number }[] {
  const ergebnis = new Map<number, number>();
  const ende = new Date(`${bis}T00:00:00Z`);

  for (let tag = new Date(`${von}T00:00:00Z`); tag <= ende; tag.setUTCDate(tag.getUTCDate() + 1)) {
    if (tag.getUTCFullYear() !== jahr) continue;
    const monat = tag.getUTCMonth() + 1;
    ergebnis.set(monat, (ergebnis.get(monat) ?? 0) + 1);
  }

  return [...ergebnis.entries()].map(([monat, tage]) => ({ monat, tage }));
}

export async function baueAuswertung(jahr: number): Promise<AuswertungsBlock[]> {
  const projekte = await prisma.project.findMany({
    where: { internKey: { in: [...AUSWERTBAR] } },
    select: { id: true, internKey: true, name: true },
  });
  if (projekte.length === 0) return [];

  // Alles, was das Jahr irgendwie berührt – die Aufteilung auf Monate
  // passiert danach, nicht in der Abfrage.
  const einsaetze = await prisma.assignment.findMany({
    where: {
      projectId: { in: projekte.map((p) => p.id) },
      status: { not: 'ABGESAGT' },
      startDate: { lte: new Date(Date.UTC(jahr, 11, 31)) },
      endDate: { gte: new Date(Date.UTC(jahr, 0, 1)) },
    },
    include: { employee: true, siteManager: true, subcontractor: true },
  });

  return projekte
    .map((projekt) => {
      const eigene = einsaetze.filter((a) => a.projectId === projekt.id);
      const proPerson = new Map<string, PersonenZeile>();
      const gesamt = leereMonate();
      let gesamtOhneZeiten = false;

      for (const a of eigene) {
        const name = a.employee
          ? fullName(a.employee)
          : a.siteManager
            ? fullName(a.siteManager)
            : (a.subcontractor?.companyName ?? a.placeholderLabel ?? 'Unbesetzt');

        let zeile = proPerson.get(name);
        if (!zeile) {
          zeile = {
            name,
            employeeId: a.employeeId,
            monate: leereMonate(),
            summeTage: 0,
            summeStunden: 0,
            summeEintraege: 0,
          };
          proPerson.set(name, zeile);
        }

        const stunden = stundenJeTag(a.startTime, a.endTime);
        if (stunden === null) {
          zeile.summeStunden = null;
          gesamtOhneZeiten = true;
        }

        const verteilt = tageJeMonat(dbDateToIso(a.startDate), dbDateToIso(a.endDate), jahr);
        if (verteilt.length === 0) continue;

        zeile.summeEintraege += 1;
        for (const { monat, tage } of verteilt) {
          const m = zeile.monate[monat - 1];
          const g = gesamt[monat - 1];
          m.tage += tage;
          g.tage += tage;
          zeile.summeTage += tage;
          // Ein Eintrag zaehlt in jedem Monat, den er beruehrt: „wie oft war
          // jemand im August krank" soll den Fall vom 28.07. mitzaehlen.
          m.eintraege += 1;
          g.eintraege += 1;
          if (stunden !== null) {
            if (m.stunden !== null) m.stunden += stunden * tage;
            if (g.stunden !== null) g.stunden += stunden * tage;
          } else {
            m.stunden = null;
            g.stunden = null;
          }
        }
        if (stunden !== null && zeile.summeStunden !== null) {
          zeile.summeStunden += stunden * verteilt.reduce((s, v) => s + v.tage, 0);
        }
      }

      if (gesamtOhneZeiten) for (const m of gesamt) m.stunden = null;

      return {
        schluessel: projekt.internKey as AuswertbarerSchluessel,
        bezeichnung: projekt.name,
        personen: [...proPerson.values()].sort((a, b) => b.summeTage - a.summeTage),
        gesamt,
      };
    })
    .sort((a, b) => AUSWERTBAR.indexOf(a.schluessel) - AUSWERTBAR.indexOf(b.schluessel));
}
