import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { BAULEITUNG_FAEHIGKEIT, pflegeBauleitung } from '@/server/bauleitung';
import { fullName, initials } from '@/lib/utils';
import { employeeSchema, uniqueShortCode } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

/**
 * Wer „Bauleitung" traegt, gehoert in die Bauleiterliste - und nur dorthin.
 * Sonst stuende dieselbe Person in beiden Listen, und genau das war die
 * Beschwerde: zwei Schienen fuer einen Menschen.
 *
 * Mit `?auchBauleiter=1` kommen sie trotzdem mit. Das braucht die
 * Mitarbeiterliste, damit man das Haekchen auch wieder entfernen kann -
 * sonst waere der Weg dorthin eine Einbahnstrasse.
 */
export const GET = handler(async (request: Request) => {
  const auchBauleiter = new URL(request.url).searchParams.get('auchBauleiter') === '1';

  const rows = await prisma.employee.findMany({
    where: auchBauleiter
      ? undefined
      : {
          NOT: {
            trades: {
              some: { trade: { name: { equals: BAULEITUNG_FAEHIGKEIT, mode: 'insensitive' } } },
            },
          },
        },
    include: { trades: { include: { trade: true } } },
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }],
  });
  return ok(
    rows.map((e) => ({
      ...e,
      name: fullName(e),
      tradeIds: e.trades.map((t) => t.tradeId),
      tradeNames: e.trades.map((t) => t.trade.name),
    })),
  );
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, employeeSchema);
  const shortCode = await uniqueShortCode(
    input.shortCode?.trim() || initials(input.firstName, input.lastName),
  );

  const employee = await prisma.employee.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      shortCode,
      phone: input.phone ?? null,
      profession: input.profession ?? null,
      weeklyHours: input.weeklyHours ?? null,
      driversLicense: input.driversLicense ?? false,
      note: input.note ?? null,
      active: input.active ?? true,
      trades: input.tradeIds?.length
        ? { create: input.tradeIds.map((tradeId) => ({ tradeId })) }
        : undefined,
    },
  });

  await writeAudit({
    entityType: 'employee',
    entityId: employee.id,
    action: 'created',
    label: `Mitarbeiter angelegt: ${fullName(employee)}`,
    newValue: { name: fullName(employee), shortCode },
  });

  // Wird jemand gleich mit der Faehigkeit „Bauleitung" angelegt, muss er
  // auch sofort am Projekt waehlbar sein - nicht erst nach einer Aenderung.
  const bauleitung = await pflegeBauleitung(employee.id);

  return ok(
    {
      employee,
      message:
        bauleitung === 'angelegt'
          ? `${fullName(employee)} wurde angelegt und steht auch bei den Bauleitern zur Auswahl.`
          : `${fullName(employee)} wurde angelegt.`,
    },
    { status: 201 },
  );
});
