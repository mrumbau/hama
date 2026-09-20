/**
 * Was ist an einem einzelnen Tag los?
 *
 * Die Tagesliste auf dem Handy zeigt genau einen Tag. Das klingt einfacher,
 * als es ist: Ein Einsatz über drei Tage steht an allen dreien, gehört aber
 * nur einmal in die Liste, und eine Baustelle „ohne Einsatz" ist etwas
 * anderes als eine, die es an diesem Tag gar nicht gibt.
 *
 * Hier steht diese Rechnerei getrennt von der Darstellung – so lässt sie
 * sich prüfen, ohne einen Browser zu starten.
 */
import type { IsoDate } from './dates';

interface MitZeitraum {
  startDate: IsoDate;
  endDate: IsoDate;
}

/** Alles, was an diesem Tag läuft – auch mehrtägige Einsätze mittendrin. */
export function einsaetzeAmTag<T extends MitZeitraum>(einsaetze: T[], tag: IsoDate): T[] {
  return einsaetze.filter((a) => a.startDate <= tag && a.endDate >= tag);
}

/** Nach einem Merkmal gruppieren, Reihenfolge bleibt erhalten. */
export function gruppiere<T>(liste: T[], schluessel: (x: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const x of liste) {
    const k = schluessel(x);
    const vorhanden = map.get(k);
    if (vorhanden) vorhanden.push(x);
    else map.set(k, [x]);
  }
  return map;
}

/**
 * Wer hat an diesem Tag etwas, wer nicht?
 *
 * Die Leeren verschwinden nicht – sie stehen zusammengeklappt darunter.
 * Sonst könnte man auf dem Handy nichts auf eine Baustelle planen, auf der
 * gerade niemand ist, und das ist der halbe Zweck der Übung.
 */
export function belegtUndLeer<P extends { id: string }>(
  projekte: P[],
  jeProjekt: Map<string, unknown[]>,
): { belegt: P[]; leer: P[] } {
  const belegt: P[] = [];
  const leer: P[] = [];
  for (const p of projekte) {
    if ((jeProjekt.get(p.id)?.length ?? 0) > 0) belegt.push(p);
    else leer.push(p);
  }
  return { belegt, leer };
}
