/**
 * Einsatz-Logik: anlegen, aendern, verschieben, loeschen.
 * Jede Mutation schreibt gleichzeitig ins Audit-Log (Master-Prompt 14).
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  dbDateToIso,
  diffDays,
  formatDateShort,
  isoToDbDate,
  type IsoDate,
  WEEKDAY_LONG,
  weekdayIndex,
} from '@/lib/dates';
import {
  ASSIGNMENT_KIND_KEYS,
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_KEYS,
  CHANGE_REASON_KEYS,
  RESOURCE_TYPE_LABEL,
} from '@/lib/labels';
import { fullName } from '@/lib/utils';
import { ApiError } from './api';
import { writeAudit } from './audit';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss YYYY-MM-DD sein.');
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit muss HH:MM sein.')
  .nullable()
  .optional();

export const createAssignmentSchema = z
  .object({
    projectId: z.string().min(1),
    resourceType: z.enum(['MITARBEITER', 'BAULEITER', 'SUBUNTERNEHMER', 'UNBESETZT']),
    employeeId: z.string().nullish(),
    siteManagerId: z.string().nullish(),
    subcontractorId: z.string().nullish(),
    placeholderLabel: z.string().max(120).nullish(),
    startDate: isoDate,
    endDate: isoDate.optional(),
    startTime: timeString,
    endTime: timeString,
    note: z.string().max(2000).nullish(),
    kind: z.enum(ASSIGNMENT_KIND_KEYS as [string, ...string[]]).optional(),
    tasks: z.array(z.string().min(1).max(200)).max(50).optional(),
    status: z.enum(ASSIGNMENT_STATUS_KEYS as [string, ...string[]]).optional(),
    source: z.enum(['MANUELL', 'DAS_PROGRAMM', 'TELEFON_3CX', 'OUTLOOK', 'AUTOMATISCH']).optional(),
    /** Bewusstes Ueberschreiben einer Konfliktwarnung. */
    force: z.boolean().optional(),
  })
  .refine(
    (v) =>
      (v.resourceType === 'MITARBEITER' && !!v.employeeId) ||
      (v.resourceType === 'BAULEITER' && !!v.siteManagerId) ||
      (v.resourceType === 'SUBUNTERNEHMER' && !!v.subcontractorId) ||
      v.resourceType === 'UNBESETZT',
    { message: 'Zur gewählten Ressourcenart fehlt die Ressource.' },
  );

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  startTime: timeString,
  endTime: timeString,
  note: z.string().max(2000).nullish(),
  kind: z.enum(ASSIGNMENT_KIND_KEYS as [string, ...string[]]).optional(),
  tasks: z.array(z.string().min(1).max(200)).max(50).optional(),
  status: z.enum(ASSIGNMENT_STATUS_KEYS as [string, ...string[]]).optional(),
  projectId: z.string().min(1).optional(),
  resourceType: z.enum(['MITARBEITER', 'BAULEITER', 'SUBUNTERNEHMER', 'UNBESETZT']).optional(),
  employeeId: z.string().nullish(),
  siteManagerId: z.string().nullish(),
  subcontractorId: z.string().nullish(),
  placeholderLabel: z.string().max(120).nullish(),
  reason: z.enum(CHANGE_REASON_KEYS as [string, ...string[]]).nullish(),
  reasonText: z.string().max(500).nullish(),
  force: z.boolean().optional(),
});

export const moveAssignmentSchema = z.object({
  /** Neuer Starttag. Die Dauer bleibt erhalten. */
  startDate: isoDate,
  /** Optional: Einsatz gleichzeitig auf ein anderes Projekt ziehen. */
  projectId: z.string().min(1).optional(),
  reason: z.enum(CHANGE_REASON_KEYS as [string, ...string[]]).nullish(),
  reasonText: z.string().max(500).nullish(),
  force: z.boolean().optional(),
});

export interface ConflictInfo {
  resourceLabel: string;
  date: IsoDate;
  projectLabel: string;
  assignmentId: string;
}

/**
 * Sucht Einsaetze derselben Ressource, die sich mit [start,end] ueberschneiden
 * und zu einem ANDEREN Projekt gehoeren.
 */
