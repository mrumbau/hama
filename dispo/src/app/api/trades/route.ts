import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const trades = await prisma.trade.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return ok(trades);
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(
    request,
    z.object({
      name: z.string().min(1, 'Name ist ein Pflichtfeld.').max(80),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }),
  );
  const trade = await prisma.trade.upsert({
    where: { name: input.name.trim() },
    update: input.color ? { color: input.color } : {},
    create: { name: input.name.trim(), color: input.color ?? '#64748b' },
  });
  return ok({ trade, message: `Gewerk „${trade.name}“ gespeichert.` }, { status: 201 });
});
