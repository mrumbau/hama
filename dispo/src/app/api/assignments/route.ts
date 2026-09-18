import { handler, ok, parseBody } from '@/server/api';
import { createAssignment, createAssignmentSchema } from '@/server/assignments';
import { prisma } from '@/lib/db';
import { dbDateToIso, isoToDbDate, todayIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const from = params.get('von') ?? todayIso();
  const to = params.get('bis') ?? from;
  const projectId = params.get('projekt') ?? undefined;

  const rows = await prisma.assignment.findMany({
    where: {
      projectId,
      startDate: { lte: isoToDbDate(to) },
      endDate: { gte: isoToDbDate(from) },
    },
    include: { employee: true, siteManager: true, subcontractor: true, project: true },
    orderBy: [{ startDate: 'asc' }],
  });

  return ok(
    rows.map((a) => ({
      ...a,
      startDate: dbDateToIso(a.startDate),
      endDate: dbDateToIso(a.endDate),
    })),
  );
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, createAssignmentSchema);
  const { assignment, label } = await createAssignment(input);
  return ok(
    {
      assignment: {
        ...assignment,
        startDate: dbDateToIso(assignment.startDate),
        endDate: dbDateToIso(assignment.endDate),
      },
      message: `${label} wurde eingeplant.`,
    },
    { status: 201 },
  );
});