export async function findConflicts(params: {
  excludeAssignmentId?: string;
  projectId: string;
  employeeId?: string | null;
  siteManagerId?: string | null;
  subcontractorId?: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  startTime?: string | null;
  endTime?: string | null;
}): Promise<ConflictInfo[]> {
  const resourceWhere = params.employeeId
    ? { employeeId: params.employeeId }
    : params.subcontractorId
      ? { subcontractorId: params.subcontractorId }
      : params.siteManagerId
        ? { siteManagerId: params.siteManagerId }
        : null;

  // Bauleiter betreuen naturgemaess mehrere Baustellen parallel – kein Konflikt.
  if (!resourceWhere || params.siteManagerId) return [];

  const overlapping = await prisma.assignment.findMany({
    where: {
      ...resourceWhere,
      id: params.excludeAssignmentId ? { not: params.excludeAssignmentId } : undefined,
      projectId: { not: params.projectId },
      status: { not: 'ABGESAGT' },
      startDate: { lte: isoToDbDate(params.endDate) },
      endDate: { gte: isoToDbDate(params.startDate) },
    },
    include: {
      project: true,
      employee: true,
      subcontractor: true,
      siteManager: true,
    },
    take: 20,
  });

  return (
    overlapping
      // Zweimal am Tag ist Alltag: vormittags die eine Baustelle, nachmittags
      // die andere. Gewarnt wird nur, wenn die Uhrzeiten sich wirklich ins
      // Gehege kommen – oder wenn bei einem der beiden keine steht.
      .filter((a) =>
        zeitenUeberschneidenSich(params.startTime, params.endTime, a.startTime, a.endTime),
      )
      .map((a) => ({
        assignmentId: a.id,
        resourceLabel:
          a.subcontractor?.companyName ??
          (a.employee
            ? fullName(a.employee)
            : a.siteManager
              ? fullName(a.siteManager)
              : 'Ressource'),
        date: dbDateToIso(a.startDate),
        projectLabel: `${a.project.customerName} – ${a.project.name}`,
      }))
  );
}

function conflictMessage(conflicts: ConflictInfo[]): string {
  const first = conflicts[0];
  const rest = conflicts.length - 1;
  return (
    `${first.resourceLabel} ist am ${formatDateShort(first.date)} bereits auf Baustelle ` +
    `${first.projectLabel} eingeplant${rest > 0 ? ` (und ${rest} weitere)` : ''}.`
  );
}

async function resolveResourceLabel(data: {
  employeeId?: string | null;
  siteManagerId?: string | null;
  subcontractorId?: string | null;
  placeholderLabel?: string | null;
}) {
  if (data.employeeId) {
    const e = await prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!e) throw new ApiError('Mitarbeiter nicht gefunden.', 404);
    return fullName(e);
  }
  if (data.siteManagerId) {
    const m = await prisma.siteManager.findUnique({ where: { id: data.siteManagerId } });
    if (!m) throw new ApiError('Bauleiter nicht gefunden.', 404);
    return fullName(m);
  }
  if (data.subcontractorId) {
    const s = await prisma.subcontractor.findUnique({ where: { id: data.subcontractorId } });
    if (!s) throw new ApiError('Subunternehmer nicht gefunden.', 404);
    return s.companyName;
  }
  return data.placeholderLabel ?? 'Unbesetzt';
}

