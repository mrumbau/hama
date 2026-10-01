/**
 * Der Bauzeitenplan: wann ist welches Gewerk dran.
 *
 * Hier steht die Rechnerei, nicht die Darstellung – so lässt sie sich prüfen,
 * ohne einen Browser zu starten. Das Herzstück ist `verschiebeAbHier`: Wer
 * den Sanitärer eine Woche nach rechts zieht, verschiebt den ganzen Plan ab
 * dort. Der Plan behält seine Form.
 */
import { addDays, diffDays, fromIso, isoWeek, toIso, type IsoDate } from './dates';

export type Raster = 'WOCHE' | 'TAG';

export interface Phase {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
}

/** Ein Schritt im Raster: eine Woche sind sieben Tage, ein Tag ist einer. */
export function schrittweite(raster: Raster): number {
  return raster === 'WOCHE' ? 7 : 1;
}

/**
 * Eine Phase verschieben – und alles, was gleichzeitig oder später beginnt.
 *
 * Bewusst keine Kette von Abhängigkeiten („Fliesen hängen an Estrich"). Auf
 * dem Bau laufen Gewerke parallel: Elektro und Sanitär liegen oft in
 * derselben Woche. Eine Kette bricht genau da, und sie müsste gepflegt
 * werden – das tut auf Dauer niemand.
 *
 * „Alles ab hier" trifft dasselbe ohne Pflegeaufwand: Zwei Gewerke in
 * derselben Woche rutschen gemeinsam, weil beide „ab hier" sind. Die
 * Abstände bleiben, nichts überholt etwas.
 *
 * Zurück kommen nur die Phasen, die sich wirklich ändern.
 */
export function verschiebeAbHier<T extends Phase>(
  phasen: T[],
  angefassteId: string,
  tage: number,
): { id: string; startDate: IsoDate; endDate: IsoDate }[] {
  const angefasst = phasen.find((p) => p.id === angefassteId);
  if (!angefasst || tage === 0) return [];

  return phasen
    .filter((p) => p.startDate >= angefasst.startDate)
    .map((p) => ({
      id: p.id,
      startDate: addDays(p.startDate, tage),
      endDate: addDays(p.endDate, tage),
    }));
}

/** Nur diese eine Zeile verschieben – für den Fall, dass wirklich nur sie gemeint ist. */
export function verschiebeNurDiese<T extends Phase>(
  phasen: T[],
  angefassteId: string,
  tage: number,
): { id: string; startDate: IsoDate; endDate: IsoDate }[] {
  const p = phasen.find((x) => x.id === angefassteId);
  if (!p || tage === 0) return [];
  return [{ id: p.id, startDate: addDays(p.startDate, tage), endDate: addDays(p.endDate, tage) }];
}

/**
 * Das Ende einer Phase verschieben, ohne den Beginn anzufassen.
 *
 * Länger oder kürzer, aber nie kürzer als ein Schritt – ein Balken mit der
 * Breite null wäre auf dem Plan unsichtbar und nicht mehr anfassbar.
 */
export function dauerAendern(phase: Phase, tage: number, raster: Raster): IsoDate {
  const mindestens = addDays(phase.startDate, schrittweite(raster) - 1);
  const neu = addDays(phase.endDate, tage);
  return neu < mindestens ? mindestens : neu;
}

/**
 * Auf das Raster einrasten.
 *
 * In Wochen gerechnet beginnt eine Phase am Montag und endet am Sonntag –
 * sonst stünde ein Balken mitten in einer Spalte und der Plan sähe schief
 * aus, obwohl die Daten stimmen.
 */
export function aufRaster(datum: IsoDate, raster: Raster, richtung: 'anfang' | 'ende'): IsoDate {
  if (raster === 'TAG') return datum;
  const d = fromIso(datum);
  const wochentag = (d.getDay() + 6) % 7; // Montag = 0
  return richtung === 'anfang' ? addDays(datum, -wochentag) : addDays(datum, 6 - wochentag);
}

/**
 * Welche Spalten zeigt der Plan?
 *
 * Vom frühesten bis zum spätesten Balken, plus etwas Luft – man will sehen,
 * wohin man schieben kann, bevor man schiebt. Ist noch nichts eingetragen,
 * beginnt der Plan heute.
 */
