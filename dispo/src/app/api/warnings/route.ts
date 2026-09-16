import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { computeWarnings } from '@/server/warnings';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const warnings = await computeWarnings({
    includeDismissed: params.get('erledigte') === '1',
  });
  return ok({ warnings });
});

/** Einen offenen Punkt abhaken bzw. wieder aktivieren. */
export const POST = handler(async (request: Request) => {
  const input = await parseBody(
    request,
    z.object({
      warningKey: z.string().min(1),
      dismissed: z.boolean(),
      note: z.string().max(500).nullish(),
    }),
  );

  if (input.dismissed) {
    await prisma.warningDismissal.upsert({
      where: { warningKey: input.warningKey },
      update: { note: input.note ?? null, dismissedAt: new Date() },
      create: { warningKey: input.warningKey, note: input.note ?? null },
    });
    return ok({ message: 'Punkt als erledigt markiert.' });
  }

  await prisma.warningDismissal.deleteMany({ where: { warningKey: input.warningKey } });
  return ok({ message: 'Punkt wieder geöffnet.' });
});
