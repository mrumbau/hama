import { z } from 'zod';
import { cookies } from 'next/headers';
import { handler, ok, fail, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { baueSitzung, passwortStimmt, SESSION_COOKIE } from '@/server/auth';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().min(1, 'E-Mail fehlt.').max(200),
  passwort: z.string().min(1, 'Passwort fehlt.').max(200),
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, schema);
  const user = await prisma.user.findUnique({
    where: { email: input.email.trim().toLowerCase() },
  });

  // Bewusst dieselbe Meldung für „gibt es nicht" und „falsches Passwort" –
  // sonst verrät die App, welche Adressen existieren.
  const abgelehnt = () => fail('E-Mail oder Passwort stimmt nicht.', 401);

  if (!user || !user.active) return abgelehnt();
  if (!user.passwordHash) {
    return fail('Für dieses Konto ist noch kein Passwort gesetzt.', 409, {
      passwortFehlt: true,
    });
  }
  if (!(await passwortStimmt(input.passwort, user.passwordHash))) return abgelehnt();

  const store = await cookies();
  store.set(SESSION_COOKIE, baueSitzung(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return ok({
    user: { firstName: user.firstName, lastName: user.lastName, role: user.role },
    message: `Willkommen, ${user.firstName}.`,
  });
});
