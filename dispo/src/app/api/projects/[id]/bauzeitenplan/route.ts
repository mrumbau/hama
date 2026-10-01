import { z } from 'zod';
import { handler, ok, parseBody, ApiError } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';
import { writeAudit } from '@/server/audit';
import { addDays, fromIso, isoToDbDate, todayIso, toIso } from '@/lib/dates';
import { aufRaster, naechsterStart, schrittweite } from '@/lib/bauzeitenplan';
import { ladeBauzeitenplan, protokollZeile, verschiebePhase } from '@/server/bauzeitenplan';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/*
 * Form und Existenz. Die Form allein liess den 31. Februar durch: Im
 * Wochenraster rutschte er stillschweigend auf den 3. Maerz, im Tagesraster
 * stuerzte die Datenbank darueber. Ein Datum, das nach dem Hin- und
 * Zurueckrechnen nicht mehr dasselbe ist, gab es nie.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss YYYY-MM-DD sein.')
  .refine((d) => toIso(fromIso(d)) === d, 'Dieses Datum gibt es nicht.');

/**
 * Gibt es diese Baustelle? Sonst 404 - und nicht die Prisma-Meldung als 500,
 * die der Oberflaeche woertlich im Toast erschien.
 */
async function verlangeProjekt(id: string): Promise<void> {
  const projekt = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!projekt) throw new ApiError('Diese Baustelle gibt es nicht (mehr).', 404);
}

/**
 * Gewerk und Firma muessen existieren. Ein in einem anderen Fenster
 * geloeschtes Gewerk lief sonst in den Fremdschluessel und kam als 500 mit
 * roher Datenbankmeldung zurueck.
 */
