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
