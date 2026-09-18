/**
 * Was von Hand geändert wurde, gewinnt gegen den Abgleich.
 *
 * „Das Programm" ist führend für die kaufmännischen Stammdaten – aber nicht
 * gegen einen Menschen, der einen Fehler korrigiert hat. Wer „Lechmann" zu
 * „Lachmann" verbessert, will nicht, dass zehn Minuten später wieder
 * „Lechmann" dasteht.
 *
 * Deshalb merkt sich jeder Datensatz, welche Felder ein Mensch gesetzt hat.
 * Der Abgleich überspringt genau die und füllt weiterhin alles andere.
 *
 * Bewusst kein Zeitstempel-Vergleich („wer war später?"): Der Abgleich läuft
 * automatisch und wäre damit immer der Spätere. Die Herkunft entscheidet,
 * nicht die Uhr.
 */

/** Was der Abgleich liefern kann, aufgeteilt in Feldname und Wert. */
export type Felder = Record<string, unknown>;

/**
 * Welche Felder hat dieser Mensch gerade tatsächlich geändert?
 *
 * Nur wirkliche Änderungen zählen. Wer ein Formular öffnet und ohne
 * Bearbeitung speichert, soll nicht versehentlich alle Felder gegen den
 * Abgleich sperren.
 */
export function neueHandarbeit(vorher: Felder, eingabe: Felder): string[] {
  const geaendert: string[] = [];
  for (const [feld, wert] of Object.entries(eingabe)) {
    if (wert === undefined) continue;
    if (vergleichbar(wert) === vergleichbar(vorher[feld])) continue;
    geaendert.push(feld);
  }
  return geaendert;
}

/** Die bisherige Liste um das Neue ergänzen, ohne Dubletten. */
export function ergaenzeHandarbeit(bisher: readonly string[], neu: readonly string[]): string[] {
  return [...new Set([...bisher, ...neu])].sort();
}

/**
 * Entfernt aus den Daten des Abgleichs alles, was ein Mensch besitzt.
 *
 * Felder ohne Wert fliegen ebenfalls heraus: Der Abgleich soll Lücken
 * füllen, nicht Vorhandenes durch Leere ersetzen.
 */
export function ohneHandarbeit<T extends Felder>(daten: T, gesperrt: readonly string[]): Partial<T> {
  const uebrig: Felder = {};
  for (const [feld, wert] of Object.entries(daten)) {
    if (gesperrt.includes(feld)) continue;
    if (wert === null || wert === undefined || wert === '') continue;
    uebrig[feld] = wert;
  }
  return uebrig as Partial<T>;
}

/**
 * Nie einen vorhandenen Wert gegen einen Platzhalter tauschen.
 *
 * Wenn der Abruf der Projektdetails scheitert, lieferte die Schnittstelle
 * bisher „Unbekannter Kunde" – und der landete über einem richtigen Namen.
 * Ein Platzhalter ist keine Information.
 */
const PLATZHALTER = /^(unbekannter kunde|unbenanntes projekt|unbekannt|—|-)$/i;

export function istPlatzhalter(wert: unknown): boolean {
  return typeof wert === 'string' && PLATZHALTER.test(wert.trim());
}

/** Platzhalter aus den Daten des Abgleichs entfernen. */
export function ohnePlatzhalter<T extends Felder>(daten: T): Partial<T> {
  const uebrig: Felder = {};
  for (const [feld, wert] of Object.entries(daten)) {
    if (istPlatzhalter(wert)) continue;
    uebrig[feld] = wert;
  }
  return uebrig as Partial<T>;
}

function vergleichbar(wert: unknown): string {
  if (wert === null || wert === undefined) return '';
  if (typeof wert === 'string') return wert.trim();
  return String(wert);
}
