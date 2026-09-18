import { fail, handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { aktuellerBenutzer } from '@/server/auth';
import {
  verlangeAenderungsrecht,
  verlangeStatusrecht,
  type EinsatzHerkunft,
  type EinsatzStatus,
} from '@/server/planung';
import { deleteAssignment, updateAssignment, updateAssignmentSchema } from '@/server/assignments';
import { dbDateToIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, updateAssignmentSchema);

  // Wem gehoert dieser Einsatz, und ist er schon verbindlich?
  const vorhanden = await prisma.assignment.findUnique({
    where: { id },
    select: { status: true, createdById: true },
  });
  if (!vorhanden) return fail('Einsatz nicht gefunden.', 404);

  const benutzer = await aktuellerBenutzer();
  verlangeAenderungsrecht(benutzer, vorhanden as EinsatzHerkunft);
  verlangeStatusrecht(benutzer, input.status as EinsatzStatus | undefined);

  const { assignment, label } = await updateAssignment(id, input);
  return ok({
    assignment: {
      ...assignment,
      startDate: dbDateToIso(assignment.startDate),
      endDate: dbDateToIso(assignment.endDate),
    },
    message: `${label} wurde aktualisiert.`,
  });
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const vorhanden = await prisma.assignment.findUnique({
    where: { id },
    select: { status: true, createdById: true },
  });
  if (!vorhanden) return fail('Einsatz nicht gefunden.', 404);
  verlangeAenderungsrecht(await aktuellerBenutzer(), vorhanden as EinsatzHerkunft);

  const { label } = await deleteAssignment(id);
  return ok({ message: `${label} wurde aus der Planung entfernt.` });
});