async function verlangeBezuege(tradeIds: (string | null | undefined)[], subIds: (string | null | undefined)[]) {
  const gewerke = [...new Set(tradeIds.filter((x): x is string => Boolean(x)))];
  const firmen = [...new Set(subIds.filter((x): x is string => Boolean(x)))];
  const [g, f] = await Promise.all([
    gewerke.length
      ? prisma.trade.findMany({ where: { id: { in: gewerke } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    firmen.length
      ? prisma.subcontractor.findMany({ where: { id: { in: firmen } }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  if (g.length !== gewerke.length) throw new ApiError('Dieses Gewerk gibt es nicht (mehr).', 422);
  if (f.length !== firmen.length) throw new ApiError('Diese Firma gibt es nicht (mehr).', 422);
  return new Map(g.map((x) => [x.id, x.name]));
}

/** Der Plan, wie ihn die Ansicht braucht. Lesen darf jeder Angemeldete. */
export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await verlangeProjekt(id);
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
 * Eine Zeile - oder gleich mehrere.
 *
 * Die Gewerkauswahl schickt mehrere: Wer einen Plan aufbaut, hakt Abbruch,
 * Rohinstallation und Estrich auf einmal an und schiebt erst danach zurecht.
 * Ein Formular pro Gewerk waere zehn Formulare fuer einen Plan.
 */
const neueZeilen = neueZeile.extend({
  /** Gesetzt, wenn mehrere Gewerke auf einmal kommen. Sonst gilt die Zeile selbst. */
  zeilen: z.array(neueZeile).min(1).max(40).optional(),
});

/**
 * Zeilen hinzufügen.
 *
 * Ohne Datum hängt sich jede hinter die letzte – das ist beim Aufbauen eines
 * Plans der Normalfall: ein Gewerk nach dem anderen, und erst danach schiebt
 * man zurecht. Bei mehreren reihen sie sich in der Reihenfolge auf, in der
 * sie angehakt wurden.
 *
 * Alles in einer Transaktion: Ein halb angelegter Plan wäre schlimmer als ein
 * gar nicht angelegter, weil man ihm nicht ansieht, was fehlt.
 */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await verlange('bauzeitenplan');
  const input = await parseBody(request, neueZeilen);
  const zeilen = input.zeilen ?? [input];

  for (const zeile of zeilen) {
    if (!zeile.tradeId && !zeile.label?.trim()) {
      throw new ApiError('Bitte ein Gewerk wählen oder eine Bezeichnung eintragen.', 422);
    }
  }

  await verlangeProjekt(id);
  const nameVon = await verlangeBezuege(
    zeilen.map((z) => z.tradeId),
    zeilen.map((z) => z.subcontractorId),
  );
  const plan = await ladeBauzeitenplan(id);
  const raster = plan.raster;

  /*
   * Die vorhandenen Zeilen plus die, die in diesem Durchgang dazukommen -
   * sonst starten alle neuen am selben Tag.
   */
  const bisher = plan.phasen.map((p) => ({
    id: p.id,
    startDate: p.startDate,
    endDate: p.endDate,
  }));

  const daten = zeilen.map((zeile, i) => {
    const start = aufRaster(
      zeile.startDate ?? naechsterStart(bisher, raster, todayIso()),
      raster,
      'anfang',
    );
    const ende = aufRaster(
      addDays(start, (zeile.dauer ?? 1) * schrittweite(raster) - 1),
      raster,
      'ende',
    );
    bisher.push({ id: `neu-${i}`, startDate: start, endDate: ende });

    return {
      titel:
        zeile.label?.trim() || (zeile.tradeId ? nameVon.get(zeile.tradeId) : null) || 'Zeile',
      von: start,
      bis: ende,
      data: {
        projectId: id,
        tradeId: zeile.tradeId ?? null,
        label: zeile.label?.trim() || null,
        subcontractorId: zeile.subcontractorId ?? null,
        startDate: isoToDbDate(start),
        endDate: isoToDbDate(ende),
        note: zeile.note?.trim() || null,
        sortOrder: (plan.phasen.length + i) * 10,
      },
    };
  });

  const phasen = await prisma.$transaction(
    daten.map((d) => prisma.schedulePhase.create({ data: d.data })),
  );

  const titel = daten.map((d) => d.titel);
  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: id,
    action: 'bauzeitenplan_zeile',
    label:
      daten.length === 1
        ? `Bauzeitenplan: ${titel[0]} hinzugefügt`
        : `Bauzeitenplan: ${daten.length} Gewerke hinzugefügt (${titel.join(', ')})`,
    newValue: { zeilen: daten.map((d) => ({ titel: d.titel, von: d.von, bis: d.bis })) },
  });

  return ok(
    {
      phasen,
      message:
        daten.length === 1
          ? `${titel[0]} steht im Bauzeitenplan.`
          : `${daten.length} Gewerke stehen im Bauzeitenplan.`,
    },
    { status: 201 },
  );
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
  await verlangeProjekt(id);

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
        addDays(phase.startDate, tage),
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
  /*
   * Gegen den Stand pruefen, der nachher gilt - nicht nur gegen das, was
   * mitkam. Vorher griff die Pruefung nur, wenn beide Daten im Aufruf standen;
   * das Ziehen der rechten Kante schickt aber nur das Ende, und so landete ein
   * Ende vor dem Beginn in der Datenbank.
   */
  if ((ende ?? phase.endDate) < (start ?? phase.startDate)) {
    throw new ApiError('Das Ende liegt vor dem Beginn.', 422);
  }

  // Dieselbe Regel wie beim Anlegen: ohne Gewerk braucht es eine Bezeichnung.
  const tradeNachher = input.tradeId === undefined ? phase.tradeId : input.tradeId;
  const labelNachher = input.label === undefined ? phase.label : input.label?.trim() || null;
  if (!tradeNachher && !labelNachher) {
    throw new ApiError('Bitte ein Gewerk wählen oder eine Bezeichnung eintragen.', 422);
  }
  await verlangeBezuege([input.tradeId], [input.subcontractorId]);

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
