import { handler, ok, parseBody } from '@/server/api';
import { deleteAssignment, updateAssignment, updateAssignmentSchema } from '@/server/assignments';
import { dbDateToIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, updateAssignmentSchema);
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
  const { label } = await deleteAssignment(id);
  return ok({ message: `${label} wurde aus der Planung entfernt.` });
});
