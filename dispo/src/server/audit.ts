/**
 * Audit-Log (Master-Prompt Abschnitt 14 + 29).
 *
 * Grundsatz: Nichts Wichtiges wird stillschweigend ueberschrieben.
 * Jede relevante Aenderung bekommt hier einen Eintrag – auch bei nur einem
 * Benutzer, damit spaeter nachvollziehbar ist, warum ein Termin dreimal
 * verschoben wurde.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { ChangeReasonKey, SourceKey } from '@/lib/labels';

export interface AuditInput {
  entityType:
    | 'project'
    | 'assignment'
    | 'employee'
    | 'site_manager'
    | 'subcontractor'
    | 'communication'
    | 'change_request'
    | 'integration';
  entityId: string;
  projectId?: string | null;
  action: string;
  label: string;
  oldValue?: unknown;
  newValue?: unknown;
  source?: SourceKey;
  reason?: ChangeReasonKey | null;
  reasonText?: string | null;
  note?: string | null;
}

type Tx = Prisma.TransactionClient | typeof prisma;

export async function writeAudit(input: AuditInput, tx: Tx = prisma) {
  return tx.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId ?? null,
      action: input.action,
      label: input.label,
      oldValue: (input.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (input.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      source: (input.source ?? 'MANUELL') as never,
      reason: (input.reason ?? null) as never,
      reasonText: input.reasonText ?? null,
      note: input.note ?? null,
    },
  });
}

/**
 * Vergleicht zwei Objekte und liefert nur die tatsaechlich geaenderten Felder.
 * Verhindert Audit-Rauschen bei Speichern-ohne-Aenderung.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): { old: Partial<T>; next: Partial<T>; changed: (keyof T)[] } {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  const changed: (keyof T)[] = [];

  for (const field of fields) {
    if (!(field in after)) continue;
    const a = normalize(before[field]);
    const b = normalize(after[field]);
    if (a === b) continue;
    oldValues[field] = before[field];
    newValues[field] = after[field] as T[keyof T];
    changed.push(field);
  }
  return { old: oldValues, next: newValues, changed };
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === undefined) return null;
  return value;
}

/** Menschenlesbares Label fuer eine Feldaenderung an einem Projekt. */
export const PROJECT_FIELD_LABEL: Record<string, string> = {
  customerName: 'Kunde geändert',
  name: 'Projektname geändert',
  orderNumber: 'Auftragsnummer geändert',
  projectNumber: 'Projektnummer geändert',
  street: 'Adresse geändert',
  zip: 'PLZ geändert',
  city: 'Ort geändert',
  contactName: 'Ansprechpartner geändert',
  contactPhone: 'Telefonnummer geändert',
  contactEmail: 'E-Mail geändert',
  primarySiteManagerId: 'Bauleiter geändert',
  secondarySiteManagerId: 'Zweiter Bauleiter geändert',
  plannedStart: 'Projektzeitraum geändert',
  plannedEnd: 'Projektzeitraum geändert',
  status: 'Status geändert',
  priority: 'Priorität geändert',
  materialStatus: 'Materialstatus geändert',
  customerConfirmed: 'Kundenbestätigung geändert',
  trafficLightOverride: 'Ampel manuell übersteuert',
  internalNotes: 'Interne Notiz geändert',
  specialNotes: 'Besondere Hinweise geändert',
};
