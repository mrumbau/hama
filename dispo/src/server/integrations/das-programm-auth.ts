/**
 * Anmeldung an „Das Programm“.
 *
 * Die Beweislage aus dem Verbindungstest:
 *
 *   mit Authorization-Header  → {"error":"invalid_token", …}
 *   ohne Authorization-Header → NotAuthenticatedException (Synatos\Polis)
 *
 * Der Server liest also sehr wohl einen Bearer-Token aus dem
 * Authorization-Header – er hält unseren nur für ungültig. Das ist das
 * Verhalten eines OAuth2-Resource-Servers: was dort hineingehört, ist kein
 * dauerhafter API-Schlüssel, sondern ein Zugriffstoken, das man sich vorher
 * gegen Client-Zugangsdaten abholt.
 *
 * Deshalb kann die App beides:
 *   - ein fertiges Token (DAS_PROGRAMM_API_KEY), falls das ERP eines ausgibt
 *   - Client-Zugangsdaten (DAS_PROGRAMM_CLIENT_ID/_SECRET), aus denen sie
 *     sich selbst ein Token holt und es bis kurz vor Ablauf behält
 */

export interface OAuthKonfiguration {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Optionaler Scope, falls das ERP einen verlangt. */
  scope: string | null;
}

interface Zwischenspeicher {
  token: string;
  /** Zeitpunkt in ms, ab dem das Token als verbraucht gilt. */
  laeuftAbUm: number;
}

/**
 * Tokens leben je Konfiguration im Prozess weiter. Ohne das holt jede
 * einzelne Abfrage ein neues Token – bei einem Sync mit 20 Anfragen sind
 * das 20 überflüssige Anmeldungen.
 */
const SPEICHER = new Map<string, Zwischenspeicher>();

/** Sicherheitsabstand vor dem Ablauf, damit kein Token unterwegs verfällt. */
const PUFFER_MS = 60_000;

export async function holeZugriffstoken(
  konfig: OAuthKonfiguration,
  jetzt = Date.now(),
): Promise<string> {
  const schluessel = `${konfig.tokenUrl}|${konfig.clientId}`;
  const vorhanden = SPEICHER.get(schluessel);
  if (vorhanden && vorhanden.laeuftAbUm > jetzt) return vorhanden.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: konfig.clientId,
    client_secret: konfig.clientSecret,
  });
  if (konfig.scope) body.set('scope', konfig.scope);

  const res = await fetch(konfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(
      `Anmeldung bei Das Programm fehlgeschlagen (${res.status}). Antwort: ${text.trim().slice(0, 300)}`,
    );
  }

  let daten: { access_token?: string; expires_in?: number };
  try {
    daten = JSON.parse(text) as typeof daten;
  } catch {
    throw new Error(`Der Token-Endpunkt lieferte kein JSON: ${text.trim().slice(0, 200)}`);
  }
  if (!daten.access_token) {
    throw new Error(`Der Token-Endpunkt lieferte kein access_token: ${text.trim().slice(0, 200)}`);
  }

  // Fehlt expires_in, gehen wir konservativ von fünf Minuten aus.
  const gueltigMs = (daten.expires_in ?? 300) * 1000;
  SPEICHER.set(schluessel, {
    token: daten.access_token,
    laeuftAbUm: jetzt + Math.max(gueltigMs - PUFFER_MS, 30_000),
  });

  return daten.access_token;
}

/** Nur für Tests und den Verbindungstest: Zwischenspeicher leeren. */
export function vergissTokens(): void {
  SPEICHER.clear();
}

// ---------------------------------------------------------------------------
// Suche nach dem Token-Endpunkt
// ---------------------------------------------------------------------------

/**
 * Übliche Pfade, unter denen ein OAuth2-Token-Endpunkt liegt.
 * Abgeleitet aus der GraphQL-Adresse, damit Host und Schema stimmen.
 */
export function kandidatenPfade(graphqlUrl: string): string[] {
  let basis: URL;
  try {
    basis = new URL(graphqlUrl);
  } catch {
    return [];
  }
  const pfade = [
    '/api/oauth/token',
    '/api/oauth2/token',
    '/api/token',
    '/oauth/token',
    '/oauth2/token',
    '/api/auth/token',
  ];
  return pfade.map((p) => `${basis.origin}${p}`);
}

export interface EndpunktBefund {
  url: string;
  status: number | null;
  /** Sieht die Antwort nach einem OAuth2-Token-Endpunkt aus? */
  sieht_aus_wie_oauth: boolean;
  antwort: string;
}

/**
 * Probiert die Kandidaten durch und meldet, welcher wie ein Token-Endpunkt
 * antwortet.
 *
 * Auch ein Fehlschlag ist hier eine Auskunft: `invalid_client` oder
 * `unsupported_grant_type` beweisen, dass der Endpunkt existiert und nur die
 * Zugangsdaten nicht passen. Ein 404 beweist das Gegenteil.
 */
export async function sucheTokenEndpunkt(
  graphqlUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<EndpunktBefund[]> {
  const befunde: EndpunktBefund[] = [];

  for (const url of kandidatenPfade(graphqlUrl)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });

      const text = (await res.text().catch(() => '')).trim().slice(0, 200);
      const oauthTypisch =
        /access_token|invalid_client|invalid_grant|unsupported_grant_type|invalid_request|invalid_scope/i.test(
          text,
        );

      befunde.push({
        url,
        status: res.status,
        sieht_aus_wie_oauth: res.ok || oauthTypisch,
        antwort: text,
      });

      if (res.ok && /access_token/.test(text)) break; // Gefunden.
    } catch (e) {
      befunde.push({
        url,
        status: null,
        sieht_aus_wie_oauth: false,
        antwort: e instanceof Error ? e.message : 'Unbekannter Fehler.',
      });
    }
  }

  return befunde;
}
