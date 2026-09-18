import { handler, ok } from '@/server/api';
import { syncProjects } from '@/server/integrations/sync';
import { prisma } from '@/lib/db';
import { getErpProvider } from '@/server/integrations';
import {
  DAS_PROGRAMM_STANDARD_HEADER,
  DAS_PROGRAMM_STANDARD_URL,
  findeAuthVariante,
} from '@/server/integrations/das-programm-provider';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const provider = getErpProvider();
  const [state, health] = await Promise.all([
    prisma.syncState.findUnique({ where: { provider: 'das-programm' } }),
    provider.healthCheck(),
  ]);
  // Schlaegt die Anmeldung fehl, ist die naechste Frage immer dieselbe:
  // stimmt der Header oder der Schluessel? Das beantworten wir hier gleich
  // mit, statt es den Benutzer raten zu lassen.
  const endpunkt = process.env.DAS_PROGRAMM_GRAPHQL_URL || DAS_PROGRAMM_STANDARD_URL;
  const schluessel = process.env.DAS_PROGRAMM_API_KEY?.trim();

  const diagnose =
    !health.ok && schluessel
      ? await findeAuthVariante(endpunkt, schluessel.replace(/^Bearer\s+/i, ''))
      : null;

  return ok({
    state,
    provider: provider.name,
    health,
    diagnose,
    /** Was ist konfiguriert? Ohne Geheimnisse – nur ob gesetzt oder nicht. */
    konfiguration: {
      endpunkt: process.env.DAS_PROGRAMM_GRAPHQL_URL || '(Standard)',
      schluesselGesetzt: Boolean(process.env.DAS_PROGRAMM_API_KEY),
      authHeader: process.env.DAS_PROGRAMM_AUTH_HEADER || DAS_PROGRAMM_STANDARD_HEADER,
      zurueckschreiben: provider.canWriteBack,
    },
  });
});

/** „Projekte aus Das Programm aktualisieren“ */
export const POST = handler(async () => {
  const result = await syncProjects();
  return ok(result);
});
