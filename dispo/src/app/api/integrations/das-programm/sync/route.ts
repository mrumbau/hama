import { handler, ok } from '@/server/api';
import { syncProjects } from '@/server/integrations/sync';
import { prisma } from '@/lib/db';
import { getErpProvider } from '@/server/integrations';
import {
  DAS_PROGRAMM_STANDARD_URL,
  findeAuthVariante,
} from '@/server/integrations/das-programm-provider';
import { sucheTokenEndpunkt } from '@/server/integrations/das-programm-auth';

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
  const clientId = process.env.DAS_PROGRAMM_CLIENT_ID?.trim();
  const clientSecret = process.env.DAS_PROGRAMM_CLIENT_SECRET?.trim();

  const diagnose =
    !health.ok && schluessel
      ? await findeAuthVariante(endpunkt, schluessel.replace(/^Bearer\s+/i, ''))
      : null;

  // Wird der Schlüssel in jeder Header-Form abgelehnt, ist er kein
  // Zugriffstoken. Dann ist die nächste Frage, wo man eines herbekommt –
  // also suchen wir den Token-Endpunkt gleich mit.
  const alleAbgelehnt = diagnose !== null && diagnose.every((d) => !d.ok);
  const tokenEndpunkte =
    alleAbgelehnt && (clientId || schluessel)
      ? await sucheTokenEndpunkt(endpunkt, clientId ?? 'dispo', clientSecret ?? schluessel ?? '')
      : null;

  return ok({
    state,
    provider: provider.name,
    health,
    diagnose,
    tokenEndpunkte,
    /** Was ist konfiguriert? Ohne Geheimnisse – nur ob gesetzt oder nicht. */
    konfiguration: {
      endpunkt: process.env.DAS_PROGRAMM_GRAPHQL_URL || '(Standard)',
      schluesselGesetzt: Boolean(process.env.DAS_PROGRAMM_API_KEY),
      clientZugangsdaten: Boolean(clientId && clientSecret),
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
