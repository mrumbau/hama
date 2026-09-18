import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(['NEU', 'IN_PRUEFUNG', 'ERLEDIGT']).optional(),
  /** Manuelle Projektzuordnung, wenn die Automatik nicht eindeutig war. */
  projectId: z.string().nullish(),
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, schema);

  const before = await prisma.communication.findUnique({ where: { id } });
  if (!before) return ok({ message: 'Telefonat nicht gefunden.' }, { status: 404 });

  const communication = await prisma.communication.update({
    where: { id },
    data: {
      status: input.status as never,
      ...(input.projectId !== undefined
        ? { projectId: input.projectId, candidateProjectIds: [] }
        : {}),
    },
  });

  // Offene Vorschläge desselben Telefonats erben die Projektzuordnung.
  if (input.projectId) {
    await prisma.changeRequest.updateMany({
      where: { communicationId: id, status: 'OFFEN' },
      data: { projectId: input.projectId },
    });
  }

  await writeAudit({
    entityType: 'communication',
    entityId: id,
    projectId: communication.projectId,
    action: 'updated',
    label:
      input.projectId !== undefined
        ? 'Telefonat einem Projekt zugeordnet'
        : `Telefonat als „${input.status}“ markiert`,
    oldValue: { status: before.status, projectId: before.projectId },
    newValue: { status: communication.status, projectId: communication.projectId },
    source: 'TELEFON_3CX',
  });

  return ok({ communication, message: 'Gespeichert.' });
});
