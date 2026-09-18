/**
 * Auswertung von Lager, Besorgungsfahrten, Urlaub und Krank.
 *
 * Die heikle Stelle ist die Verteilung auf Monate: Ein Urlaub vom 28. Juli
 * bis 8. August ist nicht „ein Urlaub im Juli", sondern vier Tage Juli und
 * acht Tage August. Wer das falsch zählt, bekommt Zahlen, die plausibel
 * aussehen und nicht stimmen – die schlimmste Sorte.
 */
import { describe, expect, it } from 'vitest';
import { tageJeMonat } from '@/server/auswertung';
import { ASSIGNMENT_KIND_LABEL } from '@/lib/labels';

describe('Tage auf Monate verteilen', () => {
  it('zählt einen Eintagseintrag als einen Tag', () => {
    expect(tageJeMonat('2026-03-05', '2026-03-05', 2026)).toEqual([{ monat: 3, tage: 1 }]);
  });

  it('zählt beide Enden mit', () => {
    // 1. bis 5. März sind fünf Tage, nicht vier.
    expect(tageJeMonat('2026-03-01', '2026-03-05', 2026)).toEqual([{ monat: 3, tage: 5 }]);
  });

  it('teilt über den Monatswechsel hinweg auf', () => {
    // 28.07. bis 08.08. = 4 Tage Juli (28,29,30,31) + 8 Tage August.
    expect(tageJeMonat('2026-07-28', '2026-08-08', 2026)).toEqual([
      { monat: 7, tage: 4 },
      { monat: 8, tage: 8 },
    ]);
  });

  it('nimmt aus einem Jahreswechsel nur das gefragte Jahr', () => {
    // 29.12.2026 bis 03.01.2027: für 2026 nur die drei Dezembertage.
    expect(tageJeMonat('2026-12-29', '2027-01-03', 2026)).toEqual([{ monat: 12, tage: 3 }]);
    expect(tageJeMonat('2026-12-29', '2027-01-03', 2027)).toEqual([{ monat: 1, tage: 3 }]);
  });

  it('rechnet den Schalttag mit', () => {
    // 2028 ist ein Schaltjahr: Februar hat 29 Tage.
    expect(tageJeMonat('2028-02-01', '2028-02-29', 2028)).toEqual([{ monat: 2, tage: 29 }]);
  });

  it('liefert nichts, wenn der Zeitraum das Jahr nicht berührt', () => {
    expect(tageJeMonat('2025-05-01', '2025-05-10', 2026)).toEqual([]);
  });
});


/**
 * Besorgungsfahrten stehen an zwei Stellen: als eigene Zeile in der
 * Ressourcenansicht und als Einsatzart auf einer echten Baustelle. Die
 * Auswertung darf nicht davon abhängen, wo jemand geklickt hat.
 */
describe('Besorgungsfahrten aus beiden Quellen', () => {
  it('zählt die Einsatzart als gültigen Wert', () => {
    // Fällt auf, wenn jemand den Enum-Wert wieder entfernt.
    expect(ASSIGNMENT_KIND_LABEL.BESORGUNGSFAHRT).toBe('Besorgungsfahrt');
  });
});
