import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { fullName } from '@/lib/utils';
import { siteManagerSchema } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, siteManagerSchema.partial());
  const manager = await prisma.siteManager.update({
    where: { id },
    data: { ...input, shortCode: input.shortCode?.trim() || undefined },
  });
  await writeAudit({
    entityType: 'site_manager',
    entityId: id,
    action: 'updated',
    label: `Bauleiter geändert: ${fullName(manager)}`,
    newValue: input,
  });
  return ok({ manager, message: 'Gespeichert.' });
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const manager = await prisma.siteManager.findUnique({ where: { id } });
  if (!manager) return ok({ message: 'Bauleiter nicht gefunden.' }, { status: 404 });

  const [projects, assignments] = await Promise.all([
    prisma.project.count({
      where: { OR: [{ primarySiteManagerId: id }, { secondarySiteManagerId: id }] },
    }),
    prisma.assignment.count({ where: { siteManagerId: id } }),
  ]);

  if (projects > 0 || assignments > 0) {
    await prisma.siteManager.update({ where: { id }, data: { active: false } });
    await writeAudit({
      entityType: 'site_manager',
      entityId: id,
      action: 'deactivated',
      label: `Bauleiter deaktiviert: ${fullName(manager)}`,
    });
    return ok({
      message: `${fullName(manager)} ist noch ${projects} Projekt(en) zugeordnet und wurde deaktiviert statt gelöscht.`,
      deactivated: true,
    });
  }

  await prisma.siteManager.delete({ where: { id } });
  await writeAudit({
    entityType: 'site_manager',
    entityId: id,
    action: 'deleted',
    label: `Bauleiter gelöscht: ${fullName(manager)}`,
  });
  return ok({ message: `${fullName(manager)} wurde gelöscht.` });
});
