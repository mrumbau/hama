/**
 * Die Tagesliste auf dem Handy.
 *
 * Der Fehler, der hier am teuersten wäre: Ein Einsatz über drei Tage fehlt
 * am mittleren Tag. Dann steht auf dem Handy, niemand sei auf der Baustelle,
 * während dort zwei Leute arbeiten.
 */
import { describe, expect, it } from 'vitest';
import { belegtUndLeer, einsaetzeAmTag, gruppiere } from '@/lib/tagesplan';

const EINSAETZE = [
  { id: 'a', projectId: 'p1', startDate: '2026-09-21', endDate: '2026-09-23' },
  { id: 'b', projectId: 'p1', startDate: '2026-09-22', endDate: '2026-09-22' },
  { id: 'c', projectId: 'p2', startDate: '2026-09-24', endDate: '2026-09-24' },
];

describe('Was läuft an diesem Tag', () => {
  it('nimmt mehrtägige Einsätze auch mittendrin mit', () => {
    expect(einsaetzeAmTag(EINSAETZE, '2026-09-22').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('nimmt den ersten und den letzten Tag mit', () => {
    expect(einsaetzeAmTag(EINSAETZE, '2026-09-21').map((e) => e.id)).toEqual(['a']);
    expect(einsaetzeAmTag(EINSAETZE, '2026-09-23').map((e) => e.id)).toEqual(['a']);
  });

  it('lässt den Tag davor und danach leer', () => {
    expect(einsaetzeAmTag(EINSAETZE, '2026-09-20')).toEqual([]);
    expect(einsaetzeAmTag(EINSAETZE, '2026-09-25')).toEqual([]);
  });
});

describe('Gruppieren', () => {
  it('behält die Reihenfolge innerhalb einer Gruppe', () => {
    const map = gruppiere(EINSAETZE, (e) => e.projectId);
    expect(map.get('p1')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(map.get('p2')?.map((e) => e.id)).toEqual(['c']);
  });
});

describe('Belegt und leer', () => {
  /*
   * Baustellen ohne Einsatz verschwinden nicht - sie stehen zusammengeklappt
   * darunter. Sonst könnte man auf dem Handy niemanden auf eine Baustelle
   * planen, auf der gerade keiner ist.
   */
  it('trennt Baustellen mit Einsatz von denen ohne', () => {
    const jeProjekt = gruppiere(einsaetzeAmTag(EINSAETZE, '2026-09-22'), (e) => e.projectId);
    const { belegt, leer } = belegtUndLeer([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], jeProjekt);
    expect(belegt.map((p) => p.id)).toEqual(['p1']);
    expect(leer.map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('zählt eine Baustelle ohne jeden Einsatz zu den leeren', () => {
    const { belegt, leer } = belegtUndLeer([{ id: 'p9' }], new Map());
    expect(belegt).toEqual([]);
    expect(leer.map((p) => p.id)).toEqual(['p9']);
  });
});
