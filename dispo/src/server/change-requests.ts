/**
 * Änderungsvorschläge übernehmen oder ablehnen (Master-Prompt Abschnitt 21).
 *
 * Erst hier – nach einer ausdrücklichen Entscheidung des Disponenten – wird
 * ein Datensatz tatsächlich geändert. Die AI selbst ändert nie etwas.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { dbDateToIso, isoToDbDate } from '@/lib/dates';
import { CHANGE_REASON_KEYS } from '@/lib/labels';
import { ApiError } from './api';
import { writeAudit } from './audit';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const acceptSchema = z.object({
  /** Vom Disponenten ggf. korrigierte Werte. */
  plannedStart: isoDate.nullish(),
  plannedEnd: isoDate.nullish(),
  /** Einsätze um dieselbe Anzahl Tage mitverschieben. */
  moveAssignments: z.boolean().optional(),
  reason: z.enum(CHANGE_REASON_KEYS as [string, ...string[]]).optional(),
  reasonText: z.string().max(500).nullish(),
  note: z.string().max(1000).nullish(),
});

export async function acceptChangeRequest(id: string, input: z.infer<typeof acceptSchema>) {
  const cr = await prisma.changeRequest.findUnique({ where: { id }, include: { project: true } });
  if (!cr) throw new ApiError('Änderungsvorschlag nicht gefunden.', 404);
  if (cr.status !== 'OFFEN') throw new ApiError('Dieser Vorschlag wurde bereits entschieden.', 409);
  if (!cr.projectId || !cr.project) {
    throw new ApiError('Dem Vorschlag ist kein Projekt zugeordnet. Bitte zuerst zuordnen.', 422);
  }

  const proposed = (cr.proposedValue ?? {}) as { plannedStart?: string; plannedEnd?: string };
  const summary: string[] = [];

  if (cr.type === 'TERMIN_AENDERUNG') {
    const newStart = input.plannedStart ?? proposed.plannedStart ?? null;
    const newEnd = input.plannedEnd ?? proposed.plannedEnd ?? newStart;
    if (!newStart) throw new ApiError('Kein neues Startdatum angegeben.', 422);
    if (newEnd && newEnd < newStart) throw new ApiError('Das Ende liegt vor dem Beginn.', 422);

    const oldStart = cr.project.plannedStart ? dbDateToIso(cr.project.plannedStart) : null;
    const oldEnd = cr.project.plannedEnd ? dbDateToIso(cr.project.plannedEnd) : null;

    await prisma.project.update({
      where: { id: cr.projectId },
      data: {
        plannedStart: isoToDbDate(newStart),
        plannedEnd: newEnd ? isoToDbDate(newEnd) : null,
        // Nach einer Verschiebung muss der Kunde neu bestätigen.
        customerConfirmed: 'ANGEFRAGT',
      },
    });

    await writeAudit({
      entityType: 'project',
      entityId: cr.projectId,
      projectId: cr.projectId,
      action: 'updated',
      label: 'Termin geändert',
      oldValue: { plannedStart: oldStart, plannedEnd: oldEnd },
      newValue: { plannedStart: newStart, plannedEnd: newEnd },
      source: 'TELEFON_3CX',
      reason: (input.reason ?? cr.reason) as never,
      reasonText: input.reasonText ?? cr.reasonText,
      note: 'Aus Änderungsvorschlag übernommen.',
    });
    summary.push(`Projektzeitraum auf ${newStart}${newEnd && newEnd !== newStart ? ` – ${newEnd}` : ''} gesetzt`);

    // Einsätze um denselben Versatz mitverschieben.
    if (input.moveAssignments !== false && oldStart) {
      const shift = daysBetween(oldStart, newStart);
      if (shift !== 0) {
        const assignments = await prisma.assignment.findMany({
          where: { projectId: cr.projectId, status: { not: 'ABGESAGT' } },
        });
        for (const a of assignments) {
          await prisma.assignment.update({
            where: { id: a.id },
            data: {
              startDate: shiftDate(a.startDate, shift),
              endDate: shiftDate(a.endDate, shift),
            },
          });
        }
        if (assignments.length > 0) {
          await writeAudit({
            entityType: 'project',
            entityId: cr.projectId,
            projectId: cr.projectId,
            action: 'moved',
            label: `${assignments.length} Einsatz/Einsätze mitverschoben`,
            newValue: { verschiebungTage: shift },
            source: 'TELEFON_3CX',
            reason: (input.reason ?? cr.reason) as never,
          });
          summary.push(`${assignments.length} Einsatz/Einsätze um ${shift} Tag(e) verschoben`);
        }
      }
    }
  } else if (cr.type === 'KUNDENBESTAETIGUNG') {
    await prisma.project.update({
      where: { id: cr.projectId },
      data: { customerConfirmed: 'BESTAETIGT' },
    });
    await writeAudit({
      entityType: 'project',
      entityId: cr.projectId,
      projectId: cr.projectId,
      action: 'updated',
      label: 'Kundenbestätigung geändert',
      oldValue: { customerConfirmed: cr.project.customerConfirmed },
      newValue: { customerConfirmed: 'BESTAETIGT' },
      source: 'TELEFON_3CX',
    });
    summary.push('Kundenbestätigung auf „Bestätigt“ gesetzt');
  } else if (cr.type === 'MATERIAL_AENDERUNG') {
    await prisma.project.update({
      where: { id: cr.projectId },
      data: { materialStatus: 'OFFEN' },
    });
    await writeAudit({
      entityType: 'project',
      entityId: cr.projectId,
      projectId: cr.projectId,
      action: 'updated',
      label: 'Materialstatus geändert',
      oldValue: { materialStatus: cr.project.materialStatus },
      newValue: { materialStatus: 'OFFEN' },
      source: 'TELEFON_3CX',
    });
    summary.push('Materialstatus auf „Offen“ gesetzt');
  } else {
    // Für alle übrigen Typen bleibt der Vorschlag eine dokumentierte Notiz.
    await prisma.projectNote.create({
      data: {
        projectId: cr.projectId,
        body: `${cr.title}: ${cr.description ?? ''}`.trim(),
        source: 'TELEFON_3CX',
        pinned: true,
      },
    });
    summary.push('Als Projektnotiz übernommen');
  }

  const updated = await prisma.changeRequest.update({
    where: { id },
    data: { status: 'UEBERNOMMEN', decidedAt: new Date(), decisionNote: input.note ?? null },
  });

  // Das zugehörige Telefonat gilt damit als geprüft.
  if (cr.communicationId) {
    const stillOpen = await prisma.changeRequest.count({
      where: { communicationId: cr.communicationId, status: 'OFFEN' },
    });
    if (stillOpen === 0) {
      await prisma.communication.update({
        where: { id: cr.communicationId },
        data: { status: 'ERLEDIGT' },
      });
    }
  }

  return { changeRequest: updated, message: summary.join(' · ') || 'Vorschlag übernommen.' };
}

