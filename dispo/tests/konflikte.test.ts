/**
 * Wann ist eine Doppelbelegung wirklich ein Konflikt?
 *
 * Zweimal am Tag eingeplant ist auf dem Bau der Normalfall: vormittags die
 * eine Baustelle, nachmittags die andere. Eine Warnung, die dabei jedes Mal
 * aufpoppt, wird nach zwei Tagen weggeklickt – und dann auch dort, wo sie
 * berechtigt gewesen wäre.
 */
import { describe, expect, it } from 'vitest';
import { zeitenUeberschneidenSich, zeitfenster } from '@/lib/zeitfenster';

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

  it('behandelt einen Einsatz ganz ohne Uhrzeit als ganztägig', () => {
    // Steht gar keine Zeit dran, weiß niemand, wann die Person wo ist –
    // dann wird lieber einmal zu viel nachgefragt.
    expect(zeitenUeberschneidenSich(null, null, '13:00', '17:00')).toBe(true);
    expect(zeitenUeberschneidenSich('08:00', '12:00', null, null)).toBe(true);
  });

  it('liest „ab 11 Uhr" als „von 11 bis Feierabend", nicht als ganztägig', () => {
    /*
     * Der Fall aus dem Alltag, der vorher falsch rot wurde: Fidan von 7 bis
     * 9 Uhr auf der einen Baustelle, danach ab 11 Uhr auf der anderen. Die
     * beiden kämpfen nicht um ihn – die erste ist längst vorbei.
     */
    expect(zeitenUeberschneidenSich('07:00', '09:00', '11:00', null)).toBe(false);
    expect(zeitenUeberschneidenSich('11:00', null, '07:00', '09:00')).toBe(false);

    // Umgekehrt bleibt es ein Konflikt, wenn der offene Einsatz früher beginnt.
    expect(zeitenUeberschneidenSich('08:00', null, '13:00', '17:00')).toBe(true);
    expect(zeitenUeberschneidenSich('11:00', null, '14:00', '16:00')).toBe(true);
  });

  it('liest „bis 12 Uhr" als „von früh bis 12"', () => {
    expect(zeitenUeberschneidenSich(null, '12:00', '13:00', '17:00')).toBe(false);
    expect(zeitenUeberschneidenSich(null, '12:00', '11:00', '15:00')).toBe(true);
  });

  it('macht aus einem verdrehten Zeitpaar keinen leeren Zeitraum', () => {
    // 18:00–06:00 ist entweder ein Vertipper oder eine Nachtschicht. Beides
    // gilt als offen bis Tagesende – ein negativer Zeitraum würde mit nichts
    // mehr kollidieren und die Warnung stillschweigend abschalten.
    expect(zeitenUeberschneidenSich('18:00', '06:00', '19:00', '20:00')).toBe(true);
    expect(zeitenUeberschneidenSich('18:00', '06:00', '07:00', '09:00')).toBe(false);
  });

  it('kommt mit Sekunden und Leerzeichen zurecht', () => {
    expect(zeitenUeberschneidenSich(' 08:00:00 ', '12:00:00', '13:00', '17:00')).toBe(false);
  });
});

describe('Das Zeitfenster selbst', () => {
  it('spannt ohne jede Angabe über den ganzen Tag', () => {
    expect(zeitfenster(null, null)).toEqual({ von: 0, bis: 1440, ganztags: true });
  });

  it('läuft ab einem Beginn bis Tagesende', () => {
    expect(zeitfenster('11:00', null)).toEqual({ von: 660, bis: 1440, ganztags: false });
  });

  it('läuft von Tagesbeginn bis zu einem Ende', () => {
    expect(zeitfenster(null, '12:00')).toEqual({ von: 0, bis: 720, ganztags: false });
  });

  it('nimmt beide Grenzen, wenn beide dastehen', () => {
    expect(zeitfenster('07:00', '09:00')).toEqual({ von: 420, bis: 540, ganztags: false });
  });
});

describe('Filter „Aktuell"', () => {
  /**
   * Der Blick nach vorn. Heute ist Donnerstag, der 17.09. – die Woche
   * begann am Montag, dem 14.09. Was davor endete, ist erledigt und gehört
   * nicht mehr in die Übersicht, auch wenn der angezeigte Zeitraum es noch
   * umfasst.
   */
  const wochenBeginn = '2026-09-14';

  const laeuftNochAn = (ende: string | null, einsatzEnde: string | null) => {
    const endeOk = ende !== null && ende >= wochenBeginn;
    const einsatzOk = einsatzEnde !== null && einsatzEnde >= wochenBeginn;
    return endeOk || einsatzOk;
  };

  it('behält, was diese Woche noch läuft', () => {
    expect(laeuftNochAn('2026-09-18', null)).toBe(true);
    expect(laeuftNochAn('2026-09-14', null)).toBe(true);
  });

  it('wirft weg, was vergangene Woche endete', () => {
    expect(laeuftNochAn('2026-09-11', null)).toBe(false);
  });

  it('behält eine Baustelle, an der noch jemand eingeplant ist', () => {
    // Der Bauzeitraum ist abgelaufen, aber es steht noch ein Einsatz an –
    // dann ist die Baustelle nicht erledigt, sondern überzogen.
    expect(laeuftNochAn('2026-09-10', '2026-09-22')).toBe(true);
  });

  it('wirft weg, was gar keine Termine hat', () => {
    expect(laeuftNochAn(null, null)).toBe(false);
  });
});
