import type { ErpProvider } from './erp-provider';
import { MockErpProvider } from './mock-erp-provider';
import {
  DAS_PROGRAMM_STANDARD_HEADER,
  DAS_PROGRAMM_STANDARD_URL,
  DasProgrammProvider,
} from './das-programm-provider';

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
    return new DasProgrammProvider(
      process.env.DAS_PROGRAMM_GRAPHQL_URL || DAS_PROGRAMM_STANDARD_URL,
      process.env.DAS_PROGRAMM_API_KEY ?? '',
      process.env.DAS_PROGRAMM_AUTH_HEADER || DAS_PROGRAMM_STANDARD_HEADER,
      process.env.DAS_PROGRAMM_AUTH_PREFIX ?? '',
      process.env.DAS_PROGRAMM_WRITEBACK === '1',
    );
  }
  return new MockErpProvider();
}

export type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';
