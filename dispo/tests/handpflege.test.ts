/**
 * Was von Hand geändert wurde, gewinnt gegen den Abgleich.
 *
 * Der Anlass war konkret: „Lechmann" wurde zu „Lachmann" korrigiert, und der
 * nächste Abgleich hat es zurückgesetzt. Ab zehn Minuten Takt passiert das
 * sechsmal pro Stunde – deshalb ist das hier kein Schönheitsfehler.
 */
import { describe, expect, it } from 'vitest';
import {
  ergaenzeHandarbeit,
  istPlatzhalter,
  neueHandarbeit,
  ohneHandarbeit,
  ohnePlatzhalter,
} from '@/server/handpflege';

describe('Handarbeit erkennen', () => {
  it('merkt sich nur, was wirklich geändert wurde', () => {
    const vorher = { companyName: 'Lechmann', phone: '+49 89 1', city: 'München' };
    const eingabe = { companyName: 'Lachmann', phone: '+49 89 1', city: 'München' };
    expect(neueHandarbeit(vorher, eingabe)).toEqual(['companyName']);
  });

  it('sperrt nichts, wenn jemand ein Formular nur öffnet und speichert', () => {
    const vorher = { companyName: 'Lechmann', phone: '+49 89 1' };
    expect(neueHandarbeit(vorher, { companyName: 'Lechmann', phone: '+49 89 1' })).toEqual([]);
  });

  it('lässt sich von Leerzeichen und fehlenden Werten nicht täuschen', () => {
    const vorher = { companyName: 'Lachmann', note: null };
    expect(neueHandarbeit(vorher, { companyName: '  Lachmann  ' })).toEqual([]);
    // Nicht mitgeschickte Felder sind keine Änderung.
    expect(neueHandarbeit(vorher, { companyName: undefined })).toEqual([]);
  });

  it('sammelt über mehrere Bearbeitungen hinweg, ohne Dubletten', () => {
    expect(ergaenzeHandarbeit(['phone'], ['companyName', 'phone'])).toEqual([
      'companyName',
      'phone',
    ]);
  });
});

describe('Abgleich gegen Handarbeit', () => {
  it('lässt ein von Hand gesetztes Feld in Ruhe', () => {
    const ausDemErp = { companyName: 'Lechmann', phone: '+49 89 999', city: 'München' };
    expect(ohneHandarbeit(ausDemErp, ['companyName'])).toEqual({
      phone: '+49 89 999',
      city: 'München',
    });
  });

  it('füllt weiterhin Lücken – dafür ist er da', () => {
    const ausDemErp = { companyName: 'Lechmann', email: 'info@example.org' };
    expect(ohneHandarbeit(ausDemErp, [])).toEqual(ausDemErp);
  });

  it('ersetzt Vorhandenes nie durch Leere', () => {
    expect(ohneHandarbeit({ phone: null, email: '', city: 'München' }, [])).toEqual({
      city: 'München',
    });
  });
});

describe('Platzhalter', () => {
  it('erkennt die Texte, die bei fehlgeschlagenem Abruf entstehen', () => {
    expect(istPlatzhalter('Unbekannter Kunde')).toBe(true);
    expect(istPlatzhalter('unbenanntes projekt')).toBe(true);
    expect(istPlatzhalter('  Unbekannt ')).toBe(true);
  });

  it('hält echte Namen nicht für Platzhalter', () => {
    expect(istPlatzhalter('Familie Märkl')).toBe(false);
    expect(istPlatzhalter('Unbekannt GmbH')).toBe(false);
  });

  it('wirft Platzhalter aus den Daten des Abgleichs', () => {
    const erp = { customerName: 'Unbekannter Kunde', name: 'Badsanierung', city: 'Aying' };
    expect(ohnePlatzhalter(erp)).toEqual({ name: 'Badsanierung', city: 'Aying' });
  });
});

/**
 * Der Ausweis des Zeitplans darf nicht über die Einstellungen herausfallen.
 * Die Antwort dort sieht jeder Angemeldete.
 */
describe('Geheimnisse in den Einstellungen', () => {
  // Dieselbe Regel wie in src/app/api/settings/route.ts.
  const istKeinGeheimnis = (key: string) =>
    !/(token|secret|geheimnis|passwort|password)$/i.test(key);

  it('hält Ausweise zurück', () => {
    for (const key of ['cronToken', 'apiSecret', 'startPasswort', 'dbPassword']) {
      expect(istKeinGeheimnis(key)).toBe(false);
    }
  });

  it('lässt gewöhnliche Einstellungen durch', () => {
    for (const key of ['erpMutationen', 'ampelSchwelle', 'tokenAnzeige']) {
      expect(istKeinGeheimnis(key)).toBe(true);
    }
  });
});
