import { z } from 'zod';
import { cookies } from 'next/headers';
import { handler, ok, fail, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { baueSitzung, hashePasswort, passwortStimmt, SESSION_COOKIE } from '@/server/auth';
import { aktuellerBenutzer } from '@/server/auth';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().max(200).optional(),
  /** Nur beim ersten Setzen: der Einrichtungscode aus den Umgebungsvariablen. */
  einrichtungscode: z.string().max(200).optional(),
  /** Beim Ändern: das bisherige Passwort. */
  altesPasswort: z.string().max(200).optional(),
  neuesPasswort: z.string().min(10, 'Das Passwort braucht mindestens 10 Zeichen.').max(200),
});

/**
 * Passwort setzen oder ändern.
 *
 * Zwei Wege:
 *   1. Erstes Setzen – mit E-Mail und Einrichtungscode. So muss niemand ein
 *      Startpasswort verschicken, und ohne den Code kann sich auch niemand
 *      Fremdes ein Konto aneignen.
 *   2. Ändern – angemeldet, mit dem bisherigen Passwort.
 */
export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, schema);
  const angemeldet = await aktuellerBenutzer();

  if (angemeldet && input.altesPasswort) {
    const user = await prisma.user.findUnique({ where: { id: angemeldet.id } });
    if (!user?.passwordHash || !(await passwortStimmt(input.altesPasswort, user.passwordHash))) {
      return fail('Das bisherige Passwort stimmt nicht.', 401);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashePasswort(input.neuesPasswort) },
    });
    return ok({ message: 'Passwort geändert.' });
  }

  // --- Erstes Setzen ---
  const code = process.env.DISPO_SETUP_CODE?.trim();
  if (!code) {
    return fail(
      'Es ist kein Einrichtungscode hinterlegt (DISPO_SETUP_CODE). Ohne ihn kann kein Passwort gesetzt werden.',
      503,
    );
  }
  if (!input.email || input.einrichtungscode !== code) {
    return fail('E-Mail oder Einrichtungscode stimmt nicht.', 401);
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });
  if (!user || !user.active) return fail('E-Mail oder Einrichtungscode stimmt nicht.', 401);
  if (user.passwordHash) {
    return fail('Für dieses Konto ist bereits ein Passwort gesetzt.', 409);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashePasswort(input.neuesPasswort), lastLoginAt: new Date() },
  });
  await writeAudit({
    entityType: 'integration',
    entityId: user.id,
    action: 'updated',
    label: `Passwort erstmals gesetzt: ${user.firstName} ${user.lastName}`,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, baueSitzung(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return ok({ message: `Passwort gesetzt. Willkommen, ${user.firstName}.` });
});
