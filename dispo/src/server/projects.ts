/** Projekt-Mutationen inklusive Historie. */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { dbDateToIso, isoToDbDate } from '@/lib/dates';
import {
  CHANGE_REASON_KEYS,
  CONFIRMATION_KEYS,
  MATERIAL_STATUS_KEYS,
  PRIORITY_KEYS,
  PROJECT_STATUS_KEYS,
  TRAFFIC_LIGHT_KEYS,
} from '@/lib/labels';
import { ApiError } from './api';
import { diffFields, PROJECT_FIELD_LABEL, writeAudit } from './audit';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableIso = isoDate.nullish();

export const projectInputSchema = z.object({
  erpId: z.string().max(64).nullish(),
  orderNumber: z.string().max(64).nullish(),
  projectNumber: z.string().max(64).nullish(),
  customerName: z.string().min(1, 'Kundenname ist ein Pflichtfeld.').max(200),
  name: z.string().min(1, 'Projektname ist ein Pflichtfeld.').max(200),
  street: z.string().max(200).nullish(),
  zip: z.string().max(16).nullish(),
  city: z.string().max(120).nullish(),
  contactName: z.string().max(120).nullish(),
  contactPhone: z.string().max(60).nullish(),
  contactEmail: z.string().max(160).nullish(),
  primarySiteManagerId: z.string().nullish(),
  secondarySiteManagerId: z.string().nullish(),
  plannedStart: nullableIso,
  plannedEnd: nullableIso,
  status: z.enum(PROJECT_STATUS_KEYS as [string, ...string[]]).optional(),
  priority: z.enum(PRIORITY_KEYS as [string, ...string[]]).optional(),
  materialStatus: z.enum(MATERIAL_STATUS_KEYS as [string, ...string[]]).optional(),
  customerConfirmed: z.enum(CONFIRMATION_KEYS as [string, ...string[]]).optional(),
  trafficLightOverride: z.enum(TRAFFIC_LIGHT_KEYS as [string, ...string[]]).nullish(),
  internalNotes: z.string().max(5000).nullish(),
  specialNotes: z.string().max(5000).nullish(),
});

export const projectUpdateSchema = projectInputSchema.partial().extend({
  reason: z.enum(CHANGE_REASON_KEYS as [string, ...string[]]).nullish(),
  reasonText: z.string().max(500).nullish(),
});

const AUDITED_FIELDS = Object.keys(PROJECT_FIELD_LABEL);

export async function createProject(input: z.infer<typeof projectInputSchema>) {
  if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) {
    throw new ApiError('Das geplante Ende liegt vor dem geplanten Beginn.', 422);
  }

  const project = await prisma.project.create({
    data: {
      ...scalarData(input),
      customerName: input.customerName,
      name: input.name,
      plannedStart: input.plannedStart ? isoToDbDate(input.plannedStart) : null,
      plannedEnd: input.plannedEnd ? isoToDbDate(input.plannedEnd) : null,
    } as Prisma.ProjectCreateInput,
  });

  await writeAudit({
    entityType: 'project',
    entityId: project.id,
    projectId: project.id,
    action: 'created',
    label: 'Projekt angelegt',
    newValue: { customerName: project.customerName, name: project.name },
  });

  return project;
}

export async function updateProject(id: string, input: z.infer<typeof projectUpdateSchema>) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new ApiError('Projekt nicht gefunden.', 404);

  const nextStart =
    input.plannedStart !== undefined
      ? input.plannedStart
      : existing.plannedStart
        ? dbDateToIso(existing.plannedStart)
        : null;
  const nextEnd =
    input.plannedEnd !== undefined
      ? input.plannedEnd
      : existing.plannedEnd
        ? dbDateToIso(existing.plannedEnd)
        : null;
  if (nextStart && nextEnd && nextEnd < nextStart) {
    throw new ApiError('Das geplante Ende liegt vor dem geplanten Beginn.', 422);
  }

  // Fuer den Vergleich Datumswerte auf ISO-Strings normalisieren.
  const before = {
    ...existing,
    plannedStart: existing.plannedStart ? dbDateToIso(existing.plannedStart) : null,
    plannedEnd: existing.plannedEnd ? dbDateToIso(existing.plannedEnd) : null,
  } as unknown as Record<string, unknown>;

  const after = { ...input } as Record<string, unknown>;
  delete after.reason;
  delete after.reasonText;

  const { old: oldValues, next: newValues, changed } = diffFields(before, after, AUDITED_FIELDS);

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(scalarData(input) as Prisma.ProjectUpdateInput),
      ...(input.plannedStart !== undefined
        ? { plannedStart: input.plannedStart ? isoToDbDate(input.plannedStart) : null }
        : {}),
      ...(input.plannedEnd !== undefined
        ? { plannedEnd: input.plannedEnd ? isoToDbDate(input.plannedEnd) : null }
        : {}),
    },
  });

  if (changed.length > 0) {
    // Ein Audit-Eintrag pro fachlicher Aenderung – so liest sich die
    // Projekt-Timeline spaeter wie ein Protokoll, nicht wie ein Diff.
    const groups = new Map<string, string[]>();
    for (const field of changed) {
      const label = PROJECT_FIELD_LABEL[field as string] ?? 'Projekt geändert';
      groups.set(label, [...(groups.get(label) ?? []), field as string]);
    }
    for (const [label, fields] of groups) {
      await writeAudit({
        entityType: 'project',
        entityId: id,
        projectId: id,
        action: 'updated',
        label,
        oldValue: pick(oldValues, fields),
        newValue: pick(newValues, fields),
        reason: (input.reason ?? null) as never,
        reasonText: input.reasonText ?? null,
      });
    }
  }

  return { project: updated, changed };
}

export async function deleteProject(id: string) {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) throw new ApiError('Projekt nicht gefunden.', 404);

  await writeAudit({
    entityType: 'project',
    entityId: id,
    projectId: null,
    action: 'deleted',
    label: 'Projekt gelöscht',
    oldValue: { customerName: existing.customerName, name: existing.name },
  });
  await prisma.project.delete({ where: { id } });
  return existing;
}

function scalarData(input: Partial<z.infer<typeof projectInputSchema>>) {
  const data: Record<string, unknown> = {};
  const fields = [
    'erpId', 'orderNumber', 'projectNumber', 'customerName', 'name', 'street', 'zip', 'city',
    'contactName', 'contactPhone', 'contactEmail', 'primarySiteManagerId',
    'secondarySiteManagerId', 'status', 'priority', 'materialStatus', 'customerConfirmed',
    'trafficLightOverride', 'internalNotes', 'specialNotes',
  ] as const;
  for (const f of fields) {
    if (input[f] !== undefined) data[f] = input[f] === '' ? null : input[f];
  }
  return data;
}

function pick(obj: Record<string, unknown>, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = obj[f] ?? null;
  return out;
}
