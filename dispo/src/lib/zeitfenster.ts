/**
 * Wann genau ist jemand wo – und wann kollidiert das wirklich?
 *
 * Zweimal am Tag eingeplant ist bei uns Alltag: morgens zwei Stunden auf der
 * einen Baustelle, ab elf auf der anderen. Das ist kein Fehler, das ist die
 * Arbeitsweise. Ein Konflikt entsteht erst, wenn zwei Einsätze wirklich
 * gleichzeitig stattfinden sollen.
 *
 * Diese Rechnung stand vorher an zwei Stellen: einmal beim Anlegen eines
 * Einsatzes, einmal beim Zeichnen der Plantafel. Zwei Fassungen derselben
 * Regel laufen früher oder später auseinander – genau das war passiert. Sie
 * steht deshalb nur noch hier.
 */

/** Minuten seit Mitternacht. Der Tag endet bei 24:00 = 1440. */
export const TAG_ENDE = 24 * 60;

export function minutenAmTag(zeit: string | null | undefined): number | null {
  if (!zeit) return null;
  const treffer = /^(\d{1,2}):(\d{2})/.exec(zeit.trim());
  if (!treffer) return null;
  const min = Number(treffer[1]) * 60 + Number(treffer[2]);
  return Number.isFinite(min) ? min : null;
}

export interface Zeitfenster {
  von: number;
  bis: number;
  /** Steht gar keine Uhrzeit dabei? Dann gilt der ganze Tag. */
  ganztags: boolean;
}

/**
 * Aus zwei Feldern ein Zeitfenster machen.
 *
 * Die vier Fälle, und warum sie so ausgelegt werden:
 *
 * - Nichts eingetragen: ganztägig. Niemand weiß, wann derjenige wo ist, also
 *   ist jede zweite Baustelle am selben Tag eine Kollision.
 * - Nur ein Beginn („ab 11 Uhr"): von da bis Feierabend. Das ist die einzige
 *   Lesart, die dem entspricht, was jemand meint, der es so einträgt – und
 *   es kollidiert eben NICHT mit 7 bis 9 Uhr.
 * - Nur ein Ende („bis 12 Uhr"): von morgens bis dahin.
 * - Beides: genau dieses Fenster.
 *
 * Steht das Ende vor dem Beginn (Tippfehler oder ein Einsatz über
 * Mitternacht), gilt es als offen bis Tagesende. Lieber einmal zu viel
 * gewarnt als einen negativen Zeitraum, der nie mit irgendetwas kollidiert.
 */
export function zeitfenster(
  start: string | null | undefined,
  ende: string | null | undefined,
): Zeitfenster {
  const von = minutenAmTag(start);
  const bis = minutenAmTag(ende);

  if (von === null && bis === null) return { von: 0, bis: TAG_ENDE, ganztags: true };
  if (von === null) return { von: 0, bis: bis as number, ganztags: false };
  if (bis === null || bis <= von) return { von, bis: TAG_ENDE, ganztags: false };
  return { von, bis, ganztags: false };
}

/** Überschneiden sich zwei Einsätze am selben Tag zeitlich? */
export function zeitenUeberschneidenSich(
  aStart: string | null | undefined,
  aEnde: string | null | undefined,
  bStart: string | null | undefined,
  bEnde: string | null | undefined,
): boolean {
  const a = zeitfenster(aStart, aEnde);
  const b = zeitfenster(bStart, bEnde);
  // Berührung zählt nicht: Wer um 9 Uhr fertig ist, darf um 9 Uhr anfangen.
  return a.von < b.bis && b.von < a.bis;
}
