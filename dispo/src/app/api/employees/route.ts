import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { pflegeBauleitung } from '@/server/bauleitung';
import { fullName, initials } from '@/lib/utils';
import { employeeSchema, uniqueShortCode } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const rows = await prisma.employee.findMany({
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
