import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || undefined;

  const [communications, changeRequests] = await Promise.all([
    prisma.communication.findMany({
      where: status ? { status: status as never } : undefined,
      include: {
        project: {
          select: { id: true, customerName: true, name: true, orderNumber: true },
        },
        changeRequests: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    }),
    prisma.changeRequest.findMany({
      where: { status: 'OFFEN' },
      include: {
        project: { select: { id: true, customerName: true, name: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  // Kandidatenprojekte auflösen, damit die Zuordnung ohne Zusatzabfrage geht.
  const candidateIds = [...new Set(communications.flatMap((c) => c.candidateProjectIds))];
  const candidates = candidateIds.length
    ? await prisma.project.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true, customerName: true, name: true, orderNumber: true },
      })
    : [];

  return ok({ communications, changeRequests, candidates });
});
