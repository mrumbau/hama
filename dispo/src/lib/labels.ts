/**
 * Deutsche Beschriftungen fuer alle Enums. Eine Quelle der Wahrheit –
 * Frontend und API benutzen dieselben Texte.
 */

export const PROJECT_STATUS_LABEL = {
  NEU: 'Neu',
  TERMINIERUNG_ERFORDERLICH: 'Terminierung erforderlich',
  GEPLANT: 'Geplant',
  BESTAETIGT: 'Bestätigt',
  IN_AUSFUEHRUNG: 'In Ausführung',
  UNTERBROCHEN: 'Unterbrochen',
  WARTEN_AUF_KUNDE: 'Warten auf Kunde',
  WARTEN_AUF_MATERIAL: 'Warten auf Material',
  WARTEN_AUF_SUB: 'Warten auf SUB',
  FERTIG: 'Fertig',
  ABNAHME: 'Abnahme',
  ERLEDIGT: 'Erledigt',
} as const;
export type ProjectStatusKey = keyof typeof PROJECT_STATUS_LABEL;
export const PROJECT_STATUS_KEYS = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatusKey[];

/** Status, bei denen das Projekt operativ abgeschlossen ist. */
export const CLOSED_PROJECT_STATUS: ProjectStatusKey[] = ['FERTIG', 'ERLEDIGT'];

export const PRIORITY_LABEL = {
  NIEDRIG: 'Niedrig',
  NORMAL: 'Normal',
  HOCH: 'Hoch',
  KRITISCH: 'Kritisch',
} as const;
export type PriorityKey = keyof typeof PRIORITY_LABEL;
export const PRIORITY_KEYS = Object.keys(PRIORITY_LABEL) as PriorityKey[];

export const MATERIAL_STATUS_LABEL = {
  NICHT_ERFORDERLICH: 'Nicht erforderlich',
  OFFEN: 'Offen',
  TEILWEISE: 'Teilweise',
  VOLLSTAENDIG: 'Vollständig',
} as const;
export type MaterialStatusKey = keyof typeof MATERIAL_STATUS_LABEL;
export const MATERIAL_STATUS_KEYS = Object.keys(MATERIAL_STATUS_LABEL) as MaterialStatusKey[];

export const CONFIRMATION_LABEL = {
  OFFEN: 'Offen',
  ANGEFRAGT: 'Angefragt',
  BESTAETIGT: 'Bestätigt',
  ABGELEHNT: 'Abgelehnt',
} as const;
export type ConfirmationKey = keyof typeof CONFIRMATION_LABEL;
export const CONFIRMATION_KEYS = Object.keys(CONFIRMATION_LABEL) as ConfirmationKey[];

export const TRAFFIC_LIGHT_LABEL = {
  GRUEN: 'Grün',
  GELB: 'Gelb',
  ROT: 'Rot',
  GRAU: 'Grau',
} as const;
export type TrafficLightKey = keyof typeof TRAFFIC_LIGHT_LABEL;
export const TRAFFIC_LIGHT_KEYS = Object.keys(TRAFFIC_LIGHT_LABEL) as TrafficLightKey[];

export const RESOURCE_TYPE_LABEL = {
  MITARBEITER: 'Mitarbeiter',
  BAULEITER: 'Bauleiter',
  SUBUNTERNEHMER: 'Subunternehmer',
  UNBESETZT: 'Unbesetzt',
} as const;
export type ResourceTypeKey = keyof typeof RESOURCE_TYPE_LABEL;

export const ASSIGNMENT_KIND_LABEL = {
  ARBEIT: 'Arbeit auf der Baustelle',
  BESICHTIGUNG: 'Besichtigung',
  AUFMASS: 'Aufmaß',
  MATERIAL_BESTELLEN: 'Material bestellen',
  MATERIAL_ANLIEFERUNG: 'Materialanlieferung',
  ABNAHME: 'Abnahme',
  BESPRECHUNG: 'Besprechung',
  NACHARBEIT: 'Nacharbeit',
  SONSTIGES: 'Sonstiges',
} as const;
export type AssignmentKindKey = keyof typeof ASSIGNMENT_KIND_LABEL;
export const ASSIGNMENT_KIND_KEYS = Object.keys(ASSIGNMENT_KIND_LABEL) as AssignmentKindKey[];

