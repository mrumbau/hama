import { z } from 'zod';
import { handler, ok, parseBody, ApiError } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';
import { writeAudit } from '@/server/audit';
import { isoToDbDate, todayIso } from '@/lib/dates';
import { aufRaster, naechsterStart, schrittweite, type Raster } from '@/lib/bauzeitenplan';
import { ladeBauzeitenplan, protokollZeile, verschiebePhase } from '@/server/bauzeitenplan';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss YYYY-MM-DD sein.');

/** Der Plan, wie ihn die Ansicht braucht. Lesen darf jeder Angemeldete. */
export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(await ladeBauzeitenplan(id));
});

const neueZeile = z.object({
  tradeId: z.string().min(1).nullish(),
  label: z.string().max(120).nullish(),
  subcontractorId: z.string().min(1).nullish(),
  startDate: isoDate.optional(),
  /** Dauer in Spalten – „drei Wochen" statt eines ausgerechneten Enddatums. */
  dauer: z.number().int().min(1).max(260).optional(),
  note: z.string().max(500).nullish(),
});

/**
 * Eine Zeile hinzufügen.
 *
 * Ohne Datum hängt sie sich hinter die letzte – das ist beim Aufbauen eines
 * Plans der Normalfall: ein Gewerk nach dem anderen, und erst danach schiebt
 * man zurecht.
 */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await verlange('bauzeitenplan');
  const input = await parseBody(request, neueZeile);

  if (!input.tradeId && !input.label?.trim()) {
    throw new ApiError('Bitte ein Gewerk wählen oder eine Bezeichnung eintragen.', 422);
  }

  const plan = await ladeBauzeitenplan(id);
  const raster = plan.raster;
  const start = aufRaster(
    input.startDate ?? naechsterStart(plan.phasen, raster, todayIso()),
    raster,
    'anfang',
  );
  const dauer = input.dauer ?? 1;
  const ende = aufRaster(
    addTage(start, dauer * schrittweite(raster) - 1),
    raster,
    'ende',
  );

  const trade = input.tradeId
    ? await prisma.trade.findUnique({ where: { id: input.tradeId } })
    : null;

  const phase = await prisma.schedulePhase.create({
    data: {
      projectId: id,
      tradeId: trade?.id ?? null,
      label: input.label?.trim() || null,
      subcontractorId: input.subcontractorId ?? null,
      startDate: isoToDbDate(start),
      endDate: isoToDbDate(ende),
      note: input.note?.trim() || null,
      sortOrder: plan.phasen.length * 10,
    },
  });

  const titel = input.label?.trim() || trade?.name || 'Zeile';
  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: id,
    action: 'bauzeitenplan_zeile',
    label: `Bauzeitenplan: ${titel} hinzugefügt`,
    newValue: { titel, von: start, bis: ende },
  });

  return ok({ phase, message: `${titel} steht im Bauzeitenplan.` }, { status: 201 });
});

const aenderung = z.discriminatedUnion('was', [
  z.object({
    was: z.literal('verschieben'),
    phaseId: z.string().min(1),
    /** Um wie viele Spalten, nicht Tage – das Raster rechnet die App. */
    spalten: z.number().int().min(-520).max(520),
    /** Vorgabe: alles ab hier. Der Plan behält seine Form. */
    modus: z.enum(['abHier', 'nurDiese']).default('abHier'),
  }),
  z.object({
    was: z.literal('zeile'),
    phaseId: z.string().min(1),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    label: z.string().max(120).nullish(),
    tradeId: z.string().min(1).nullish(),
    subcontractorId: z.string().min(1).nullish(),
    note: z.string().max(500).nullish(),
  }),
  z.object({ was: z.literal('raster'), raster: z.enum(['WOCHE', 'TAG']) }),
]);

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await verlange('bauzeitenplan');
  const input = await parseBody(request, aenderung);

  if (input.was === 'raster') {
    await prisma.project.update({ where: { id }, data: { scheduleUnit: input.raster } });
    return ok({
      message: input.raster === 'WOCHE' ? 'Plan rechnet in Wochen.' : 'Plan rechnet in Tagen.',
    });
  }

  const plan = await ladeBauzeitenplan(id);
  const phase = plan.phasen.find((p) => p.id === input.phaseId);
  if (!phase) throw new ApiError('Diese Zeile gibt es nicht (mehr).', 404);

  if (input.was === 'verschieben') {
    const tage = input.spalten * schrittweite(plan.raster);
    const anzahl = await verschiebePhase(id, input.phaseId, tage, input.modus ?? 'abHier');
    if (!anzahl) return ok({ message: 'Nichts verschoben.', anzahl: 0 });

    await writeAudit({
      entityType: 'project',
      entityId: id,
      projectId: id,
      action: 'bauzeitenplan_verschoben',
      label: `Bauzeitenplan verschoben: ${protokollZeile(
        phase.titel,
        phase.startDate,
        addTage(phase.startDate, tage),
      )}`,
      newValue: { tage, modus: input.modus, betroffen: anzahl },
    });

    return ok({
      anzahl,
      message:
        (input.modus ?? 'abHier') === 'abHier' && anzahl > 1
          ? `${phase.titel} und ${anzahl - 1} weitere verschoben.`
          : `${phase.titel} verschoben.`,
    });
  }

  // Einzelne Felder ändern – Datum hier bewusst ohne Nachrücken: Wer ein
  // Datum tippt, meint genau diese Zeile.
  const start = input.startDate ? aufRaster(input.startDate, plan.raster, 'anfang') : undefined;
  const ende = input.endDate ? aufRaster(input.endDate, plan.raster, 'ende') : undefined;
  if (start && ende && ende < start) {
    throw new ApiError('Das Ende liegt vor dem Beginn.', 422);
  }

  await prisma.schedulePhase.update({
    where: { id: input.phaseId },
    data: {
      startDate: start ? isoToDbDate(start) : undefined,
      endDate: ende ? isoToDbDate(ende) : undefined,
      label: input.label === undefined ? undefined : input.label?.trim() || null,
      tradeId: input.tradeId === undefined ? undefined : (input.tradeId ?? null),
      subcontractorId:
        input.subcontractorId === undefined ? undefined : (input.subcontractorId ?? null),
      note: input.note === undefined ? undefined : input.note?.trim() || null,
    },
  });

  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: id,
    action: 'bauzeitenplan_zeile',
    label: `Bauzeitenplan geändert: ${phase.titel}`,
    oldValue: { von: phase.startDate, bis: phase.endDate },
    newValue: { von: start ?? phase.startDate, bis: ende ?? phase.endDate },
  });

  return ok({ message: 'Gespeichert.' });
});

export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await verlange('bauzeitenplan');
  const phaseId = new URL(request.url).searchParams.get('zeile');
  if (!phaseId) throw new ApiError('Keine Zeile angegeben.', 400);

  const phase = await prisma.schedulePhase.findUnique({
    where: { id: phaseId },
    include: { trade: true },
  });
  if (!phase || phase.projectId !== id) {
    throw new ApiError('Diese Zeile gibt es nicht (mehr).', 404);
  }

  await prisma.schedulePhase.delete({ where: { id: phaseId } });

  const titel = phase.label?.trim() || phase.trade?.name || 'Zeile';
  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: id,
    action: 'bauzeitenplan_zeile',
    label: `Bauzeitenplan: ${titel} entfernt`,
    oldValue: { titel },
  });

  return ok({ message: `${titel} entfernt.` });
});

/** Tage auf ein ISO-Datum addieren, ohne über Zeitzonen zu stolpern. */
function addTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}
