import type { ErpProvider } from './erp-provider';
import { MockErpProvider } from './mock-erp-provider';
import { DasProgrammProvider } from './das-programm-provider';

/**
 * Liefert den konfigurierten ERP-Provider.
 * `DISPO_ERP_PROVIDER=das-programm` schaltet auf die echte GraphQL-API um.
 */
export function getErpProvider(): ErpProvider {
  if (process.env.DISPO_ERP_PROVIDER === 'das-programm') {
    return new DasProgrammProvider(
      process.env.DAS_PROGRAMM_GRAPHQL_URL ?? '',
      process.env.DAS_PROGRAMM_API_KEY ?? '',
      process.env.DAS_PROGRAMM_AUTH_HEADER || 'Authorization',
      process.env.DAS_PROGRAMM_AUTH_PREFIX ?? 'Bearer ',
    );
  }
  return new MockErpProvider();
}

export type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';
