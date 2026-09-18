import { handler, ok, parseBody, fail } from '@/server/api';
import { deleteProject, projectUpdateSchema, updateProject } from '@/server/projects';
import { prisma } from '@/lib/db';
import { dbDateToIso } from '@/lib/dates';
import { computeAmpel } from '@/server/ampel';
import { pruefeAenderung, pruefeLoeschen } from '@/server/interne-eintraege';
import { fullName } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      primarySiteManager: true,
      secondarySiteManager: true,
      notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
      communications: { orderBy: { occurredAt: 'desc' }, take: 50 },
      changeRequests: { orderBy: { createdAt: 'desc' }, take: 50 },
      assignments: {
        include: { employee: true, siteManager: true, subcontractor: true },
        orderBy: { startDate: 'asc' },
      },
    },
  });
  if (!p) return fail('Projekt nicht gefunden.', 404);

  const assignments = p.assignments.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    resourceType: a.resourceType,
    resourceLabel:
      a.subcontractor?.companyName ??
      (a.employee
        ? fullName(a.employee)
        : a.siteManager
          ? fullName(a.siteManager)
          : (a.placeholderLabel ?? 'Unbesetzt')),
    resourceShort:
      a.employee?.shortCode ??
      a.siteManager?.shortCode ??
      a.subcontractor?.companyName?.slice(0, 12) ??
      '??',
    resourceKey: a.employeeId
      ? `MITARBEITER:${a.employeeId}`
      : a.siteManagerId
        ? `BAULEITER:${a.siteManagerId}`
        : a.subcontractorId
          ? `SUBUNTERNEHMER:${a.subcontractorId}`
          : `UNBESETZT:${a.id}`,
    employeeId: a.employeeId,
    siteManagerId: a.siteManagerId,
    subcontractorId: a.subcontractorId,
    placeholderLabel: a.placeholderLabel,
    startDate: dbDateToIso(a.startDate),
    endDate: dbDateToIso(a.endDate),
    startTime: a.startTime,
    endTime: a.endTime,
    note: a.note,
    status: a.status,
    source: a.source,
    color: '#0f766e',
    kind: a.kind,
    tasks: a.tasks,
  }));

  const ampel = computeAmpel({
    status: p.status,
    plannedStart: p.plannedStart ? dbDateToIso(p.plannedStart) : null,
    plannedEnd: p.plannedEnd ? dbDateToIso(p.plannedEnd) : null,
    materialStatus: p.materialStatus,
    customerConfirmed: p.customerConfirmed,
    primarySiteManagerId: p.primarySiteManagerId,
    assignments: assignments as never,
    hasStaffConflict: false,
    hasSubDoubleBooking: false,
    openChangeRequests: p.changeRequests.filter((c) => c.status === 'OFFEN').length,
  });

  return ok({
    project: {
      ...p,
      plannedStart: p.plannedStart ? dbDateToIso(p.plannedStart) : null,
      plannedEnd: p.plannedEnd ? dbDateToIso(p.plannedEnd) : null,
      primarySiteManagerName: p.primarySiteManager ? fullName(p.primarySiteManager) : null,
      secondarySiteManagerName: p.secondarySiteManager ? fullName(p.secondarySiteManager) : null,
      trafficLight: p.trafficLightOverride ?? ampel.light,
      trafficLightReasons: ampel.reasons,
    },
    assignments,
  });
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = await parseBody(request, projectUpdateSchema);

  // Lager und Besorgungsfahrten sind feste Zeilen der Tafel. Dort lassen
  // sich nur Notizen aendern - alles andere wuerde eine Baustelle
  // vortaeuschen, die es nicht gibt.
  const vorhanden = await prisma.project.findUnique({
    where: { id },
    select: { internKey: true },
  });
  if (!vorhanden) return fail('Projekt nicht gefunden.', 404);
  pruefeAenderung(vorhanden.internKey, input as Record<string, unknown>);

  const { project, changed, erp } = await updateProject(id, input);

  // Der Disponent soll sehen, ob der Status auch im ERP angekommen ist –
  // sonst verlässt sich jemand darauf, dass „Das Programm" Bescheid weiss.
  const message = changed.length
    ? erp?.versucht
      ? erp.erfolg
        ? `Änderungen gespeichert. ${erp.nachricht}`
        : `Änderungen gespeichert. Das Programm meldet: ${erp.nachricht}`
      : 'Änderungen gespeichert.'
    : 'Keine Änderungen.';

  return ok({ project, changed, erp, message });
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const vorhanden = await prisma.project.findUnique({
    where: { id },
    select: { internKey: true },
  });
  if (!vorhanden) return fail('Projekt nicht gefunden.', 404);
  pruefeLoeschen(vorhanden.internKey);

  const p = await deleteProject(id);
  return ok({ message: `Projekt „${p.name}“ wurde gelöscht.` });
});
