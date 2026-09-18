/**
 * Anmeldung mit Microsoft-Konto.
 *
 * Die heiklen Stellen sind nicht der Normalfall, sondern der Missbrauch:
 * Kann jemand einem Kollegen eine fremde Anmeldung unterschieben? Kommt ein
 * Microsoft-Konto aus einem anderen Unternehmen herein? Beides wird hier
 * festgenagelt.
 */
import { describe, expect, it } from 'vitest';
import {
  anmeldeAdresse,
  baueState,
  erklaereMicrosoftFehler,
  geheimnisForm,
  leseIdToken,
  pruefeState,
  rueckkehrAdresse,
} from '@/server/microsoft';

const GEHEIM = 'test-geheimnis';
const KONFIG = {
  tenantId: 'mrumbau-tenant',
  clientId: 'client-123',
  clientSecret: 'secret',
};

function jwt(inhalt: Record<string, unknown>): string {
  const teil = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${teil({ alg: 'RS256' })}.${teil(inhalt)}.unterschrift`;
}

describe('Weg zu Microsoft', () => {
  it('fragt nur nach Name und E-Mail', () => {
    const url = new URL(anmeldeAdresse(KONFIG, 'https://dispo.example/cb', 'state123'));
    // Kein Zugriff auf Postfach oder Kalender – die Dispo braucht nur zu
    // wissen, wer da kommt.
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.pathname).toContain('mrumbau-tenant');
  });

  it('nennt die Rückkehradresse, die eingetragen werden muss', () => {
    expect(rueckkehrAdresse('https://dispo.example')).toBe(
      'https://dispo.example/api/auth/microsoft/callback',
    );
  });
});

describe('Schutz gegen untergeschobene Anmeldungen', () => {
  it('erkennt den eigenen state wieder', () => {
    const state = baueState(GEHEIM, '/plantafel');
    expect(pruefeState(GEHEIM, state)).toEqual({ gueltig: true, weiter: '/plantafel' });
  });

  it('weist einen selbstgebauten state ab', () => {
    const gefaelscht = Buffer.from(`${Date.now()}|/einstellungen|beliebig`).toString('base64url');
    expect(pruefeState(GEHEIM, gefaelscht).gueltig).toBe(false);
  });

  it('weist einen state mit fremdem Schlüssel ab', () => {
    const fremd = baueState('anderes-geheimnis', '/plantafel');
    expect(pruefeState(GEHEIM, fremd).gueltig).toBe(false);
  });

  it('weist einen abgelaufenen state ab', () => {
    const state = baueState(GEHEIM, '/plantafel', 0);
    // Elf Minuten später – gültig sind zehn.
    expect(pruefeState(GEHEIM, state, 11 * 60 * 1000).gueltig).toBe(false);
  });

  it('weist Unsinn ab, statt zu werfen', () => {
    expect(pruefeState(GEHEIM, null).gueltig).toBe(false);
    expect(pruefeState(GEHEIM, 'kein-base64!!').gueltig).toBe(false);
    expect(pruefeState(GEHEIM, Buffer.from('zu|wenig').toString('base64url')).gueltig).toBe(false);
  });

  it('nimmt das Ziel nicht ungeprüft, sondern nur signiert mit', () => {
    // Sonst könnte man jemanden nach der Anmeldung irgendwohin schicken.
    const state = baueState(GEHEIM, '/projekte');
    expect(pruefeState(GEHEIM, state).weiter).toBe('/projekte');
    const manipuliert = Buffer.from(
      Buffer.from(state, 'base64url').toString('utf8').replace('/projekte', '/woanders'),
    ).toString('base64url');
    expect(pruefeState(GEHEIM, manipuliert).gueltig).toBe(false);
  });
});

describe('Identität aus dem id_token', () => {
  it('liest die E-Mail aus dem üblichen Feld', () => {
    const i = leseIdToken(jwt({ email: 'MT@mrumbau.de', name: 'Marlon Tschon', tid: 'tenant-1' }));
    // Kleingeschrieben, damit der Abgleich mit dem Konto nicht an der
    // Schreibweise scheitert.
    expect(i.email).toBe('mt@mrumbau.de');
    expect(i.name).toBe('Marlon Tschon');
    expect(i.tenantId).toBe('tenant-1');
  });

  it('kommt auch mit preferred_username und upn zurecht', () => {
    // Microsoft liefert die Adresse je nach Kontotyp woanders.
    expect(leseIdToken(jwt({ preferred_username: 'cr@mrumbau.de' })).email).toBe('cr@mrumbau.de');
    expect(leseIdToken(jwt({ upn: 'gp@mrumbau.de' })).email).toBe('gp@mrumbau.de');
  });

  it('meldet fehlende Angaben, statt irgendetwas anzunehmen', () => {
    expect(() => leseIdToken(jwt({ name: 'Ohne Adresse' }))).toThrow(/E-Mail/);
    expect(() => leseIdToken('kein.jwt')).toThrow(/Format/);
  });
});

/**
 * Microsofts Fehlertexte sind fuer den Anwender wertlos. Der haeufigste
 * Einrichtungsfehler - Geheimnis-ID statt Geheimnis-Wert - muss beim Namen
 * genannt werden, sonst sucht man Stunden an der falschen Stelle.
 */
describe('Fehlermeldungen von Microsoft', () => {
  const ID = '55d5549d-76da-43c8-87cd-f2d9c0435a86';
  const WERT = 'Abc8Q~kJ3nR_pL0vXyZ2mQ7tE4sW9dF1gH6jK5nB';

  it('erkennt die Geheimnis-ID an ihrer Form, ohne sie preiszugeben', () => {
    expect(geheimnisForm(ID)).toBe('id-statt-wert');
    expect(geheimnisForm(` ${ID} `)).toBe('id-statt-wert');
    expect(geheimnisForm(WERT)).toBe('wert');
    expect(geheimnisForm('zu-kurz-abc')).toBe('zu-kurz');
  });

  it('sagt bei AADSTS7000215 mit GUID, dass die ID statt des Werts hinterlegt ist', () => {
    const roh =
      '{"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided."}';
    const text = erklaereMicrosoftFehler(roh, geheimnisForm(ID));
    expect(text).toMatch(/Geheimnis-ID/);
    expect(text).toMatch(/Wert/);
    // Der Text darf nie das Geheimnis selbst weiterreichen.
    expect(text).not.toContain(ID);
  });

  it('rät bei gültig aussehendem Geheimnis zum Neuanlegen statt zur ID', () => {
    const roh = 'AADSTS7000215: Invalid client secret provided.';
    const text = erklaereMicrosoftFehler(roh, geheimnisForm(WERT));
    expect(text).toMatch(/neues Geheimnis/);
    expect(text).not.toMatch(/Geheimnis-ID/);
    expect(text).not.toContain(WERT);
  });

  it('übersetzt abgelaufenes Geheimnis, falsche App und fehlende Umleitung', () => {
    expect(erklaereMicrosoftFehler('AADSTS7000222: expired', 'wert')).toMatch(/abgelaufen/);
    expect(erklaereMicrosoftFehler('AADSTS700016: not found', 'wert')).toMatch(
      /MICROSOFT_CLIENT_ID/,
    );
    expect(erklaereMicrosoftFehler('AADSTS50011: mismatch', 'wert')).toMatch(/Umleitungs-Adresse/);
  });

  it('gibt Unbekanntes weiter, statt es zu verschlucken', () => {
    const text = erklaereMicrosoftFehler('AADSTS99999: etwas ganz Neues', 'wert');
    expect(text).toMatch(/AADSTS99999/);
    expect(text).toMatch(/etwas ganz Neues/);
  });
});

/**
 * Wer mehrere Microsoft-Konten hat, muss waehlen koennen. Ohne
 * prompt=select_account nimmt Microsoft stillschweigend das Konto, das im
 * Browser gerade offen ist - und weist den Benutzer dann mit einem Konto ab,
 * das er nie ausgesucht hat.
 */
describe('Kontoauswahl', () => {
  it('verlangt bei jeder Anmeldung eine Kontoauswahl', () => {
    const ziel = new URL(anmeldeAdresse(KONFIG, rueckkehrAdresse('https://dispo.mrumbau.de'), 'x'));
    expect(ziel.searchParams.get('prompt')).toBe('select_account');
  });
});
