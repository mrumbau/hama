/**
 * Der Bauzeitenplan.
 *
 * Die eine Regel, auf die es ankommt: Wird ein Gewerk nach hinten geschoben,
 * rutscht der Rest mit. Ein Plan, bei dem nur der Sanitärer wandert und die
 * Fliesen stehen bleiben, ist falsch – und zwar auf eine Art, die man erst
 * auf der Baustelle merkt.
 */
import { describe, expect, it } from 'vitest';
import {
  aufRaster,
  balken,
  dauerAendern,
  dauerText,
  monatsSpannen,
  naechsterStart,
  spalten,
  spaltenTitel,
  verschiebeAbHier,
  verschiebeNurDiese,
} from '@/lib/bauzeitenplan';

/** Ein kleiner Plan, wie er wirklich aussieht – mit zwei parallelen Gewerken. */
const PLAN = [
  { id: 'abbruch', startDate: '2026-10-05', endDate: '2026-10-11' }, // KW 41
  { id: 'elektro', startDate: '2026-10-12', endDate: '2026-10-18' }, // KW 42
  { id: 'sanitaer', startDate: '2026-10-12', endDate: '2026-10-25' }, // KW 42–43, parallel
  { id: 'estrich', startDate: '2026-10-26', endDate: '2026-11-01' }, // KW 44
];

const nach = (ergebnis: { id: string; startDate: string }[]) =>
  Object.fromEntries(ergebnis.map((e) => [e.id, e.startDate]));

describe('Eine Woche nach rechts', () => {
  it('schiebt das angefasste Gewerk und alles danach', () => {
    const ergebnis = nach(verschiebeAbHier(PLAN, 'sanitaer', 7));

    expect(ergebnis.sanitaer).toBe('2026-10-19');
    expect(ergebnis.estrich).toBe('2026-11-02');
  });

  it('nimmt parallele Gewerke derselben Woche mit', () => {
    /*
     * Elektro beginnt in derselben Woche wie Sanitär. Bliebe es stehen,
     * liefe es plötzlich vor dem Sanitärer – der Plan wäre ein anderer.
     */
    const ergebnis = nach(verschiebeAbHier(PLAN, 'sanitaer', 7));
    expect(ergebnis.elektro).toBe('2026-10-19');
  });

  it('lässt alles davor in Ruhe', () => {
    const ergebnis = nach(verschiebeAbHier(PLAN, 'sanitaer', 7));
    expect(ergebnis.abbruch).toBeUndefined();
  });

  it('behält die Abstände – der Plan behält seine Form', () => {
    const vorher = PLAN.map((p) => p.startDate);
    const ergebnis = verschiebeAbHier(PLAN, 'abbruch', 14);
    const nachher = ergebnis.map((p) => p.startDate);

    // Alle vier wandern, und zwar um genau dieselbe Zahl Tage.
    expect(ergebnis).toHaveLength(4);
    for (let i = 0; i < vorher.length; i++) {
      expect(new Date(nachher[i]).getTime() - new Date(vorher[i]).getTime()).toBe(
        14 * 86_400_000,
      );
    }
  });

  it('schiebt genauso nach links', () => {
    const ergebnis = nach(verschiebeAbHier(PLAN, 'elektro', -7));
    expect(ergebnis.elektro).toBe('2026-10-05');
    expect(ergebnis.estrich).toBe('2026-10-19');
    expect(ergebnis.abbruch).toBeUndefined();
  });

  it('tut nichts bei null Tagen oder unbekannter Zeile', () => {
    expect(verschiebeAbHier(PLAN, 'sanitaer', 0)).toEqual([]);
    expect(verschiebeAbHier(PLAN, 'gibtsnicht', 7)).toEqual([]);
  });
});

describe('Nur diese eine Zeile', () => {
  it('lässt den Rest stehen', () => {
    const ergebnis = verschiebeNurDiese(PLAN, 'elektro', 7);
    expect(ergebnis).toHaveLength(1);
    expect(ergebnis[0]).toMatchObject({ id: 'elektro', startDate: '2026-10-19' });
  });
});

describe('Dauer ändern', () => {
  const phase = { id: 'x', startDate: '2026-10-12', endDate: '2026-10-18' };

  it('verlängert um eine Woche', () => {
    expect(dauerAendern(phase, 7, 'WOCHE')).toBe('2026-10-25');
  });

  it('lässt keinen Balken verschwinden', () => {
    // Zwei Wochen kürzer als eine Woche lang: bleibt eine Woche.
    expect(dauerAendern(phase, -14, 'WOCHE')).toBe('2026-10-18');
  });

  it('kennt im Tagesraster auch einen einzelnen Tag', () => {
    expect(dauerAendern(phase, -14, 'TAG')).toBe('2026-10-12');
  });
});

