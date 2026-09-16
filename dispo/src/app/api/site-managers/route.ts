import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { fullName, initials } from '@/lib/utils';
import { siteManagerSchema, uniqueShortCode } from '@/server/resource-schemas';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const rows = await prisma.siteManager.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }],
    include: { _count: { select: { projectsPrimary: true } } },
  });
  return ok(
    rows.map((m) => ({ ...m, name: fullName(m), projectCount: m._count.projectsPrimary })),
  );
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, siteManagerSchema);
  const shortCode = await uniqueShortCode(
    input.shortCode?.trim() || initials(input.firstName, input.lastName),
  );
  const manager = await prisma.siteManager.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      shortCode,
      phone: input.phone ?? null,
      email: input.email ?? null,
      color: input.color ?? '#2563eb',
      note: input.note ?? null,
      active: input.active ?? true,
    },
  });
  await writeAudit({
    entityType: 'site_manager',
    entityId: manager.id,
    action: 'created',
    label: `Bauleiter angelegt: ${fullName(manager)}`,
  });
  return ok({ manager, message: `${fullName(manager)} wurde angelegt.` }, { status: 201 });
});
