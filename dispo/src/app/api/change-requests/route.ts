import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const status = new URL(request.url).searchParams.get('status') || 'OFFEN';
  const changeRequests = await prisma.changeRequest.findMany({
    where: status === 'ALLE' ? undefined : { status: status as never },
    include: {
      project: { select: { id: true, customerName: true, name: true, orderNumber: true } },
      communication: { select: { id: true, summary: true, occurredAt: true, customerName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return ok({ changeRequests });
});
