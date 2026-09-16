import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  endOfMonth,
  isoWeek,
  isWeekend,
  overlaps,
  rangeDays,
  startOfWeek,
} from '@/lib/dates';
import { normalizePhone, phoneTail } from '@/lib/utils';

describe('Datums-Helfer', () => {
  it('rechnet Tage über Monatsgrenzen korrekt', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-09-14', '2026-09-20')).toBe(6);
  });

  it('übersteht die Sommerzeit-Umstellung ohne Tagesversatz', () => {
    // In Deutschland endet die Sommerzeit am 25.10.2026.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('liefert Montag als Wochenanfang', () => {
    expect(startOfWeek('2026-09-16')).toBe('2026-09-14'); // Mittwoch -> Montag
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14'); // Montag bleibt
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14'); // Sonntag -> Montag davor
  });

  it('erkennt Wochenenden und Monatsenden', () => {
    expect(isWeekend('2026-09-19')).toBe(true); // Samstag
    expect(isWeekend('2026-09-18')).toBe(false); // Freitag
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('erzeugt vollständige Tagesbereiche', () => {
    const days = rangeDays('2026-09-14', '2026-09-20');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-09-14');
    expect(days[6]).toBe('2026-09-20');
  });

  it('berechnet die Kalenderwoche', () => {
    expect(isoWeek('2026-09-16')).toBe(38);
  });

  it('erkennt Überschneidungen', () => {
    expect(overlaps('2026-09-14', '2026-09-16', '2026-09-16', '2026-09-18')).toBe(true);
    expect(overlaps('2026-09-14', '2026-09-15', '2026-09-16', '2026-09-18')).toBe(false);
  });
});

describe('Telefonnummern', () => {
  it('normalisiert deutsche Schreibweisen auf dieselbe Form', () => {
    expect(normalizePhone('+49 8024 998877')).toBe('08024998877');
    expect(normalizePhone('0049 8024 998877')).toBe('08024998877');
    expect(normalizePhone('08024/99 88 77')).toBe('08024998877');
  });

  it('vergleicht über die letzten Stellen', () => {
    expect(phoneTail('+49 8024 998877')).toBe(phoneTail('08024 998877'));
    expect(phoneTail(null)).toBeNull();
  });
});
