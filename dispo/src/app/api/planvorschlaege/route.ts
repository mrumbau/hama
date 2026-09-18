import { z } from 'zod';
import { fail, handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { aktuellerBenutzer, verlange } from '@/server/auth';
import { writeAudit } from '@/server/audit';
import { dbDateToIso } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import { darfVerbindlichPlanen } from '@/server/planung';

export const dynamic = 'force-dynamic';

/**
 * Alle offenen Planvorschläge – für jeden sichtbar.
 *
 * Bewusst nicht „jeder sieht nur seine eigenen": Wenn Philipp sieht, dass
 * Gerhard denselben Monteur will, klären die beiden das womöglich schon
 * vorher untereinander. Die Liste ist ein Abstimmungswerkzeug, kein
 * Postfach.
 *
 * Freigeben darf trotzdem nur die Leitung.
 */
export const GET = handler(async () => {
  const benutzer = await aktuellerBenutzer();
  const alle = darfVerbindlichPlanen(benutzer);

  const rows = await prisma.assignment.findMany({
    where: { status: 'VORSCHLAG' },
    include: {
      project: true,
      employee: true,
      siteManager: true,
      subcontractor: true,
      createdBy: true,
    },
    orderBy: [{ startDate: 'asc' }],
  });

  return ok({
    darfFreigeben: alle,
    vorschlaege: rows.map((a) => ({
      id: a.id,
      startDate: dbDateToIso(a.startDate),
      endDate: dbDateToIso(a.endDate),
      startTime: a.startTime,
      endTime: a.endTime,
      note: a.note,
      tasks: a.tasks,
      projectId: a.projectId,
      projektTitel: a.project.internKey ? a.project.name : a.project.customerName,
      projektOrt: a.project.city,
      ressource: a.employee
        ? fullName(a.employee)
        : a.siteManager
          ? fullName(a.siteManager)
          : (a.subcontractor?.companyName ?? a.placeholderLabel ?? 'Unbesetzt'),
      vorgeschlagenVon: a.createdBy
        ? `${a.createdBy.firstName} ${a.createdBy.lastName}`
        : 'Unbekannt',
      vorgeschlagenAm: a.createdAt.toISOString(),
    })),
  });
});

const entscheidung = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Bitte mindestens einen Vorschlag auswählen.'),
  annehmen: z.boolean(),
  /**
   * Freiwillig. Wird vieles direkt vor Ort besprochen, ist ein Tippfeld
   * nur im Weg – wer sich gerade gegenübersitzt, braucht keine schriftliche
   * Begründung. Steht einer da, landet er trotzdem im Protokoll.
   */
  grund: z.string().max(300).nullish(),
});

/** Vorschläge annehmen oder ablehnen – beides für mehrere auf einmal. */
export const POST = handler(async (request: Request) => {
  await verlange('planungFreigeben');
  const input = await parseBody(request, entscheidung);

  const betroffen = await prisma.assignment.findMany({
    where: { id: { in: input.ids }, status: 'VORSCHLAG' },
    include: { project: true, employee: true, siteManager: true, subcontractor: true },
  });
  if (betroffen.length === 0) return fail('Keiner dieser Vorschläge ist noch offen.', 404);

  await prisma.assignment.updateMany({
    where: { id: { in: betroffen.map((a) => a.id) } },
    data: input.annehmen
      ? { status: 'GEPLANT', ablehnungsgrund: null }
      : { status: 'ABGESAGT', ablehnungsgrund: input.grund?.trim() || null },
  });

  /*
   * Je Vorschlag ein Protokolleintrag, nicht einer fuer den Stapel: Wer
   * spaeter fragt „warum steht Luigi da nicht mehr", sucht am Einsatz,
   * nicht an einer Sammelaktion.
   */
  for (const a of betroffen) {
    const wer = a.employee
      ? fullName(a.employee)
      : a.siteManager
        ? fullName(a.siteManager)
        : (a.subcontractor?.companyName ?? 'Unbesetzt');
    await writeAudit({
      entityType: 'assignment',
      entityId: a.id,
      projectId: a.projectId,
      action: input.annehmen ? 'confirmed' : 'cancelled',
      label: input.annehmen
        ? `Planvorschlag angenommen: ${wer}`
        : `Planvorschlag abgelehnt: ${wer}`,
      note: input.annehmen ? null : (input.grund?.trim() ?? null),
    }).catch(() => undefined);
  }

  return ok({
    anzahl: betroffen.length,
    message: input.annehmen
      ? `${betroffen.length} Vorschlag${betroffen.length === 1 ? '' : 'e'} angenommen.`
      : `${betroffen.length} Vorschlag${betroffen.length === 1 ? '' : 'e'} abgelehnt.`,
  });
});
