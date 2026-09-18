import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { ergaenzeHandarbeit, neueHandarbeit } from '@/server/handpflege';
import { pflegeBauleitung } from '@/server/bauleitung';
import { fullName } from '@/lib/utils';
import { employeeSchema } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, employeeSchema.partial());

  if (input.tradeIds) {
    await prisma.employeeTrade.deleteMany({ where: { employeeId: id } });
    if (input.tradeIds.length) {
      await prisma.employeeTrade.createMany({
        data: input.tradeIds.map((tradeId) => ({ employeeId: id, tradeId })),
        skipDuplicates: true,
      });
    }
  }

  // Siehe Subunternehmer: Was hier von Hand gesetzt wird, gewinnt gegen den
  // naechsten Abgleich.
  const vorher = await prisma.employee.findUnique({ where: { id } });
  const eingabe = {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    profession: input.profession,
  };
  const manuelleFelder = vorher
    ? ergaenzeHandarbeit(vorher.manuelleFelder, neueHandarbeit(vorher, eingabe))
    : undefined;

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      manuelleFelder,
      firstName: input.firstName,
      lastName: input.lastName,
      shortCode: input.shortCode?.trim() || undefined,
      phone: input.phone,
      profession: input.profession,
      weeklyHours: input.weeklyHours,
      driversLicense: input.driversLicense,
      note: input.note,
      active: input.active,
    },
  });

  await writeAudit({
    entityType: 'employee',
    entityId: id,
    action: 'updated',
    label: `Mitarbeiter geändert: ${fullName(employee)}`,
    newValue: input,
  });

  // Fähigkeit „Bauleitung“ gesetzt oder entfernt? Dann muss die Person auch
  // am Projekt als Bauleiter wählbar sein – oder eben nicht mehr.
  const bauleitung = await pflegeBauleitung(id);

  const message =
    bauleitung === 'angelegt'
      ? `Gespeichert. ${fullName(employee)} steht jetzt auch bei den Bauleitern zur Auswahl.`
      : bauleitung === 'stillgelegt'
        ? `Gespeichert. ${fullName(employee)} wird nicht mehr als Bauleiter geführt; bestehende Zuordnungen bleiben.`
        : 'Gespeichert.';

  return ok({ employee, message });
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const planned = await prisma.assignment.count({ where: { employeeId: id } });
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) return ok({ message: 'Mitarbeiter nicht gefunden.' }, { status: 404 });

  // Mitarbeiter mit Planungshistorie werden deaktiviert, nicht geloescht –
  // sonst verschwinden vergangene Einsaetze aus der Historie.
  if (planned > 0) {
    await prisma.employee.update({ where: { id }, data: { active: false } });
    await writeAudit({
      entityType: 'employee',
      entityId: id,
      action: 'deactivated',
      label: `Mitarbeiter deaktiviert: ${fullName(employee)}`,
      note: `${planned} vorhandene Einsätze bleiben erhalten.`,
    });
    return ok({
      message: `${fullName(employee)} hat ${planned} Einsätze und wurde deaktiviert statt gelöscht.`,
      deactivated: true,
    });
  }

  await prisma.employee.delete({ where: { id } });
  await writeAudit({
    entityType: 'employee',
    entityId: id,
    action: 'deleted',
    label: `Mitarbeiter gelöscht: ${fullName(employee)}`,
  });
  return ok({ message: `${fullName(employee)} wurde gelöscht.` });
});
