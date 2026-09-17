import { z } from 'zod';
import { handler, ok, fail, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { hashePasswort, verlange } from '@/server/auth';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  role: z.enum(['ADMIN', 'LEITUNG', 'BAULEITER']).optional(),
  active: z.boolean().optional(),
  /** Neues Passwort setzen – der Generalschlüssel der Verwaltung. */
  neuesPasswort: z
    .string()
    .min(10, 'Das Passwort braucht mindestens 10 Zeichen.')
    .max(200)
    .optional(),
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const verwalter = await verlange('benutzerverwaltung');
  const { id } = await ctx.params;
  const input = await parseBody(request, schema);

  const ziel = await prisma.user.findUnique({ where: { id } });
  if (!ziel) return fail('Benutzer nicht gefunden.', 404);

  // Sich selbst die Verwaltung zu entziehen oder sich stillzulegen wäre der
  // Weg, sich auszusperren – dann käme niemand mehr an die Rechte.
  if (ziel.id === verwalter.id) {
    if (input.role && input.role !== 'ADMIN') {
      return fail('Sie können sich die Verwaltung nicht selbst entziehen.', 422);
    }
    if (input.active === false) {
      return fail('Sie können Ihr eigenes Konto nicht stilllegen.', 422);
    }
  }

  // Der letzte aktive Verwalter darf nicht wegfallen.
  if ((input.role && input.role !== 'ADMIN') || input.active === false) {
    if (ziel.role === 'ADMIN' && ziel.active) {
      const weitere = await prisma.user.count({
        where: { role: 'ADMIN', active: true, id: { not: ziel.id } },
      });
      if (weitere === 0) {
        return fail('Es muss mindestens ein Konto mit Verwaltungsrechten aktiv bleiben.', 422);
      }
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      role: input.role,
      active: input.active,
      ...(input.neuesPasswort ? { passwordHash: await hashePasswort(input.neuesPasswort) } : {}),
    },
  });

  await writeAudit({
    entityType: 'integration',
    entityId: user.id,
    action: 'updated',
    label: `Benutzer geändert: ${user.firstName} ${user.lastName}`,
    // Das Passwort selbst wird nie protokolliert, nur dass es neu gesetzt wurde.
    newValue: {
      role: input.role,
      active: input.active,
      passwortNeuGesetzt: Boolean(input.neuesPasswort),
    },
    note: `Durch ${verwalter.firstName} ${verwalter.lastName}.`,
  });

  return ok({
    user: { id: user.id, role: user.role, active: user.active },
    message: input.neuesPasswort
      ? `Neues Passwort für ${user.firstName} ${user.lastName} gesetzt.`
      : 'Gespeichert.',
  });
});
