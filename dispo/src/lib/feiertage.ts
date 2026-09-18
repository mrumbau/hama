/**
 * Gesetzliche Feiertage in Bayern, für den Standort München.
 *
 * Wer am Feiertag jemanden einplant, merkt das sonst erst, wenn niemand
 * kommt. Deshalb stehen sie in der Plantafel wie Wochenenden.
 *
 * Bayern hat zwei Besonderheiten, die man leicht falsch macht:
 *
 *   • Mariä Himmelfahrt (15.08.) gilt nur in Gemeinden mit überwiegend
 *     katholischer Bevölkerung – München gehört dazu.
 *   • Das Augsburger Friedensfest (08.08.) gilt NUR in Augsburg und steht
 *     deshalb hier bewusst nicht drin.
 *
 * Berechnet statt abgetippt: Ostern wandert, und eine Liste von Hand hält
 * genau so lange, bis jemand vergisst, sie zu verlängern.
 */
import type { IsoDate } from '@/lib/dates';

export interface Feiertag {
  datum: IsoDate;
  name: string;
}

/**
 * Ostersonntag nach der gaußschen Osterformel (gregorianisch).
 *
 * Daran hängen Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag
 * und Fronleichnam – also die Hälfte aller Feiertage.
 */
export function ostersonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

function iso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10) as IsoDate;
}

function plus(d: Date, tage: number): Date {
  const kopie = new Date(d);
  kopie.setUTCDate(kopie.getUTCDate() + tage);
  return kopie;
}

/** Alle gesetzlichen Feiertage eines Jahres in München. */
export function feiertageBayern(jahr: number): Feiertag[] {
  const ostern = ostersonntag(jahr);
  const fest = (monat: number, tag: number) => iso(new Date(Date.UTC(jahr, monat - 1, tag)));

  return [
    { datum: fest(1, 1), name: 'Neujahr' },
    { datum: fest(1, 6), name: 'Heilige Drei Könige' },
    { datum: iso(plus(ostern, -2)), name: 'Karfreitag' },
    { datum: iso(plus(ostern, 1)), name: 'Ostermontag' },
    { datum: fest(5, 1), name: 'Tag der Arbeit' },
    { datum: iso(plus(ostern, 39)), name: 'Christi Himmelfahrt' },
    { datum: iso(plus(ostern, 50)), name: 'Pfingstmontag' },
    { datum: iso(plus(ostern, 60)), name: 'Fronleichnam' },
    { datum: fest(8, 15), name: 'Mariä Himmelfahrt' },
    { datum: fest(10, 3), name: 'Tag der Deutschen Einheit' },
    { datum: fest(11, 1), name: 'Allerheiligen' },
    { datum: fest(12, 25), name: '1. Weihnachtstag' },
    { datum: fest(12, 26), name: '2. Weihnachtstag' },
  ].sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Nachschlagewerk für einen Zeitraum.
 *
 * Wird einmal je Ansicht gebaut und dann je Tag befragt – das ist billiger
 * als dreizehn Feiertage pro Spalte neu auszurechnen.
 */
export function feiertageZwischen(von: IsoDate, bis: IsoDate): Map<IsoDate, string> {
  const ergebnis = new Map<IsoDate, string>();
  const vonJahr = Number(von.slice(0, 4));
  const bisJahr = Number(bis.slice(0, 4));

  for (let jahr = vonJahr; jahr <= bisJahr; jahr++) {
    for (const f of feiertageBayern(jahr)) {
      if (f.datum >= von && f.datum <= bis) ergebnis.set(f.datum, f.name);
    }
  }
  return ergebnis;
}

/**
 * Name des Feiertags an diesem Tag, sonst null.
 *
 * Je Jahr einmal gerechnet und gemerkt: Die Plantafel fragt das pro Spalte
 * und pro Zelle, also hunderte Male je Ansicht.
 */
const nachJahr = new Map<number, Map<IsoDate, string>>();

export function feiertagName(datum: IsoDate): string | null {
  const jahr = Number(datum.slice(0, 4));
  if (!Number.isInteger(jahr)) return null;

  let karte = nachJahr.get(jahr);
  if (!karte) {
    karte = new Map(feiertageBayern(jahr).map((f) => [f.datum, f.name]));
    nachJahr.set(jahr, karte);
  }
  return karte.get(datum) ?? null;
}
