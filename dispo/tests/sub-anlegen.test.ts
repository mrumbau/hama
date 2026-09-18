/**
 * Was beim Anlegen eines Subunternehmers in „Das Programm" ankommt.
 *
 * Der Kommentar ist die einzige Stelle, an der dort steht, dass ein
 * Lieferant ein Subunternehmer ist. Schreibt die Dispo ihn anders, als der
 * Abgleich ihn liest, findet sie ihren eigenen Betrieb beim nächsten Lauf
 * nicht wieder – deshalb wird hier beides gegeneinander geprüft.
 */
import { describe, expect, it } from 'vitest';
import {
  baueKommentar,
  erlaubtLieferanten,
  trenneHausnummer,
} from '@/server/integrations/sub-anlegen';
import { istSubunternehmer, leseGewerke } from '@/server/integrations/mapping';

describe('Kommentar für Das Programm', () => {
  it('kennzeichnet den Betrieb und nennt die Gewerke', () => {
    const k = baueKommentar(['Trockenbau', 'Innenausbau'], null);
    expect(k).toContain('Subunternehmer – Trockenbau, Innenausbau');
  });

  it('wird vom eigenen Abgleich wiedererkannt', () => {
    // Der entscheidende Test: schreiben und lesen müssen zusammenpassen.
    const k = baueKommentar(['Trockenbau', 'Innenausbau'], 'Freigabe liegt vor');
    expect(istSubunternehmer({ comment: k, name: 'Huber' })).toBe(true);
    expect(leseGewerke(k)).toEqual(['Trockenbau', 'Innenausbau']);
  });

  it('nimmt die Notiz mit, ohne die Gewerke zu verfälschen', () => {
    const k = baueKommentar(['Elektro'], 'Nur vormittags erreichbar');
    expect(k).toContain('Nur vormittags erreichbar');
    expect(leseGewerke(k)).toEqual(['Elektro']);
  });

  it('kommt ohne Gewerke aus', () => {
    const k = baueKommentar([], null);
    expect(istSubunternehmer({ comment: k, name: 'Huber' })).toBe(true);
    expect(leseGewerke(k)).toEqual([]);
  });
});

describe('Hausnummer von der Straße trennen', () => {
  it('trennt die üblichen Schreibweisen', () => {
    expect(trenneHausnummer('Rosenstraße 12')).toEqual({
      strasse: 'Rosenstraße',
      hausnummer: '12',
    });
    expect(trenneHausnummer('Dorfstraße 9a')).toEqual({ strasse: 'Dorfstraße', hausnummer: '9a' });
    expect(trenneHausnummer('Cimbernstraße 79 i')).toEqual({
      strasse: 'Cimbernstraße',
      hausnummer: '79i',
    });
  });

  it('lässt eine Straße ohne Hausnummer unangetastet', () => {
    expect(trenneHausnummer('Marktplatz')).toEqual({ strasse: 'Marktplatz', hausnummer: null });
  });

  it('verliert nichts bei leerer Eingabe', () => {
    expect(trenneHausnummer(null)).toEqual({ strasse: null, hausnummer: null });
    expect(trenneHausnummer('  ')).toEqual({ strasse: null, hausnummer: null });
  });
});

/**
 * „Das Programm" kennt keinen Schreibbefehl für Lieferanten – das hat die
 * Abfrage seines Schemas ergeben. Es trotzdem zu versuchen, brächte dem
 * Anwender nur eine unverständliche Fehlermeldung aus der Schnittstelle.
 */
describe('Übertrag nach Das Programm', () => {
  const auskunft = (liste: string[] | null) => JSON.stringify({ stand: '2026-09-18', liste });

  it('versucht es nicht, wenn die Schnittstelle den Befehl nicht kennt', () => {
    expect(erlaubtLieferanten(auskunft(['updateProject', 'createCustomer']))).toBe(false);
  });

  it('versucht es, wenn der Befehl da ist', () => {
    expect(erlaubtLieferanten(auskunft(['createSupplier', 'updateProject']))).toBe(true);
  });

  it('versucht es im Zweifel – lieber einmal vergeblich als einen Weg verbauen', () => {
    expect(erlaubtLieferanten(null)).toBe(true);
    expect(erlaubtLieferanten(auskunft(null))).toBe(true);
    expect(erlaubtLieferanten('kein json')).toBe(true);
  });
});
