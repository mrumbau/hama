/**
 * Wann ist eine Doppelbelegung wirklich ein Konflikt?
 *
 * Zweimal am Tag eingeplant ist auf dem Bau der Normalfall: vormittags die
 * eine Baustelle, nachmittags die andere. Eine Warnung, die dabei jedes Mal
 * aufpoppt, wird nach zwei Tagen weggeklickt – und dann auch dort, wo sie
 * berechtigt gewesen wäre.
 */
import { describe, expect, it } from 'vitest';
import { zeitenUeberschneidenSich } from '@/server/assignments';

describe('Zeitfenster am selben Tag', () => {
  it('lässt vormittags und nachmittags nebeneinander zu', () => {
    expect(zeitenUeberschneidenSich('08:00', '12:00', '13:00', '17:00')).toBe(false);
  });

  it('meldet echte Überschneidungen', () => {
    expect(zeitenUeberschneidenSich('08:00', '14:00', '13:00', '17:00')).toBe(true);
  });

  it('lässt nahtlos anschließende Einsätze zu', () => {
    // 8–12 und 12–16: die Fahrt dazwischen ist Sache des Disponenten,
    // ein Konflikt ist es nicht.
    expect(zeitenUeberschneidenSich('08:00', '12:00', '12:00', '16:00')).toBe(false);
  });

  it('behandelt einen Einsatz ohne Uhrzeit als ganztägig', () => {
    // Steht keine Zeit dran, weiß niemand, wann die Person wo ist –
    // dann wird lieber einmal zu viel nachgefragt.
    expect(zeitenUeberschneidenSich(null, null, '13:00', '17:00')).toBe(true);
    expect(zeitenUeberschneidenSich('08:00', '12:00', null, null)).toBe(true);
    expect(zeitenUeberschneidenSich('08:00', null, '13:00', '17:00')).toBe(true);
  });

  it('kommt mit Sekunden und Leerzeichen zurecht', () => {
    expect(zeitenUeberschneidenSich(' 08:00:00 ', '12:00:00', '13:00', '17:00')).toBe(false);
  });
});