export function spalten(
  phasen: Phase[],
  raster: Raster,
  heute: IsoDate,
  luft = 2,
): { von: IsoDate; bis: IsoDate; spalten: IsoDate[] } {
  const schritt = schrittweite(raster);
  const alleStarts = phasen.map((p) => p.startDate);
  const alleEnden = phasen.map((p) => p.endDate);

  const frueheste = alleStarts.length ? alleStarts.reduce((a, b) => (a < b ? a : b)) : heute;
  const spaeteste = alleEnden.length
    ? alleEnden.reduce((a, b) => (a > b ? a : b))
    : addDays(heute, schritt * 7);

  const von = aufRaster(addDays(frueheste, -schritt * luft), raster, 'anfang');
  const bis = aufRaster(addDays(spaeteste, schritt * luft), raster, 'ende');

  const liste: IsoDate[] = [];
  for (let d = von; d <= bis; d = addDays(d, schritt)) liste.push(d);
  return { von, bis, spalten: liste };
}

/** Beschriftung einer Spalte: „KW 42" oder „Mo 12.10." */
export function spaltenTitel(datum: IsoDate, raster: Raster): string {
  if (raster === 'WOCHE') return `KW ${isoWeek(datum)}`;
  const d = fromIso(datum);
  const kurz = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
  return `${kurz} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Wo im Raster liegt ein Balken?
 *
 * Gibt den Spaltenindex und die Breite in Spalten zurück – beides auf das
 * sichtbare Fenster begrenzt, damit ein Balken, der links herausragt, nicht
 * das Raster sprengt.
 */
export function balken(
  phase: Phase,
  fenster: { von: IsoDate; spalten: IsoDate[] },
  raster: Raster,
): { ab: number; breite: number } {
  const schritt = schrittweite(raster);
  const roh = Math.floor(diffDays(fenster.von, phase.startDate) / schritt);
  const ab = Math.max(0, roh);
  const ende = Math.floor(diffDays(fenster.von, phase.endDate) / schritt);
  const breite = Math.max(1, Math.min(fenster.spalten.length - ab, ende - ab + 1));
  return { ab, breite };
}

/** Wie viele Tage sind das, wenn man um `spalten` Spalten schiebt? */
export function spaltenInTage(spalten: number, raster: Raster): number {
  return spalten * schrittweite(raster);
}

/** Dauer einer Phase in Spalten – für die Beschriftung („3 Wochen"). */
export function dauerInSpalten(phase: Phase, raster: Raster): number {
  const schritt = schrittweite(raster);
  return Math.max(1, Math.round((diffDays(phase.startDate, phase.endDate) + 1) / schritt));
}

/** „3 Wochen" / „5 Tage" – ausgeschrieben für Balken und Druckansicht. */
export function dauerText(phase: Phase, raster: Raster): string {
  const n = dauerInSpalten(phase, raster);
  if (raster === 'WOCHE') return n === 1 ? '1 Woche' : `${n} Wochen`;
  return n === 1 ? '1 Tag' : `${n} Tage`;
}

/** Hilfsfunktion fürs Anlegen: eine neue Zeile hinten anhängen. */
export function naechsterStart(phasen: Phase[], raster: Raster, heute: IsoDate): IsoDate {
  if (!phasen.length) return aufRaster(heute, raster, 'anfang');
  const letztes = phasen.map((p) => p.endDate).reduce((a, b) => (a > b ? a : b));
  return aufRaster(addDays(letztes, 1), raster, 'anfang');
}

export { toIso };

/**
 * Die Monatsleiste über den Wochen.
 *
 * Auf einem Plan über ein halbes Jahr sagt „KW 7" niemandem etwas; „Februar"
 * schon. Gibt Gruppen zurück, die sich über mehrere Spalten spannen – der
 * Monat einer Woche ist der, in dem ihr Montag liegt. Eine Woche, die über
 * den Monatswechsel läuft, gehört damit zum früheren Monat; das ist beim
 * Ablesen die harmlosere Hälfte des Problems, weil die Spalte dort anfängt,
 * wo sie beschriftet ist.
 */
export function monatsSpannen(
  spalten: IsoDate[],
): { titel: string; kurz: string; spalten: number }[] {
  const MONATE = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];

  const gruppen: { titel: string; kurz: string; spalten: number }[] = [];
  for (const tag of spalten) {
    const monat = Number(tag.slice(5, 7)) - 1;
    const jahr = tag.slice(0, 4);
    const titel = `${MONATE[monat]} ${jahr}`;
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.titel === titel) letzte.spalten += 1;
    else gruppen.push({ titel, kurz: `${MONATE[monat].slice(0, 3)} ${jahr.slice(2)}`, spalten: 1 });
  }
  return gruppen;
}
