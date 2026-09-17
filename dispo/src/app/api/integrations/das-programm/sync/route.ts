import { handler, ok } from '@/server/api';
import { syncProjects } from '@/server/integrations/sync';
import { prisma } from '@/lib/db';
import { getErpProvider } from '@/server/integrations';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const provider = getErpProvider();
  const [state, health] = await Promise.all([
    prisma.syncState.findUnique({ where: { provider: 'das-programm' } }),
    provider.healthCheck(),
  ]);
  return ok({
    state,
    provider: provider.name,
    health,
    /** Was ist konfiguriert? Ohne Geheimnisse – nur ob gesetzt oder nicht. */
    konfiguration: {
      endpunkt: process.env.DAS_PROGRAMM_GRAPHQL_URL || '(Standard)',
      schluesselGesetzt: Boolean(process.env.DAS_PROGRAMM_API_KEY),
      authHeader: process.env.DAS_PROGRAMM_AUTH_HEADER || 'Authorization',
      zurueckschreiben: provider.canWriteBack,
    },
  });
});

/** „Projekte aus Das Programm aktualisieren“ */
export const POST = handler(async () => {
  const result = await syncProjects();
  return ok(result);
});
