/**
 * AI-Änderungserkennung (Master-Prompt Abschnitt 21).
 *
 * WICHTIG: Es wird NIE ein Datensatz geändert. Erkannt wird ausschliesslich
 * ein Vorschlag (`ChangeRequest`), den der Disponent übernehmen, bearbeiten
 * oder ablehnen kann.
 *
 * Zwei Betriebsarten:
 *   1. Ohne API-Key: regelbasierte Heuristik (Wochentage, Schlüsselwörter).
 *      Läuft offline, deterministisch und ist für die typischen Sätze
 *      ("Donnerstag wäre uns lieber") völlig ausreichend.
 *   2. Mit ANTHROPIC_API_KEY: zusätzlich eine Claude-Analyse für Fälle,
 *      die die Heuristik nicht sicher erkennt.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  addDays,
  dbDateToIso,
  diffDays,
  type IsoDate,
  todayIso,
  WEEKDAY_LONG,
  weekdayIndex,
} from '@/lib/dates';
import type { ChangeReasonKey } from '@/lib/labels';

export interface DetectedChange {
  type:
    | 'TERMIN_AENDERUNG'
    | 'STATUS_AENDERUNG'
    | 'MATERIAL_AENDERUNG'
    | 'KUNDENBESTAETIGUNG'
    | 'RUECKRUF'
    | 'NOTIZ'
    | 'SONSTIGES';
  title: string;
  description: string;
  reason: ChangeReasonKey;
  reasonText: string | null;
  confidence: number;
  /** Zielwochentag bei einer erkannten Terminverschiebung (0 = Sonntag). */
  targetWeekday?: number;
}

/**
 * Analysiert ein Telefonat und legt passende Änderungsvorschläge an.
 * Gibt die IDs der erzeugten Vorschläge zurück.
 */
