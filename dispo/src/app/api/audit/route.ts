import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Vollstaendiges Aenderungsprotokoll mit einfachen Filtern. */
export const GET = handler(async (request: Request) => {
  // Das vollstaendige Protokoll zeigt jede Aenderung jedes Kollegen. Das ist
  // eine Leitungsfrage, keine Planungsfrage.
  await verlange('protokoll');
  const params = new URL(request.url).searchParams;
  const entityType = params.get('typ') || undefined;
  const projectId = params.get('projekt') || undefined;
  const take = Math.min(Number(params.get('limit') ?? 200), 500);
  const q = params.get('q')?.trim();

  const entries = await prisma.auditLog.findMany({
    where: {
      entityType,
      projectId,
      ...(q
        ? {
            OR: [
              { label: { contains: q, mode: 'insensitive' } },
              { note: { contains: q, mode: 'insensitive' } },
              { reasonText: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  // Projektbezeichnungen nachladen, damit die Liste ohne Klick lesbar ist.
  const projectIds = [...new Set(entries.map((e) => e.projectId).filter(Boolean))] as string[];
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, customerName: true, name: true, orderNumber: true },
      })
    : [];
  const byId = new Map(projects.map((p) => [p.id, p]));

  return ok({
    entries: entries.map((e) => ({
      ...e,
      projectLabel: e.projectId
        ? (() => {
            const p = byId.get(e.projectId!);
            return p
              ? [p.orderNumber, `${p.customerName} – ${p.name}`].filter(Boolean).join(' · ')
              : null;
          })()
        : null,
    })),
  });
});
