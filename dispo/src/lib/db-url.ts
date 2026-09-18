/**
 * Bringt die Datenbankadresse in die Form, die eine Serverless-Anwendung
 * braucht.
 *
 * Hintergrund: Supabase bietet denselben Pooler unter zwei Ports an. Port 5432
 * ist der Session-Pooler – dort hält jede Verbindung ihren Platz, bis der
 * Prozess endet, und bei 15 gleichzeitigen ist Schluss:
 *
 *   FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * Port 6543 ist der Transaction-Pooler: eine Verbindung je Abfrage, danach
 * sofort wieder frei. Genau das passt zu Funktionsaufrufen, die kommen und
 * gehen. Die Anwendung erzwingt das deshalb selbst, statt sich darauf zu
 * verlassen, dass die Adresse von Hand richtig eingetragen wurde.
 *
 * Migrationen sind der Gegenfall – die brauchen eine Sitzungsverbindung und
 * laufen über `DIRECT_DATABASE_URL` (siehe `scripts/deploy-prepare.mjs`).
 */

/** Hosts, bei denen wir wissen, was die Ports bedeuten. */
const POOLER_HOST = /\.pooler\.supabase\.com$/i;

/**
 * Das Schema, in dem der Livebetrieb steht. Alles andere - Vorschau-Builds,
 * Zweige, lokale Versuche - arbeitet daneben.
 */
export const LIVE_SCHEMA = 'dispo';
export const PROBE_SCHEMA = 'dispo_test';

/**
 * Welches Schema diese Umgebung benutzen darf.
 *
 * Vorschau-Builds liefen bisher gegen dieselbe Datenbank wie der
 * Livebetrieb. Ein Push auf einen Zweig hat damit sofort echte Daten
 * veraendert - einmal hat genau das drei Personen angelegt, die dort nicht
 * hingehoerten, Stunden bevor jemand „live" gesagt hatte.
 *
 * Deshalb entscheidet das hier der Code und nicht eine Einstellung, die man
 * vergessen oder falsch setzen kann: Nur `VERCEL_ENV=production` fasst die
 * echten Daten an. Ohne Vercel - also lokal - bleibt alles, wie es in der
 * Adresse steht; dort zeigt die Adresse ohnehin auf eine eigene Datenbank.
 */
export function schemaFuerUmgebung(env = process.env.VERCEL_ENV): string | null {
  if (!env) return null;
  return env === 'production' ? LIVE_SCHEMA : PROBE_SCHEMA;
}

export interface UrlKorrektur {
  url: string;
  /** Wurde etwas geändert? Für die Anzeige in den Einstellungen. */
  angepasst: boolean;
  hinweis: string | null;
}

export function pooltauglicheUrl(roh: string | undefined): UrlKorrektur {
  if (!roh) return { url: '', angepasst: false, hinweis: null };

  let parsed: URL;
  try {
    parsed = new URL(roh);
  } catch {
    // Keine erkennbare URL – unverändert durchreichen und Prisma meckern lassen.
    return { url: roh, angepasst: false, hinweis: null };
  }

  const aenderungen: string[] = [];

  // Zuerst das Schema - das gilt auch fuer Adressen, die nicht auf den
  // Supabase-Pooler zeigen. Es ist der Riegel zwischen Probieren und Ernst.
  const schema = schemaFuerUmgebung();
  if (schema && parsed.searchParams.get('schema') !== schema) {
    parsed.searchParams.set('schema', schema);
    aenderungen.push(`schema=${schema}`);
  }

  if (!POOLER_HOST.test(parsed.hostname)) {
    return aenderungen.length
      ? {
          url: parsed.toString(),
          angepasst: true,
          hinweis: `DATABASE_URL angepasst: ${aenderungen.join(', ')}.`,
        }
      : { url: roh, angepasst: false, hinweis: null };
  }

  if (parsed.port === '5432' || parsed.port === '') {
    parsed.port = '6543';
    aenderungen.push('Port 5432 → 6543 (Transaction-Pooler)');
  }
  if (parsed.searchParams.get('pgbouncer') !== 'true') {
    parsed.searchParams.set('pgbouncer', 'true');
    aenderungen.push('pgbouncer=true');
  }
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '1');
    aenderungen.push('connection_limit=1');
  }

  if (aenderungen.length === 0) {
    return { url: roh, angepasst: false, hinweis: null };
  }

  return {
    url: parsed.toString(),
    angepasst: true,
    hinweis: `DATABASE_URL angepasst: ${aenderungen.join(', ')}.`,
  };
}

/** Adresse ohne Zugangsdaten – für Anzeige und Protokoll. */
export function ohneGeheimnis(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return 'unbekannt';
  }
}
