import { handler, ok } from '@/server/api';
import { syncProjects } from '@/server/integrations/sync';
import { prisma } from '@/lib/db';
import { getErpProvider } from '@/server/integrations';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const state = await prisma.syncState.findUnique({ where: { provider: 'das-programm' } });
  return ok({ state, provider: getErpProvider().name });
});

/** „Projekte aus Das Programm aktualisieren“ */
export const POST = handler(async () => {
  const result = await syncProjects();
  return ok(result);
});
