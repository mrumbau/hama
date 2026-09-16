/**
 * 3CX-Ereigniseingang (Master-Prompt Abschnitte 18–21).
 *
 * Ablauf:
 *   1. Rohereignis wird IMMER zuerst gespeichert (nichts geht verloren).
 *   2. Telefonnummer → Kunde → Projekt zuordnen (Abschnitt 19).
 *   3. Zusammenfassung/Transkript an die Änderungserkennung geben.
 *   4. AI erzeugt ausschliesslich Vorschlaege – nie eine echte Aenderung.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { phoneTail } from '@/lib/utils';
import { writeAudit } from '@/server/audit';
import { detectChanges } from './change-detection';

export const threeCxEventSchema = z.object({
  /** Eindeutige Call-ID aus 3CX – verhindert Doppelverarbeitung. */
  callId: z.string().max(120).optional(),
  /** ISO-Zeitstempel. Fehlt er, gilt "jetzt". */
  occurredAt: z.string().optional(),
  direction: z.enum(['EINGEHEND', 'AUSGEHEND', 'UNBEKANNT']).optional(),
  callerNumber: z.string().max(60).optional(),
  calledNumber: z.string().max(60).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  /** Interner Mitarbeiter / Bauleiter am Apparat. */
  agentName: z.string().max(120).optional(),
  customerName: z.string().max(200).optional(),
  transcript: z.string().max(100_000).optional(),
  summary: z.string().max(10_000).optional(),
  aiNotes: z.string().max(10_000).optional(),
  actionItems: z.array(z.string().max(500)).optional(),
  /**
   * Nur als Referenz speichern – keine Sprachaufnahme in dieser Datenbank
   * (Master-Prompt Abschnitt 32).
   */
  recordingUrl: z.string().url().max(2000).optional(),
  /** Optional: bereits bekannte Projekt-/Auftragsnummer. */
  orderNumber: z.string().max(64).optional(),
  isDemo: z.boolean().optional(),
});

export type ThreeCxEvent = z.infer<typeof threeCxEventSchema>;

export interface IntakeResult {
  communicationId: string;
  duplicate: boolean;
  projectId: string | null;
  candidateProjectIds: string[];
  matchNote: string;
  changeRequestIds: string[];
}

export async function ingestThreeCxEvent(event: ThreeCxEvent): Promise<IntakeResult> {
  // --- 1. Rohereignis sichern -------------------------------------------
  const integrationEvent = await prisma.integrationEvent.create({
    data: { provider: '3cx', type: 'call', payload: event as never },
  });

  try {
    // Doppelte Zustellung desselben Anrufs ignorieren.
    if (event.callId) {
      const existing = await prisma.communication.findUnique({ where: { callId: event.callId } });
      if (existing) {
        await prisma.integrationEvent.update({
          where: { id: integrationEvent.id },
          data: {
            status: 'IGNORIERT',
            processedAt: new Date(),
            communicationId: existing.id,
            error: 'Call-ID bereits verarbeitet.',
          },
        });
        return {
          communicationId: existing.id,
          duplicate: true,
          projectId: existing.projectId,
          candidateProjectIds: existing.candidateProjectIds,
          matchNote: 'Dieses Telefonat war bereits erfasst.',
          changeRequestIds: [],
        };
      }
    }

    // --- 2. Zuordnung --------------------------------------------------
    const contactNumber =
      event.direction === 'AUSGEHEND' ? event.calledNumber : (event.callerNumber ?? event.calledNumber);
    const match = await matchProject({
      phone: contactNumber,
      customerName: event.customerName,
      orderNumber: event.orderNumber,
    });

    const communication = await prisma.communication.create({
      data: {
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
        direction: (event.direction ?? 'EINGEHEND') as never,
        callerNumber: event.callerNumber ?? null,
        calledNumber: event.calledNumber ?? null,
        contactNumber: contactNumber ?? null,
        durationSeconds: event.durationSeconds ?? null,
        callId: event.callId ?? null,
        agentName: event.agentName ?? null,
        customerName: event.customerName ?? match.customerName ?? null,
        projectId: match.projectId,
        candidateProjectIds: match.candidateProjectIds,
        transcript: event.transcript ?? null,
        summary: event.summary ?? null,
        aiNotes: event.aiNotes ?? null,
        actionItems: event.actionItems ?? [],
        recordingUrl: event.recordingUrl ?? null,
        status: 'NEU',
        source: 'TELEFON_3CX',
        isDemo: event.isDemo ?? false,
      },
    });

    // --- 3./4. Änderungserkennung → Vorschläge --------------------------
    const changeRequestIds = await detectChanges(communication.id);

    await prisma.integrationEvent.update({
      where: { id: integrationEvent.id },
      data: { status: 'VERARBEITET', processedAt: new Date(), communicationId: communication.id },
    });

    await writeAudit({
      entityType: 'communication',
      entityId: communication.id,
      projectId: match.projectId,
      action: 'created',
      label: 'Telefonat aus 3CX empfangen',
      newValue: {
        von: contactNumber,
        dauer: event.durationSeconds,
        zusammenfassung: event.summary,
      },
      source: 'TELEFON_3CX',
      note: match.note,
    });

    return {
      communicationId: communication.id,
      duplicate: false,
      projectId: match.projectId,
      candidateProjectIds: match.candidateProjectIds,
      matchNote: match.note,
      changeRequestIds,
    };
  } catch (e) {
    await prisma.integrationEvent.update({
      where: { id: integrationEvent.id },
      data: {
        status: 'FEHLER',
        error: e instanceof Error ? e.message : 'Unbekannter Fehler.',
        processedAt: new Date(),
      },
    });
    throw e;
  }
}

