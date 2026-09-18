import { z } from 'zod';
import { handler, ok, fail, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { aktuellerBenutzer, hashePasswort, passwortStimmt } from '@/server/auth';

export const dynamic = 'force-dynamic';

const schema = z.object({
  /** Das bisherige Passwort – nur so darf man sein eigenes ändern. */
  altesPasswort: z.string().max(200).optional(),
  neuesPasswort: z.string().min(10, 'Das Passwort braucht mindestens 10 Zeichen.').max(200),
});

/**
 * Sein eigenes Passwort ändern.
 *
 * Nur angemeldet und nur mit dem bisherigen Passwort. Neue Passwörter vergibt
 * die Verwaltung – so bleibt der Zugang zu jedem Konto erhalten, auch wenn
 * jemand ausfällt oder seines vergisst.
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

  // Ein Selbstvergabe-Weg gibt es bewusst nicht mehr: Passwoerter kommen
  // zentral (Startpasswort beim Deployment) oder von der Verwaltung.
  // Sonst haette niemand einen Generalschluessel, wenn jemand ausfaellt.
  return fail(
    'Passwörter werden von der Verwaltung vergeben. Zum Ändern bitte angemeldet das bisherige Passwort angeben.',
    403,
  );
});
