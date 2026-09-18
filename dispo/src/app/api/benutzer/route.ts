import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Benutzerliste – nur für die Verwaltung. Passwörter kommen nie mit. */
export const GET = handler(async () => {
  await verlange('benutzerverwaltung');
  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      lastLoginAt: true,
      siteManagerId: true,
      passwordHash: true,
    },
  });

  return ok({
    users: users.map(({ passwordHash, ...u }) => ({
      ...u,
      // Nicht das Passwort, nur ob eines gesetzt ist.
      hatPasswort: Boolean(passwordHash),
    })),
  });
});