export async function createAssignment(
  input: CreateAssignmentInput & { createdById?: string | null },
) {
  const startDate = input.startDate;
  const endDate = input.endDate ?? input.startDate;
  if (endDate < startDate) throw new ApiError('Das Ende liegt vor dem Beginn.', 422);

  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new ApiError('Projekt nicht gefunden.', 404);

  const conflicts = await findConflicts({
    projectId: input.projectId,
    employeeId: input.employeeId,
    siteManagerId: input.siteManagerId,
    subcontractorId: input.subcontractorId,
    startDate,
    endDate,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  const istSub = input.resourceType === 'SUBUNTERNEHMER';
  if (conflicts.length > 0 && !input.force) {
    // Ein SUB darf mehrere Teams haben – deshalb ist das kein harter Fehler,
    // sondern eine bestaetigungspflichtige Warnung (Master-Prompt 12).
    throw new ApiError(conflictMessage(conflicts), 409, {
      code: 'CONFLICT',
      conflicts,
      confirmable: true,
      confirmLabel: istSub ? 'Trotzdem einplanen' : 'Trotzdem einplanen',
    });
  }

  const label = await resolveResourceLabel(input);

  const created = await prisma.assignment.create({
    data: {
      projectId: input.projectId,
      resourceType: input.resourceType as never,
      employeeId: input.employeeId ?? null,
      siteManagerId: input.siteManagerId ?? null,
      subcontractorId: input.subcontractorId ?? null,
      placeholderLabel: input.placeholderLabel ?? null,
      startDate: isoToDbDate(startDate),
      endDate: isoToDbDate(endDate),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      note: input.note ?? null,
      kind: (input.kind ?? 'ARBEIT') as never,
      tasks: input.tasks ?? [],
      status: (input.status ?? 'GEPLANT') as never,
      // Wer hat das angelegt? Ohne diese Angabe laesst sich nicht sagen,
      // wessen Vorschlag da steht - und ein Bauleiter koennte fremde
      // Vorschlaege umbauen.
      createdById: input.createdById ?? null,
      source: (input.source ?? 'MANUELL') as never,
    },
  });

  await writeAudit({
    entityType: 'assignment',
    entityId: created.id,
    projectId: input.projectId,
    action: 'created',
    label:
      `${RESOURCE_TYPE_LABEL[input.resourceType]} eingeplant: ${label}` +
      (input.kind && input.kind !== 'ARBEIT'
        ? ` (${ASSIGNMENT_KIND_LABEL[input.kind as keyof typeof ASSIGNMENT_KIND_LABEL]})`
        : ''),
    newValue: {
      resource: label,
      startDate,
      endDate,
      art: input.kind ?? 'ARBEIT',
      taetigkeiten: input.tasks ?? [],
    },
    source: (input.source ?? 'MANUELL') as never,
    note: conflicts.length > 0 ? 'Trotz Terminüberschneidung eingeplant.' : null,
  });

  return { assignment: created, label, conflicts };
}

export async function updateAssignment(id: string, input: z.infer<typeof updateAssignmentSchema>) {
  const existing = await prisma.assignment.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!existing) throw new ApiError('Einsatz nicht gefunden.', 404);

  const oldStart = dbDateToIso(existing.startDate);
  const oldEnd = dbDateToIso(existing.endDate);
  const startDate = input.startDate ?? oldStart;
  const endDate =
    input.endDate ?? (input.startDate ? addSameLength(input.startDate, oldStart, oldEnd) : oldEnd);
  if (endDate < startDate) throw new ApiError('Das Ende liegt vor dem Beginn.', 422);

  const projectId = input.projectId ?? existing.projectId;
  const employeeId = input.employeeId !== undefined ? input.employeeId : existing.employeeId;
  const siteManagerId =
    input.siteManagerId !== undefined ? input.siteManagerId : existing.siteManagerId;
  const subcontractorId =
    input.subcontractorId !== undefined ? input.subcontractorId : existing.subcontractorId;

  const conflicts = await findConflicts({
    excludeAssignmentId: id,
    projectId,
    employeeId,
    siteManagerId,
    subcontractorId,
    startDate,
    endDate,
  });
  if (conflicts.length > 0 && !input.force) {
    throw new ApiError(conflictMessage(conflicts), 409, {
      code: 'CONFLICT',
      conflicts,
      confirmable: true,
      confirmLabel: 'Trotzdem einplanen',
    });
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: {
      projectId,
      resourceType: (input.resourceType ?? existing.resourceType) as never,
      employeeId,
      siteManagerId,
      subcontractorId,
      placeholderLabel:
        input.placeholderLabel !== undefined ? input.placeholderLabel : existing.placeholderLabel,
      startDate: isoToDbDate(startDate),
      endDate: isoToDbDate(endDate),
      startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
      endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
      note: input.note !== undefined ? input.note : existing.note,
      kind: (input.kind ?? existing.kind) as never,
      tasks: input.tasks ?? existing.tasks,
      status: (input.status ?? existing.status) as never,
    },
  });

  const label = await resolveResourceLabel({
    employeeId,
    siteManagerId,
    subcontractorId,
    placeholderLabel: updated.placeholderLabel,
  });

  const datesChanged = startDate !== oldStart || endDate !== oldEnd;
  const projectChanged = projectId !== existing.projectId;
  const statusChanged = !!input.status && input.status !== existing.status;

  if (datesChanged || projectChanged || statusChanged || input.note !== undefined) {
    await writeAudit({
      entityType: 'assignment',
      entityId: id,
      projectId,
      action: datesChanged ? 'moved' : 'updated',
      label: datesChanged
        ? `Termin geändert: ${label}`
        : projectChanged
          ? `Einsatz auf andere Baustelle verschoben: ${label}`
          : `Einsatz geändert: ${label}`,
      oldValue: {
        startDate: oldStart,
        endDate: oldEnd,
        projectId: existing.projectId,
        status: existing.status,
      },
      newValue: { startDate, endDate, projectId, status: updated.status },
      reason: (input.reason ?? null) as never,
      reasonText: input.reasonText ?? null,
      note: conflicts.length > 0 ? 'Trotz Terminüberschneidung gespeichert.' : null,
    });
  }

  return { assignment: updated, label, oldStart, oldEnd, startDate, endDate, conflicts };
}