export async function rejectChangeRequest(id: string, note?: string | null) {
  const cr = await prisma.changeRequest.findUnique({ where: { id } });
  if (!cr) throw new ApiError('Änderungsvorschlag nicht gefunden.', 404);
  if (cr.status !== 'OFFEN') throw new ApiError('Dieser Vorschlag wurde bereits entschieden.', 409);

  const updated = await prisma.changeRequest.update({
    where: { id },
    data: { status: 'ABGELEHNT', decidedAt: new Date(), decisionNote: note ?? null },
  });

  await writeAudit({
    entityType: 'change_request',
    entityId: id,
    projectId: cr.projectId,
    action: 'rejected',
    label: `Änderungsvorschlag abgelehnt: ${cr.title}`,
    oldValue: cr.proposedValue as never,
    note: note ?? null,
    source: 'TELEFON_3CX',
  });

  if (cr.communicationId) {
    const stillOpen = await prisma.changeRequest.count({
      where: { communicationId: cr.communicationId, status: 'OFFEN' },
    });
    if (stillOpen === 0) {
      await prisma.communication.update({
        where: { id: cr.communicationId },
        data: { status: 'ERLEDIGT' },
      });
    }
  }

  return { changeRequest: updated, message: 'Vorschlag abgelehnt. Nichts wurde geändert.' };
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

function shiftDate(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