/// Kurzform für die engen Zellen der Plantafel.
export const ASSIGNMENT_KIND_SHORT: Record<AssignmentKindKey, string> = {
  ARBEIT: '',
  BESICHTIGUNG: 'Besicht.',
  AUFMASS: 'Aufmaß',
  MATERIAL_BESTELLEN: 'Material',
  MATERIAL_ANLIEFERUNG: 'Lieferung',
  ABNAHME: 'Abnahme',
  BESPRECHUNG: 'Termin',
  NACHARBEIT: 'Nacharbeit',
  SONSTIGES: 'Sonstiges',
};

/// Vorschläge, die beim Planen angeboten werden – nach Ressourcenart.
export const KIND_SUGGESTIONS: Record<string, AssignmentKindKey[]> = {
  BAULEITER: ['BESICHTIGUNG', 'AUFMASS', 'MATERIAL_BESTELLEN', 'ABNAHME', 'BESPRECHUNG', 'ARBEIT', 'NACHARBEIT', 'SONSTIGES'],
  MITARBEITER: ['ARBEIT', 'NACHARBEIT', 'AUFMASS', 'MATERIAL_ANLIEFERUNG', 'ABNAHME', 'SONSTIGES'],
  SUBUNTERNEHMER: ['ARBEIT', 'NACHARBEIT', 'AUFMASS', 'ABNAHME', 'SONSTIGES'],
  UNBESETZT: ['ARBEIT', 'BESICHTIGUNG', 'MATERIAL_ANLIEFERUNG', 'ABNAHME', 'SONSTIGES'],
};

export const ASSIGNMENT_STATUS_LABEL = {
  GEPLANT: 'Geplant',
  BESTAETIGT: 'Bestätigt',
  ABGESAGT: 'Abgesagt',
  ERLEDIGT: 'Erledigt',
} as const;
export type AssignmentStatusKey = keyof typeof ASSIGNMENT_STATUS_LABEL;
export const ASSIGNMENT_STATUS_KEYS = Object.keys(ASSIGNMENT_STATUS_LABEL) as AssignmentStatusKey[];

export const SOURCE_LABEL = {
  MANUELL: 'Manuell',
  DAS_PROGRAMM: 'Das Programm',
  TELEFON_3CX: '3CX-Telefonat',
  OUTLOOK: 'Outlook',
  AUTOMATISCH: 'Automatisch',
  SEED: 'Demo-Daten',
} as const;
export type SourceKey = keyof typeof SOURCE_LABEL;

export const CHANGE_REASON_LABEL = {
  KUNDE: 'Kunde',
  MR_UMBAU: 'MR Umbau',
  BAULEITER: 'Bauleiter',
  MITARBEITER: 'Mitarbeiter',
  SUBUNTERNEHMER: 'Subunternehmer',
  MATERIAL: 'Material',
  LIEFERANT: 'Lieferant',
  KRANKHEIT: 'Krankheit',
  URLAUB: 'Urlaub',
  BAUSTELLENVORLEISTUNG: 'Baustellenvorleistung',
  TECHNISCHE_URSACHE: 'Technische Ursache',
  WETTER: 'Wetter',
  SONSTIGES: 'Sonstiges',
} as const;
export type ChangeReasonKey = keyof typeof CHANGE_REASON_LABEL;
export const CHANGE_REASON_KEYS = Object.keys(CHANGE_REASON_LABEL) as ChangeReasonKey[];

export const COMMUNICATION_STATUS_LABEL = {
  NEU: 'Neu',
  IN_PRUEFUNG: 'In Prüfung',
  ERLEDIGT: 'Erledigt',
} as const;
export type CommunicationStatusKey = keyof typeof COMMUNICATION_STATUS_LABEL;

export const COMMUNICATION_DIRECTION_LABEL = {
  EINGEHEND: 'Eingehend',
  AUSGEHEND: 'Ausgehend',
  UNBEKANNT: 'Unbekannt',
} as const;

export const CHANGE_REQUEST_TYPE_LABEL = {
  TERMIN_AENDERUNG: 'Terminänderung',
  STATUS_AENDERUNG: 'Statusänderung',
  MATERIAL_AENDERUNG: 'Materialänderung',
  KUNDENBESTAETIGUNG: 'Kundenbestätigung',
  RUECKRUF: 'Rückruf',
  NOTIZ: 'Notiz',
  SONSTIGES: 'Sonstiges',
} as const;
export type ChangeRequestTypeKey = keyof typeof CHANGE_REQUEST_TYPE_LABEL;

export const CHANGE_REQUEST_STATUS_LABEL = {
  OFFEN: 'Offen',
  UEBERNOMMEN: 'Übernommen',
  ABGELEHNT: 'Abgelehnt',
} as const;