export async function detectChanges(communicationId: string): Promise<string[]> {
  const communication = await prisma.communication.findUnique({
    where: { id: communicationId },
    include: { project: true },
  });
  if (!communication) return [];

  const text = [communication.summary, communication.aiNotes, communication.transcript]
    .filter(Boolean)
    .join('\n');
  if (!text.trim()) return [];

  let detected = detectWithRules(text);

  // Optionale Zweitmeinung durch Claude – Fehler dürfen den Eingang nie
  // blockieren, deshalb wird still auf die Heuristik zurückgefallen.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const fromModel = await detectWithClaude(text);
      if (fromModel.length > 0) detected = mergeDetections(detected, fromModel);
    } catch (e) {
      console.warn('[change-detection] Claude-Analyse fehlgeschlagen:', e);
    }
  }

  if (detected.length === 0) return [];

  const created: string[] = [];
  for (const change of detected) {
    const { currentValue, proposedValue } = buildValues(change, communication.project);

    const row = await prisma.changeRequest.create({
      data: {
        type: change.type as never,
        communicationId: communication.id,
        projectId: communication.projectId,
        title: change.title,
        description: change.description,
        currentValue: currentValue as never,
        proposedValue: proposedValue as never,
        reason: change.reason as never,
        reasonText: change.reasonText,
        confidence: change.confidence,
        status: 'OFFEN',
        source: 'TELEFON_3CX',
      },
    });
    created.push(row.id);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Regelbasierte Erkennung
// ---------------------------------------------------------------------------

const WEEKDAY_PATTERNS: { day: number; words: string[] }[] = [
  { day: 1, words: ['montag'] },
  { day: 2, words: ['dienstag'] },
  { day: 3, words: ['mittwoch'] },
  { day: 4, words: ['donnerstag'] },
  { day: 5, words: ['freitag'] },
  { day: 6, words: ['samstag', 'sonnabend'] },
  { day: 0, words: ['sonntag'] },
];

/** Formulierungen, die auf einen Wunschtermin hindeuten. */
const WISH_PATTERNS = [
  'wäre uns lieber',
  'waere uns lieber',
  'wäre mir lieber',
  'wäre besser',
  'passt besser',
  'lieber am',
  'verschieben auf',
  'verschoben auf',
  'stattdessen am',
  'ginge auch',
  'geht auch',
  'soll(en)? .*stattfinden',
];

const CANCEL_PATTERNS = [
  'kann nicht',
  'passt nicht',
  'geht nicht',
  'nicht möglich',
  'nicht moeglich',
  'absagen',
  'abgesagt',
  'verschieben',
  'verschoben',
];

export function detectWithRules(rawText: string): DetectedChange[] {
  const text = rawText.toLowerCase();
  const out: DetectedChange[] = [];

  const mentionedDays = WEEKDAY_PATTERNS.filter((w) => w.words.some((word) => text.includes(word)));
  const hasCancel = CANCEL_PATTERNS.some((p) => new RegExp(p).test(text));
  const hasWish = WISH_PATTERNS.some((p) => new RegExp(p).test(text));

  // --- Terminänderung ---
  if ((hasCancel || hasWish) && mentionedDays.length > 0) {
    // Der Wunschtermin ist der Tag, der in der Nähe einer Wunschformulierung
    // steht – ersatzweise der zuletzt genannte Tag.
    const target = pickTargetDay(text, mentionedDays) ?? mentionedDays[mentionedDays.length - 1];
    out.push({
      type: 'TERMIN_AENDERUNG',
      title: 'Mögliche Terminänderung erkannt',
      description: `Im Gespräch wurde ein anderer Wunschtermin genannt: „${WEEKDAY_LONG[target.day]}“.`,
      reason: 'KUNDE',
      reasonText: 'Kundenwunsch aus Telefonat.',
      confidence: hasCancel && hasWish ? 0.85 : 0.65,
      targetWeekday: target.day,
    });
  } else if (hasCancel && mentionedDays.length === 0) {
    out.push({
      type: 'TERMIN_AENDERUNG',
      title: 'Mögliche Terminabsage erkannt',
      description:
        'Im Gespräch wurde eine Absage oder Verschiebung angedeutet, aber kein neuer Termin genannt.',
      reason: 'KUNDE',
      reasonText: 'Absage/Verschiebung aus Telefonat.',
      confidence: 0.5,
    });
  }

  // --- Material ---
  if (
    /material|liefer|lieferung|lieferant|ware/.test(text) &&
    /fehlt|verspätet|verspaetet|nicht da|kommt später|kommt spaeter|problem/.test(text)
  ) {
    out.push({
      type: 'MATERIAL_AENDERUNG',
      title: 'Materialproblem erkannt',
      description: 'Im Gespräch wurde ein Material- oder Lieferproblem angesprochen.',
      reason: 'MATERIAL',
      reasonText: 'Hinweis aus Telefonat.',
      confidence: 0.6,
    });
  }

  // --- Rückruf ---
  if (/rückruf|rueckruf|zurückrufen|zurueckrufen|meldet sich|melden sie sich/.test(text)) {
    out.push({
      type: 'RUECKRUF',
      title: 'Rückruf zugesagt oder erbeten',
      description: 'Im Gespräch wurde ein Rückruf vereinbart.',
      reason: 'SONSTIGES',
      reasonText: null,
      confidence: 0.7,
    });
  }

  // --- Kundenbestätigung ---
  if (/bestätigt|bestaetigt|passt so|einverstanden|in ordnung so/.test(text) && !hasCancel) {
    out.push({
      type: 'KUNDENBESTAETIGUNG',
      title: 'Kundenbestätigung erkannt',
      description: 'Der Kunde scheint den Termin bestätigt zu haben.',
      reason: 'KUNDE',
      reasonText: null,
      confidence: 0.6,
    });
  }

  // --- Zusatzleistung / Reklamation ---
  if (/reklamation|mangel|mängel|maengel|beanstand/.test(text)) {
    out.push({
      type: 'SONSTIGES',
      title: 'Reklamation erkannt',
      description: 'Im Gespräch wurde eine Reklamation oder ein Mangel erwähnt.',
      reason: 'SONSTIGES',
      reasonText: null,
      confidence: 0.65,
    });
  }
  if (/zusätzlich|zusaetzlich|mehrarbeit|nachtrag|zusatzleistung|noch machen/.test(text)) {
    out.push({
      type: 'SONSTIGES',
      title: 'Mögliche Zusatzleistung erkannt',
      description: 'Im Gespräch wurde eine zusätzliche Leistung angesprochen.',
      reason: 'SONSTIGES',
      reasonText: null,
      confidence: 0.55,
    });
  }

  return out;
}

/** Wählt den Wochentag, der einer Wunschformulierung am nächsten steht. */
function pickTargetDay(
  text: string,
  days: { day: number; words: string[] }[],
): { day: number; words: string[] } | null {
  let best: { day: number; words: string[] } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const pattern of WISH_PATTERNS) {
    const match = new RegExp(pattern).exec(text);
    if (!match) continue;
    for (const day of days) {
      for (const word of day.words) {
        const idx = text.indexOf(word);
        if (idx === -1) continue;
        const distance = Math.abs(idx - match.index);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = day;
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Optionale Claude-Analyse
// ---------------------------------------------------------------------------

const CHANGE_TYPES = [
  'TERMIN_AENDERUNG',
  'STATUS_AENDERUNG',
  'MATERIAL_AENDERUNG',
  'KUNDENBESTAETIGUNG',
  'RUECKRUF',
  'NOTIZ',
  'SONSTIGES',
] as const;

const REASONS = [
  'KUNDE',
  'MR_UMBAU',
  'BAULEITER',
  'MITARBEITER',
  'SUBUNTERNEHMER',
  'MATERIAL',
  'LIEFERANT',
  'KRANKHEIT',
  'URLAUB',
  'BAUSTELLENVORLEISTUNG',
  'TECHNISCHE_URSACHE',
  'WETTER',
  'SONSTIGES',
] as const;

/**
 * Struktur der Modellantwort als JSON-Schema.
 * (Bewusst kein `zodOutputFormat`: dieser Helfer setzt Zod 4 voraus, die
 * App validiert ihre APIs aber mit Zod 3. Das Ergebnis wird unten ohnehin
 * mit der App-eigenen Validierung geprüft.)
 */
const CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...CHANGE_TYPES] },
          title: { type: 'string' },
          description: { type: 'string' },
          reason: { type: 'string', enum: [...REASONS] },
          reasonText: { type: 'string' },
          confidence: { type: 'number' },
          /** 0 = Sonntag … 6 = Samstag; -1 wenn kein Wochentag genannt wurde. */
          targetWeekday: { type: 'integer' },
        },
        required: [
          'type',
          'title',
          'description',
          'reason',
          'reasonText',
          'confidence',
          'targetWeekday',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['changes'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  'Du analysierst Telefonate eines Bauunternehmens (Disposition). ' +
  'Erkenne ausschließlich, ob das Gespräch eine Terminänderung, einen Terminwunsch, ' +
  'eine Absage, ein Materialproblem, eine Reklamation, eine Zusatzleistung, eine ' +
  'Rückrufbitte oder eine Kundenbestätigung enthält. ' +
  'Du änderst nichts – du erzeugst nur Vorschläge, über die ein Mensch entscheidet. ' +
  'Gib nur sichere Erkenntnisse aus; wenn nichts erkennbar ist, gib eine leere Liste zurück. ' +
  'Antworte auf Deutsch. targetWeekday ist -1, wenn kein Wochentag genannt wurde.';

async function detectWithClaude(text: string): Promise<DetectedChange[]> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: process.env.DISPO_AI_MODEL || 'claude-opus-5',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Gesprächsinhalt:\n\n${text}` }],
    output_config: { format: { type: 'json_schema', schema: CHANGE_SCHEMA as never } },
  });

  if (response.stop_reason === 'refusal') return [];

  const raw = response.content.find((b) => b.type === 'text');
  if (!raw || raw.type !== 'text') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    return [];
  }

  const result = claudeResponseSchema.safeParse(parsed);
  if (!result.success) return [];

  return result.data.changes.map((c) => ({
    type: c.type,
    title: c.title,
    description: c.description,
    reason: c.reason as ChangeReasonKey,
    reasonText: c.reasonText || null,
    confidence: Math.max(0, Math.min(1, c.confidence)),
    targetWeekday: c.targetWeekday >= 0 && c.targetWeekday <= 6 ? c.targetWeekday : undefined,
  }));
}

const claudeResponseSchema = z.object({
  changes: z.array(
    z.object({
      type: z.enum(CHANGE_TYPES),
      title: z.string().min(1).max(200),
      description: z.string().max(2000),
      reason: z.enum(REASONS),
      reasonText: z.string().max(500),
      confidence: z.number(),
      targetWeekday: z.number().int(),
    }),
  ),
});

/** Claude-Treffer gewinnen pro Typ, Heuristik-Treffer bleiben als Ergänzung. */
function mergeDetections(rules: DetectedChange[], model: DetectedChange[]): DetectedChange[] {
  const byType = new Map<string, DetectedChange>();
  for (const r of rules) byType.set(r.type, r);
  for (const m of model) byType.set(m.type, m);
  return [...byType.values()];
}

// ---------------------------------------------------------------------------
// Vorher/Nachher-Werte für den Vorschlag
// ---------------------------------------------------------------------------

function buildValues(
  change: DetectedChange,
  project: { plannedStart: Date | null; plannedEnd: Date | null } | null,
) {
  if (change.type !== 'TERMIN_AENDERUNG' || change.targetWeekday === undefined) {
    return { currentValue: null, proposedValue: null };
  }

  const currentStart = project?.plannedStart ? dbDateToIso(project.plannedStart) : null;
  const currentEnd = project?.plannedEnd ? dbDateToIso(project.plannedEnd) : null;

  const newStart = nextWeekdayFrom(currentStart ?? todayIso(), change.targetWeekday);
  const length = currentStart && currentEnd ? diffDays(currentStart, currentEnd) : 0;

  return {
    currentValue: { plannedStart: currentStart, plannedEnd: currentEnd },
    proposedValue: { plannedStart: newStart, plannedEnd: addDays(newStart, length) },
  };
}

/**
 * Nächstes Vorkommen eines Wochentags ab `from` (einschliesslich `from`+1).
 * Beispiel: aktueller Termin Dienstag, Wunsch "Donnerstag" → derselben Woche.
 */
export function nextWeekdayFrom(from: IsoDate, weekday: number): IsoDate {
  const current = weekdayIndex(from);
  let delta = weekday - current;
  // Sonntag (0) als "später in der Woche" behandeln.
  if (weekday === 0) delta = 7 - current;
  if (delta <= 0) delta += 7;
  return addDays(from, delta);
}
