/**
 * Anmeldung über Client-Zugangsdaten.
 *
 * Der Server von „Das Programm" lehnt einen dauerhaften Schlüssel mit
 * `invalid_token` ab und akzeptiert nur ein OAuth2-Zugriffstoken. Dieser Weg
 * ist damit der eigentliche Anmeldeweg – und er läuft bei jedem Sync, also
 * muss vor allem das Zwischenspeichern stimmen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  holeZugriffstoken,
  kandidatenPfade,
  sucheTokenEndpunkt,
  vergissTokens,
} from '@/server/integrations/das-programm-auth';

const KONFIG = {
  tokenUrl: 'https://app.das-programm.io/api/oauth/token',
  clientId: 'dispo-app',
  clientSecret: 'sehr-geheim',
  scope: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vergissTokens();
});

function tokenServer(antwort: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      ({
        ok,
        status,
        statusText: ok ? 'OK' : 'Bad Request',
        text: async () => JSON.stringify(antwort),
      }) as unknown as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Zugriffstoken holen', () => {
  it('schickt einen client_credentials-Antrag und liefert das Token', async () => {
    const fetchMock = tokenServer({ access_token: 'tok-1', expires_in: 3600 });

    const token = await holeZugriffstoken(KONFIG);

    expect(token).toBe('tok-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(KONFIG.tokenUrl);
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('dispo-app');
    expect(body.get('client_secret')).toBe('sehr-geheim');
  });

  it('holt für weitere Abfragen kein neues Token', async () => {
    const fetchMock = tokenServer({ access_token: 'tok-1', expires_in: 3600 });

    await holeZugriffstoken(KONFIG);
    await holeZugriffstoken(KONFIG);
    await holeZugriffstoken(KONFIG);

    // Ein Sync macht dutzende Abfragen – ohne Zwischenspeicher wären das
    // dutzende Anmeldungen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erneuert das Token vor dem Ablauf, nicht erst danach', async () => {
    tokenServer({ access_token: 'tok-1', expires_in: 120 });
    await holeZugriffstoken(KONFIG, 0);

    tokenServer({ access_token: 'tok-2', expires_in: 120 });
    // 70 Sekunden später: noch 50 Sekunden gültig, aber innerhalb des Puffers.
    const zweites = await holeZugriffstoken(KONFIG, 70_000);

    expect(zweites).toBe('tok-2');
  });

  it('meldet eine abgelehnte Anmeldung im Klartext', async () => {
    tokenServer({ error: 'invalid_client' }, false, 401);

    await expect(holeZugriffstoken(KONFIG)).rejects.toThrow(/401.*invalid_client/s);
  });

  it('meldet eine Antwort ohne access_token', async () => {
    tokenServer({ token_type: 'Bearer' });

    await expect(holeZugriffstoken(KONFIG)).rejects.toThrow(/kein access_token/);
  });
});

describe('Token-Endpunkt suchen', () => {
  it('leitet die Kandidaten vom GraphQL-Host ab', () => {
    const pfade = kandidatenPfade('https://app.das-programm.io/api/graphql');

    expect(pfade[0]).toBe('https://app.das-programm.io/api/oauth/token');
    expect(pfade.every((p) => p.startsWith('https://app.das-programm.io/'))).toBe(true);
  });

  it('wertet invalid_client als gefundenen Endpunkt', async () => {
    // Das ist der entscheidende Fall: die Zugangsdaten stimmen nicht, aber
    // der Endpunkt existiert – genau das will man wissen.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/api/oauth/token')
          ? ({
              ok: false,
              status: 401,
              text: async () => '{"error":"invalid_client"}',
            } as unknown as Response)
          : ({ ok: false, status: 404, text: async () => 'Not Found' } as unknown as Response),
      ),
    );

    const befunde = await sucheTokenEndpunkt('https://app.das-programm.io/api/graphql', 'id', 'pw');
    const treffer = befunde.filter((b) => b.sieht_aus_wie_oauth);

    expect(treffer).toHaveLength(1);
    expect(treffer[0].url).toContain('/api/oauth/token');
  });

  it('hört auf, sobald ein Token herauskommt', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => '{"access_token":"tok"}',
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const befunde = await sucheTokenEndpunkt('https://app.das-programm.io/api/graphql', 'id', 'pw');

    expect(befunde).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('meldet ehrlich, wenn nichts gefunden wird', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response),
    );

    const befunde = await sucheTokenEndpunkt('https://app.das-programm.io/api/graphql', 'id', 'pw');
    expect(befunde.some((b) => b.sieht_aus_wie_oauth)).toBe(false);
  });
});