interface MatchResult {
  projectId: string | null;
  candidateProjectIds: string[];
  customerName: string | null;
  note: string;
}

/**
 * Zuordnung laut Abschnitt 19:
 *   Auftragsnummer → Telefonnummer → Ansprechpartner → Kundenname.
 * Bei genau einem laufenden Projekt wird dieses vorgeschlagen, bei mehreren
 * entscheidet das System NICHT selbst.
 */
export async function matchProject(input: {
  phone?: string | null;
  customerName?: string | null;
  orderNumber?: string | null;
}): Promise<MatchResult> {
  // Direkter Treffer über die Auftragsnummer.
  if (input.orderNumber) {
    const byOrder = await prisma.project.findFirst({
      where: { orderNumber: { equals: input.orderNumber, mode: 'insensitive' } },
    });
    if (byOrder) {
      return {
        projectId: byOrder.id,
        candidateProjectIds: [],
        customerName: byOrder.customerName,
        note: `Über die Auftragsnummer ${input.orderNumber} eindeutig zugeordnet.`,
      };
    }
  }

  const tail = phoneTail(input.phone);
  const OFFEN = {
    status: { notIn: ['FERTIG', 'ERLEDIGT'] as never },
  };

  // Telefonnummer des Ansprechpartners.
  let candidates = tail
    ? await prisma.project.findMany({ where: { contactPhone: { contains: tail }, ...OFFEN } })
    : [];
  let via = 'die Telefonnummer';

  // Kundenname.
  if (candidates.length === 0 && input.customerName?.trim()) {
    candidates = await prisma.project.findMany({
      where: { customerName: { contains: input.customerName.trim(), mode: 'insensitive' }, ...OFFEN },
    });
    via = 'den Kundennamen';
  }

  // Ansprechpartner-Name.
  if (candidates.length === 0 && input.customerName?.trim()) {
    candidates = await prisma.project.findMany({
      where: { contactName: { contains: input.customerName.trim(), mode: 'insensitive' }, ...OFFEN },
    });
    via = 'den Ansprechpartner';
  }

  if (candidates.length === 0) {
    return {
      projectId: null,
      candidateProjectIds: [],
      customerName: input.customerName ?? null,
      note: 'Keine Zuordnung möglich – bitte Projekt manuell auswählen.',
    };
  }

  if (candidates.length === 1) {
    return {
      projectId: candidates[0].id,
      candidateProjectIds: [],
      customerName: candidates[0].customerName,
      note: `Über ${via} eindeutig dem Projekt ${candidates[0].orderNumber ?? candidates[0].name} zugeordnet.`,
    };
  }

  // Mehrere laufende Projekte: NICHT automatisch entscheiden.
  return {
    projectId: null,
    candidateProjectIds: candidates.map((c) => c.id),
    customerName: candidates[0].customerName,
    note:
      `Telefonat konnte Kunde ${candidates[0].customerName} zugeordnet werden. ` +
      `Es gibt ${candidates.length} laufende Projekte – bitte Projekt auswählen.`,
  };
}
