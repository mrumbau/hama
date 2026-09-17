/** Zeitraum-Auflösung der Plantafel. Von Server und Client gemeinsam genutzt. */
import { addDays, endOfMonth, startOfMonth, startOfWeek, type IsoDate } from './dates';

export type BoardRange = 'tag' | 'sieben' | 'woche' | 'zweiwochen' | 'monat';

export function resolveRange(range: BoardRange, anchor: IsoDate): { from: IsoDate; to: IsoDate } {
  switch (range) {
    case 'tag':
      return { from: anchor, to: anchor };
    // Rollende sieben Tage ab dem Stichtag: „was steht als Nächstes an?"
    // Die Wochenansicht beantwortet eine andere Frage – sie zeigt die Woche
    // als Ganzes, auch wenn drei Tage davon vorbei sind.
    case 'sieben':
      return { from: anchor, to: addDays(anchor, 6) };
    case 'zweiwochen': {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 13) };
    }
    case 'monat':
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case 'woche':
    default: {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
  }
}
