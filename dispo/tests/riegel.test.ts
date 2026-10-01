/**
 * Der Riegel vor der Tür.
 *
 * Gefunden beim Bauen des Bauzeitenplans: Ein abgelaufener Sitzungskeks
 * zeigte trotzdem Daten an. Die Middleware prüfte nur, OB ein Cookie
 * mitkommt – nicht, ob er echt ist. Sie kann es auch nicht: Sie läuft in der
 * Edge-Laufzeit, ohne Datenbank und ohne die Unterschrift der Sitzung. Jede
 * Route, die nicht von sich aus nachfragte, hat geantwortet.
 *
 * `dispo_session=erfunden` reichte, um die Kundenliste zu lesen.
 *
 * Geprüft wird jetzt im gemeinsamen `handler`, durch den jede API-Route
 * läuft. Diese Tests halten fest, dass das so bleibt – auch für Routen, die
 * es noch gar nicht gibt.
 */
import { describe, expect, it } from 'vitest';
import { BASE_URL } from './helpers';

/** Ein frei erfundener Wert – richtiger Cookie-Name, erfundener Inhalt. */
const ERFUNDEN = { Cookie: 'dispo_session=erfunden' };

async function status(pfad: string, kopf: Record<string, string> = {}): Promise<number> {
  const res = await fetch(`${BASE_URL}${pfad}`, { headers: kopf });
  return res.status;
}

describe('Ein erfundener Sitzungskeks kommt nicht hinein', () => {
  const geschuetzt = [
    '/api/projects',
    '/api/board',
    '/api/employees',
    '/api/subcontractors',
    '/api/site-managers',
    '/api/trades',
    '/api/settings',
    '/api/warnings',
    '/api/communications',
    '/api/planvorschlaege',
    '/api/bauzeitenplaene',
    '/api/audit',
    '/api/search?q=test',
  ];

  for (const pfad of geschuetzt) {
    it(`${pfad} antwortet mit 401`, async () => {
      expect(await status(pfad, ERFUNDEN)).toBe(401);
    });
  }

  it('antwortet auch ganz ohne Keks mit 401', async () => {
    expect(await status('/api/projects')).toBe(401);
  });
});

describe('Was offen bleiben muss, bleibt offen', () => {
  it('sagt weiterhin, welcher Stand läuft', async () => {
    expect(await status('/api/version')).toBe(200);
  });

  it('beantwortet „wer bin ich" mit null statt mit einem Fehler', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/ich`, { headers: ERFUNDEN });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown; rechte: unknown };
    // Wichtig: Die Oberflaeche fragt hier beim Start - sie darf eine Antwort
    // bekommen, nur eben eine leere.
    expect(body.user).toBeNull();
    expect(body.rechte).toBeNull();
  });
});