describe('Einrasten', () => {
  it('zieht einen Wochenbeginn auf den Montag', () => {
    // Der 14.10.2026 ist ein Mittwoch.
    expect(aufRaster('2026-10-14', 'WOCHE', 'anfang')).toBe('2026-10-12');
    expect(aufRaster('2026-10-14', 'WOCHE', 'ende')).toBe('2026-10-18');
  });

  it('lässt im Tagesraster alles, wo es ist', () => {
    expect(aufRaster('2026-10-14', 'TAG', 'anfang')).toBe('2026-10-14');
  });

  it('rührt einen Montag nicht an', () => {
    expect(aufRaster('2026-10-12', 'WOCHE', 'anfang')).toBe('2026-10-12');
  });
});

describe('Das sichtbare Fenster', () => {
  it('umfasst alle Balken und etwas Luft', () => {
    const f = spalten(PLAN, 'WOCHE', '2026-10-01');
    expect(f.von <= '2026-10-05').toBe(true);
    expect(f.bis >= '2026-11-01').toBe(true);
    // Luft auf beiden Seiten: man will sehen, wohin man schieben kann.
    expect(f.von < '2026-10-05').toBe(true);
  });

  it('beginnt bei einem leeren Plan bei heute', () => {
    const f = spalten([], 'WOCHE', '2026-10-14');
    expect(f.spalten.length).toBeGreaterThan(4);
    expect(f.von <= '2026-10-14').toBe(true);
  });

  it('beschriftet Wochen mit der Kalenderwoche', () => {
    expect(spaltenTitel('2026-10-12', 'WOCHE')).toMatch(/^KW \d+$/);
  });

  it('beschriftet Tage mit Wochentag und Datum', () => {
    expect(spaltenTitel('2026-10-14', 'TAG')).toBe('Mi 14.10.');
  });
});

describe('Wo liegt ein Balken', () => {
  const fenster = spalten(PLAN, 'WOCHE', '2026-10-01');

  it('ist so breit wie die Phase dauert', () => {
    const sanitaer = PLAN[2]; // zwei Wochen
    expect(balken(sanitaer, fenster, 'WOCHE').breite).toBe(2);
  });

  it('schneidet einen Balken ab, der links herausragt', () => {
    const frueh = { id: 'f', startDate: '2020-01-06', endDate: '2026-10-11' };
    const b = balken(frueh, fenster, 'WOCHE');
    expect(b.ab).toBe(0);
    expect(b.breite).toBeGreaterThan(0);
  });
});

describe('Beschriftung und neue Zeilen', () => {
  it('schreibt die Dauer aus', () => {
    expect(dauerText(PLAN[0], 'WOCHE')).toBe('1 Woche');
    expect(dauerText(PLAN[2], 'WOCHE')).toBe('2 Wochen');
    expect(dauerText(PLAN[0], 'TAG')).toBe('7 Tage');
  });

  it('hängt eine neue Zeile hinter die letzte', () => {
    // Estrich endet am 01.11. (Sonntag), also beginnt die neue Zeile am 02.11.
    expect(naechsterStart(PLAN, 'WOCHE', '2026-10-01')).toBe('2026-11-02');
  });

  it('beginnt bei leerem Plan in der Woche von heute', () => {
    expect(naechsterStart([], 'WOCHE', '2026-10-14')).toBe('2026-10-12');
  });
});

describe('Monatsleiste', () => {
  it('fasst die Wochen eines Monats zu einer Spanne zusammen', () => {
    // Montage vom 28.09. bis zum 02.11.2026.
    const wochen = [
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
    ];
    const spannen = monatsSpannen(wochen);
    expect(spannen.map((m) => [m.titel, m.spalten])).toEqual([
      ['September 2026', 1],
      ['Oktober 2026', 4],
      ['November 2026', 1],
    ]);
  });

  it('deckt genau so viele Spalten ab, wie es Wochen gibt', () => {
    const wochen = ['2026-12-28', '2027-01-04', '2027-01-11'];
    const spannen = monatsSpannen(wochen);
    // Der Jahreswechsel darf keine Spalte verschlucken und keine erfinden -
    // sonst rutscht die ganze Leiste gegen die Wochen darunter.
    expect(spannen.reduce((n, m) => n + m.spalten, 0)).toBe(wochen.length);
    expect(spannen.map((m) => m.titel)).toEqual(['Dezember 2026', 'Januar 2027']);
  });

  it('kommt mit einer leeren Achse zurecht', () => {
    expect(monatsSpannen([])).toEqual([]);
  });
});
