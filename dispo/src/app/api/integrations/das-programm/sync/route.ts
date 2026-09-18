import { timingSafeEqual } from 'node:crypto';
import { handler, ok } from '@/server/api';
import { verlange } from '@/server/auth';
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

/**
 * „Projekte aus Das Programm aktualisieren"
 *
 * Auch der Weckruf des Zeitplans landet hier. Der kommt von einer Maschine
 * und hat keine Sitzung, deshalb weist er sich mit DISPO_CRON_TOKEN aus.
 * Ohne gesetztes Token gibt es diesen Weg nicht - dann kommt man nur
 * angemeldet herein, wie bisher.
 */
export const POST = handler(async (request: Request) => {
  const token = process.env.DISPO_CRON_TOKEN?.trim();
  const mitgebracht = request.headers.get('x-dispo-cron')?.trim();
  const vomZeitplan = Boolean(token && mitgebracht && zeitgleich(token, mitgebracht));

  if (!vomZeitplan) await verlange('sync');

  const result = await syncProjects();

  // Bei der Gelegenheit festhalten, welche Schreibbefehle „Das Programm"
  // kennt. Davon haengt ab, was sich ueberhaupt zurueckschreiben laesst -
  // und die Antwort soll nachlesbar sein, statt geraten zu werden.
  await merkeMutationen();

  return ok({ ...result, ausloeser: vomZeitplan ? 'zeitplan' : 'benutzer' });
});

/**
 * Vergleich ohne Zeitverrat: Ein frueher Abbruch beim ersten falschen
 * Zeichen laesst das Token Stueck fuer Stueck erraten.
 */
function zeitgleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function merkeMutationen() {
  try {
    const provider = getErpProvider();
    if (!('verfuegbareMutationen' in provider)) return;
    const liste = await (
      provider as { verfuegbareMutationen(): Promise<string[] | null> }
    ).verfuegbareMutationen();
    await prisma.setting.upsert({
      where: { key: 'erpMutationen' },
      update: { value: JSON.stringify({ stand: new Date().toISOString(), liste }) },
      create: {
        key: 'erpMutationen',
        value: JSON.stringify({ stand: new Date().toISOString(), liste }),
      },
    });
  } catch {
    // Auskunft ueber das Schema ist ein Zusatz, kein Teil des Abgleichs.
  }
}
