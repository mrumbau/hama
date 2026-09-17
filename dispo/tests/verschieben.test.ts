/**
 * Was passiert, wenn man einen mehrtägigen Einsatz verschiebt?
 *
 * Bisher wurde der Zieltag zum neuen Beginn. Bei einer Mo–Fr-Baustelle,
 * die man am Mittwoch anfasst, sprang dadurch der ganze Block – es sah aus,
 * als hätte die App etwas kopiert und an der falschen Stelle abgelegt.
 */
import { describe, expect, it } from 'vitest';
import { verschobenerBeginn } from '@/lib/board-range';

describe('Beginn nach Drag & Drop', () => {
  // Mo 14.09. bis Fr 18.09.
  const beginn = '2026-09-14';

  it('verschiebt um die Differenz zum angefassten Tag', () => {
    // Mittwoch angefasst, auf Donnerstag gezogen = ein Tag nach hinten.
    expect(verschobenerBeginn(beginn, '2026-09-16', '2026-09-17')).toBe('2026-09-15');
  });

  it('verschiebt auch rückwärts korrekt', () => {
    // Freitag angefasst, auf Mittwoch gezogen = zwei Tage nach vorn.
    expect(verschobenerBeginn(beginn, '2026-09-18', '2026-09-16')).toBe('2026-09-12');
  });

  it('lässt den Beginn stehen, wenn man ihn selbst zieht', () => {
    expect(verschobenerBeginn(beginn, beginn, '2026-09-21')).toBe('2026-09-21');
  });

  it('ändert nichts, wenn man auf denselben Tag ablegt', () => {
    expect(verschobenerBeginn(beginn, '2026-09-16', '2026-09-16')).toBe(beginn);
  });

  it('verhält sich bei eintägigen Einsätzen wie zuvor', () => {
    expect(verschobenerBeginn('2026-09-15', '2026-09-15', '2026-09-18')).toBe('2026-09-18');
  });

  it('fällt ohne angefassten Tag auf das alte Verhalten zurück', () => {
    expect(verschobenerBeginn(beginn, null, '2026-09-17')).toBe('2026-09-17');
  });

  it('rechnet über einen Monatswechsel hinweg richtig', () => {
    expect(verschobenerBeginn('2026-09-28', '2026-09-30', '2026-10-02')).toBe('2026-09-30');
  });
});
