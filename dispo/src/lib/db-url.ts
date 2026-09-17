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

  if (!POOLER_HOST.test(parsed.hostname)) {
    return { url: roh, angepasst: false, hinweis: null };
  }

  const aenderungen: string[] = [];

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
