import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { acceptChangeRequest, acceptSchema, rejectChangeRequest } from '@/server/change-requests';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(['uebernehmen', 'ablehnen']),
  note: z.string().max(1000).nullish(),
  payload: acceptSchema.optional(),
});

export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, bodySchema);

  if (input.action === 'ablehnen') {
    return ok(await rejectChangeRequest(id, input.note));
  }
  return ok(await acceptChangeRequest(id, { ...(input.payload ?? {}), note: input.note }));
});
