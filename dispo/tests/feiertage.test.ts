/**
 * Feiertage in Bayern (München).
 *
 * Die beweglichen hängen alle an Ostern, und Ostern rechnet man nicht im
 * Kopf nach. Deshalb hier gegen bekannte Daten geprüft, nicht gegen die
 * eigene Formel.
 */
import { describe, expect, it } from 'vitest';
import { feiertageBayern, feiertageZwischen, ostersonntag } from '@/lib/feiertage';

const datum = (jahr: number, name: string) =>
  feiertageBayern(jahr).find((f) => f.name === name)?.datum;

describe('Ostersonntag', () => {
  it('trifft bekannte Jahre', () => {
    // Nachschlagbare Daten, nicht aus der eigenen Formel abgeleitet.
    expect(ostersonntag(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(ostersonntag(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(ostersonntag(2028).toISOString().slice(0, 10)).toBe('2028-04-16');
    expect(ostersonntag(2029).toISOString().slice(0, 10)).toBe('2029-04-01');
  });
});

describe('Bewegliche Feiertage', () => {
  it('hängt Karfreitag und Ostermontag richtig an Ostern', () => {
    expect(datum(2026, 'Karfreitag')).toBe('2026-04-03');
    expect(datum(2026, 'Ostermontag')).toBe('2026-04-06');
  });

  it('rechnet Christi Himmelfahrt, Pfingstmontag und Fronleichnam', () => {
    expect(datum(2026, 'Christi Himmelfahrt')).toBe('2026-05-14');
    expect(datum(2026, 'Pfingstmontag')).toBe('2026-05-25');
    expect(datum(2026, 'Fronleichnam')).toBe('2026-06-04');
  });
});

describe('Bayerische Besonderheiten', () => {
  it('kennt Mariä Himmelfahrt – in München ein Feiertag', () => {
    expect(datum(2026, 'Mariä Himmelfahrt')).toBe('2026-08-15');
  });

  it('führt das Augsburger Friedensfest NICHT – das gilt nur in Augsburg', () => {
    const namen = feiertageBayern(2026).map((f) => f.name);
    expect(namen.some((n) => /Friedensfest/i.test(n))).toBe(false);
  });

  it('kennt Heilige Drei Könige und Allerheiligen – anderswo keine Feiertage', () => {
    expect(datum(2026, 'Heilige Drei Könige')).toBe('2026-01-06');
    expect(datum(2026, 'Allerheiligen')).toBe('2026-11-01');
  });

  it('führt keinen Reformationstag und keinen Buß- und Bettag', () => {
    const namen = feiertageBayern(2026).map((f) => f.name);
    expect(namen.some((n) => /Reformation|Buß/i.test(n))).toBe(false);
  });

  it('hat dreizehn Feiertage im Jahr', () => {
    expect(feiertageBayern(2026)).toHaveLength(13);
    expect(feiertageBayern(2030)).toHaveLength(13);
  });
});

describe('Nachschlagewerk für einen Zeitraum', () => {
  it('findet nur, was im Zeitraum liegt', () => {
    const karte = feiertageZwischen('2026-12-20', '2027-01-10');
    expect(karte.get('2026-12-25')).toBe('1. Weihnachtstag');
    expect(karte.get('2027-01-01')).toBe('Neujahr');
    expect(karte.get('2027-01-06')).toBe('Heilige Drei Könige');
    // Der 3. Oktober liegt weit ausserhalb.
    expect(karte.has('2026-10-03')).toBe(false);
  });

  it('kommt über den Jahreswechsel hinweg', () => {
    const karte = feiertageZwischen('2026-01-01', '2030-12-31');
    // Fünf Jahre zu je dreizehn.
    expect(karte.size).toBe(65);
  });
});
