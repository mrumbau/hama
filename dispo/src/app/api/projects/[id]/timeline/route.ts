import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Chronologische Projekthistorie (Master-Prompt Abschnitt 25). */
export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const entries = await prisma.auditLog.findMany({
    where: { OR: [{ projectId: id }, { entityType: 'project', entityId: id }] },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return ok({ entries });
});