/** Verschiebt einen Einsatz auf einen neuen Starttag, Dauer bleibt erhalten. */
export async function moveAssignment(id: string, input: z.infer<typeof moveAssignmentSchema>) {
  const existing = await prisma.assignment.findUnique({ where: { id } });
  if (!existing) throw new ApiError('Einsatz nicht gefunden.', 404);

  const oldStart = dbDateToIso(existing.startDate);
  const oldEnd = dbDateToIso(existing.endDate);
  const oldProjectId = existing.projectId;
  const newEnd = addSameLength(input.startDate, oldStart, oldEnd);

  const result = await updateAssignment(id, {
    startDate: input.startDate,
    endDate: newEnd,
    projectId: input.projectId,
    reason: input.reason,
    reasonText: input.reasonText,
    force: input.force,
  });

  return {
    ...result,
    oldProjectId,
    /** Fertiger Satz fuer den Undo-Toast. */
    message: buildMoveMessage(result.label, oldStart, input.startDate),
  };
}

export function buildMoveMessage(label: string, from: IsoDate, to: IsoDate) {
  if (from === to) return `${label} wurde aktualisiert.`;
  return (
    `${label} wurde von ${WEEKDAY_LONG[weekdayIndex(from)]} ${formatDay(from)} ` +
    `auf ${WEEKDAY_LONG[weekdayIndex(to)]} ${formatDay(to)} verschoben.`
  );
}

function formatDay(iso: IsoDate) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

function addSameLength(newStart: IsoDate, oldStart: IsoDate, oldEnd: IsoDate): IsoDate {
  const length = diffDays(oldStart, oldEnd);
  const d = new Date(`${newStart}T12:00:00`);
  d.setDate(d.getDate() + length);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export async function deleteAssignment(id: string) {
  const existing = await prisma.assignment.findUnique({
    where: { id },
    include: { employee: true, siteManager: true, subcontractor: true },
  });
  if (!existing) throw new ApiError('Einsatz nicht gefunden.', 404);

  const label =
    existing.subcontractor?.companyName ??
    (existing.employee
      ? fullName(existing.employee)
      : existing.siteManager
        ? fullName(existing.siteManager)
        : (existing.placeholderLabel ?? 'Unbesetzt'));

  await prisma.assignment.delete({ where: { id } });

  await writeAudit({
    entityType: 'assignment',
    entityId: id,
    projectId: existing.projectId,
    action: 'deleted',
    label: `Einsatz entfernt: ${label}`,
    oldValue: {
      resource: label,
      startDate: dbDateToIso(existing.startDate),
      endDate: dbDateToIso(existing.endDate),
    },
  });

  return { label, existing };
}

/** Minuten seit Mitternacht, oder null ohne Uhrzeit. */
function minuten(zeit: string | null | undefined): number | null {
  if (!zeit) return null;
  const treffer = /^(\d{1,2}):(\d{2})/.exec(zeit.trim());
  return treffer ? Number(treffer[1]) * 60 + Number(treffer[2]) : null;
}

/**
 * Ueberschneiden sich zwei Zeitfenster am selben Tag?
 *
 * Fehlt auch nur eine Grenze, gilt der Einsatz als ganztaegig. Das ist die
 * vorsichtige Auslegung: lieber einmal zu viel nachfragen als jemanden
 * doppelt verplanen, weil niemand eine Uhrzeit eingetragen hat.
 */
export function zeitenUeberschneidenSich(
  aStart: string | null | undefined,
  aEnde: string | null | undefined,
  bStart: string | null | undefined,
  bEnde: string | null | undefined,
): boolean {
  const aVon = minuten(aStart);
  const aBis = minuten(aEnde);
  const bVon = minuten(bStart);
  const bBis = minuten(bEnde);

  if (aVon === null || aBis === null || bVon === null || bBis === null) return true;
  return aVon < bBis && bVon < aBis;
}
