/**
 * Wer darf was auf der Plantafel ändern?
 *
 * Der Anlass: Die Ressourcen sind begrenzt, und niemand soll den Monteur
 * wegschieben, den ein anderer fest zugesagt hat. Gleichzeitig sollen die
 * Bauleiter vorausplanen können. Hier wird festgenagelt, wo die Grenze
 * liegt – besonders die Fälle, in denen NICHTS passieren darf.
 */
import { describe, expect, it } from 'vitest';
import {
  darfAendern,
  darfVerbindlichPlanen,
  statusBeimAnlegen,
  verlangeAenderungsrecht,
  verlangeStatusrecht,
} from '@/server/planung';

const marlon = { id: 'u-mt', role: 'ADMIN' } as never;
const carsten = { id: 'u-cr', role: 'LEITUNG' } as never;
const philipp = { id: 'u-ps', role: 'BAULEITER' } as never;
const gerhard = { id: 'u-gp', role: 'BAULEITER' } as never;

describe('Wer darf verbindlich planen', () => {
  it('Marlon und Carsten – sonst niemand', () => {
    expect(darfVerbindlichPlanen(marlon)).toBe(true);
    expect(darfVerbindlichPlanen(carsten)).toBe(true);
    expect(darfVerbindlichPlanen(philipp)).toBe(false);
    expect(darfVerbindlichPlanen(null)).toBe(false);
  });
});

describe('Status beim Anlegen', () => {
  it('macht aus der Planung eines Bauleiters einen Vorschlag', () => {
    expect(statusBeimAnlegen(philipp)).toBe('VORSCHLAG');
  });

  it('lässt einen Bauleiter seinen Vorschlag nicht selbst zum Termin erklären', () => {
    // Auch wenn er BESTAETIGT mitschickt - sonst waere die Freigabe eine
    // Formalitaet, die man umgeht.
    expect(statusBeimAnlegen(philipp, 'BESTAETIGT')).toBe('VORSCHLAG');
  });

  it('plant die Leitung verbindlich', () => {
    expect(statusBeimAnlegen(marlon)).toBe('GEPLANT');
    expect(statusBeimAnlegen(carsten, 'BESTAETIGT')).toBe('BESTAETIGT');
  });
});

describe('Ändern und Löschen', () => {
  const eigenerVorschlag = { status: 'VORSCHLAG' as const, createdById: 'u-ps' };
  const fremderVorschlag = { status: 'VORSCHLAG' as const, createdById: 'u-gp' };
  const festerTermin = { status: 'BESTAETIGT' as const, createdById: 'u-ps' };
  const geplant = { status: 'GEPLANT' as const, createdById: 'u-mt' };

  it('lässt jeden seinen eigenen Vorschlag umbauen', () => {
    // Das kostet niemanden etwas - und ohne das koennte der Bauleiter drei
    // Wochen lang nichts korrigieren.
    expect(darfAendern(philipp, eigenerVorschlag)).toBe(true);
  });

  it('lässt niemanden an den Vorschlag eines anderen', () => {
    expect(darfAendern(philipp, fremderVorschlag)).toBe(false);
  });

  it('schützt bestätigte Termine vor den Bauleitern', () => {
    // Auch den eigenen: Was zugesagt ist, aendert nur die Leitung.
    expect(darfAendern(philipp, festerTermin)).toBe(false);
  });

  it('schützt auch die verbindliche Planung der Leitung', () => {
    expect(darfAendern(philipp, geplant)).toBe(false);
    expect(darfAendern(gerhard, geplant)).toBe(false);
  });

  it('lässt die Leitung alles', () => {
    for (const einsatz of [eigenerVorschlag, fremderVorschlag, festerTermin, geplant]) {
      expect(darfAendern(marlon, einsatz)).toBe(true);
      expect(darfAendern(carsten, einsatz)).toBe(true);
    }
  });

  it('sagt beim Abweisen, woran es liegt', () => {
    expect(() => verlangeAenderungsrecht(philipp, fremderVorschlag)).toThrow(/jemand anderem/i);
    expect(() => verlangeAenderungsrecht(philipp, festerTermin)).toThrow(/verbindlich/i);
    // Und bei erlaubtem Zugriff eben nicht.
    expect(() => verlangeAenderungsrecht(philipp, eigenerVorschlag)).not.toThrow();
  });
});

describe('Status setzen', () => {
  it('lässt einen Bauleiter nicht selbst bestätigen', () => {
    expect(() => verlangeStatusrecht(philipp, 'BESTAETIGT')).toThrow(/Leitung/i);
    expect(() => verlangeStatusrecht(philipp, 'GEPLANT')).toThrow(/Leitung/i);
  });

  it('lässt einen Vorschlag Vorschlag bleiben', () => {
    expect(() => verlangeStatusrecht(philipp, 'VORSCHLAG')).not.toThrow();
    expect(() => verlangeStatusrecht(philipp, undefined)).not.toThrow();
  });

  it('lässt die Leitung jeden Status setzen', () => {
    expect(() => verlangeStatusrecht(carsten, 'BESTAETIGT')).not.toThrow();
  });
});
