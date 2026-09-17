import type { ErpProvider } from './erp-provider';
import { MockErpProvider } from './mock-erp-provider';
import { DAS_PROGRAMM_STANDARD_URL, DasProgrammProvider } from './das-programm-provider';
import type { OAuthKonfiguration } from './das-programm-auth';

/**
 * Liefert den konfigurierten ERP-Provider.
 * `DISPO_ERP_PROVIDER=das-programm` schaltet auf die echte GraphQL-API um.
 *
 * Das Zurueckschreiben des Projektstatus ist absichtlich abschaltbar und
 * standardmaessig aus: die Dispo aendert damit Daten im fuehrenden System,
 * und das soll eine bewusste Entscheidung sein.
 */
export function getErpProvider(): ErpProvider {
  if (process.env.DISPO_ERP_PROVIDER === 'das-programm') {
    const endpoint = process.env.DAS_PROGRAMM_GRAPHQL_URL || DAS_PROGRAMM_STANDARD_URL;
    return new DasProgrammProvider(
      endpoint,
      process.env.DAS_PROGRAMM_API_KEY ?? '',
      process.env.DAS_PROGRAMM_AUTH_HEADER || 'Authorization',
      process.env.DAS_PROGRAMM_AUTH_PREFIX ?? 'Bearer ',
      process.env.DAS_PROGRAMM_WRITEBACK === '1',
      oauthKonfiguration(endpoint),
    );
  }
  return new MockErpProvider();
}

/**
 * Client-Zugangsdaten, falls hinterlegt. Ohne sie bleibt es beim einfachen
 * Schluessel im Header.
 */
function oauthKonfiguration(endpoint: string): OAuthKonfiguration | null {
  const clientId = process.env.DAS_PROGRAMM_CLIENT_ID?.trim();
  const clientSecret = process.env.DAS_PROGRAMM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return {
    tokenUrl: process.env.DAS_PROGRAMM_TOKEN_URL?.trim() || standardTokenUrl(endpoint),
    clientId,
    clientSecret,
    scope: process.env.DAS_PROGRAMM_SCOPE?.trim() || null,
  };
}

/** Gleicher Host wie GraphQL, nur ein anderer Pfad. */
function standardTokenUrl(endpoint: string): string {
  try {
    return `${new URL(endpoint).origin}/api/oauth/token`;
  } catch {
    return '';
  }
}

export type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';
