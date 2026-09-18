import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { ergaenzeHandarbeit, neueHandarbeit } from '@/server/handpflege';
import { subcontractorSchema } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, subcontractorSchema.partial());

  if (input.tradeIds) {
    await prisma.subcontractorTrade.deleteMany({ where: { subcontractorId: id } });
    if (input.tradeIds.length) {
      await prisma.subcontractorTrade.createMany({
        data: input.tradeIds.map((tradeId) => ({ subcontractorId: id, tradeId })),
        skipDuplicates: true,
      });
    }
  }

  /*
   * Merken, was dieser Mensch geaendert hat. Der Abgleich mit „Das Programm"
   * laesst genau diese Felder danach in Ruhe - sonst kaeme beim naechsten
   * Lauf die alte Schreibweise aus dem ERP zurueck.
   */
  const vorher = await prisma.subcontractor.findUnique({ where: { id } });
  const eingabe = {
    companyName: input.companyName?.trim(),
    contactName: input.contactName,
    phone: input.phone,
    email: input.email,
    street: input.street,
    zip: input.zip,
    city: input.city,
  };
  const manuelleFelder = vorher
    ? ergaenzeHandarbeit(vorher.manuelleFelder, neueHandarbeit(vorher, eingabe))
    : undefined;

  const sub = await prisma.subcontractor.update({
    where: { id },
    data: {
      manuelleFelder,
      companyName: input.companyName?.trim(),
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      street: input.street,
      zip: input.zip,
      city: input.city,
      note: input.note,
      active: input.active,
      preferred: input.preferred,
      rating: input.rating,
      crewSize: input.crewSize,
    },
  });

  await writeAudit({
    entityType: 'subcontractor',
    entityId: id,
    action: 'updated',
    label: `Subunternehmer geändert: ${sub.companyName}`,
    newValue: input,
  });

  return ok({ subcontractor: sub, message: 'Gespeichert.' });
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sub = await prisma.subcontractor.findUnique({ where: { id } });
  if (!sub) return ok({ message: 'Subunternehmer nicht gefunden.' }, { status: 404 });

  const assignments = await prisma.assignment.count({ where: { subcontractorId: id } });
  if (assignments > 0) {
    await prisma.subcontractor.update({ where: { id }, data: { active: false } });
    await writeAudit({
      entityType: 'subcontractor',
      entityId: id,
      action: 'deactivated',
      label: `Subunternehmer deaktiviert: ${sub.companyName}`,
    });
    return ok({
      message: `${sub.companyName} hat ${assignments} Einsätze und wurde deaktiviert statt gelöscht.`,
      deactivated: true,
    });
  }

  await prisma.subcontractor.delete({ where: { id } });
  await writeAudit({
    entityType: 'subcontractor',
    entityId: id,
    action: 'deleted',
    label: `Subunternehmer gelöscht: ${sub.companyName}`,
  });
  return ok({ message: `${sub.companyName} wurde gelöscht.` });
});
