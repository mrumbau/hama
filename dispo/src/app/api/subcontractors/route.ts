import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { subcontractorSchema } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const rows = await prisma.subcontractor.findMany({
    include: { trades: { include: { trade: true } } },
    orderBy: [{ active: 'desc' }, { preferred: 'desc' }, { companyName: 'asc' }],
  });
  return ok(
    rows.map((s) => ({
      ...s,
      tradeIds: s.trades.map((t) => t.tradeId),
      tradeNames: s.trades.map((t) => t.trade.name),
    })),
  );
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, subcontractorSchema);

  const tradeIds = [...(input.tradeIds ?? [])];
  if (input.tradeName?.trim()) {
    const trade = await prisma.trade.upsert({
      where: { name: input.tradeName.trim() },
      update: {},
      create: { name: input.tradeName.trim() },
    });
    if (!tradeIds.includes(trade.id)) tradeIds.push(trade.id);
  }

  const sub = await prisma.subcontractor.create({
    data: {
      companyName: input.companyName.trim(),
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      street: input.street ?? null,
      zip: input.zip ?? null,
      city: input.city ?? null,
      note: input.note ?? null,
      active: input.active ?? true,
      preferred: input.preferred ?? false,
      rating: input.rating ?? null,
      crewSize: input.crewSize ?? null,
      trades: tradeIds.length ? { create: tradeIds.map((tradeId) => ({ tradeId })) } : undefined,
    },
  });

  await writeAudit({
    entityType: 'subcontractor',
    entityId: sub.id,
    action: 'created',
    label: `Subunternehmer angelegt: ${sub.companyName}`,
  });

  return ok(
    { subcontractor: sub, message: `${sub.companyName} wurde angelegt und ist sofort planbar.` },
    { status: 201 },
  );
});
