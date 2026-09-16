import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z.string().min(1, 'Die Notiz darf nicht leer sein.').max(5000),
  pinned: z.boolean().optional(),
});

export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, schema);
  const note = await prisma.projectNote.create({
    data: { projectId: id, body: input.body, pinned: input.pinned ?? false },
  });
  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: id,
    action: 'note_added',
    label: 'Notiz hinzugefügt',
    newValue: { body: input.body },
  });
  return ok({ note, message: 'Notiz gespeichert.' }, { status: 201 });
});

export const DELETE = handler(async (request: Request) => {
  const noteId = new URL(request.url).searchParams.get('notiz');
  if (!noteId) return ok({ message: 'Keine Notiz angegeben.' }, { status: 400 });
  await prisma.projectNote.delete({ where: { id: noteId } });
  return ok({ message: 'Notiz gelöscht.' });
});
