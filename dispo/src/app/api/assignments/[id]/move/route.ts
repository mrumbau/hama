import { handler, ok, parseBody } from '@/server/api';
import { moveAssignment, moveAssignmentSchema } from '@/server/assignments';
import { dbDateToIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Drag & Drop-Endpoint. Speichert sofort und liefert den fertigen Satz fuer
 * den Undo-Toast zurueck – inklusive der Daten, mit denen sich das
 * Verschieben rueckgaengig machen laesst.
 */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, moveAssignmentSchema);
  const result = await moveAssignment(id, input);

  return ok({
    assignment: {
      ...result.assignment,
      startDate: dbDateToIso(result.assignment.startDate),
      endDate: dbDateToIso(result.assignment.endDate),
    },
    message: result.message,
    // Alles, was ein Undo braucht.
    previous: {
      startDate: result.oldStart,
      endDate: result.oldEnd,
      projectId: result.oldProjectId,
    },
  });
});
