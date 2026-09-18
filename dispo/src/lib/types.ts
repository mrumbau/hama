import type { IsoDate } from './dates';
import type {
  AssignmentKindKey,
  AssignmentStatusKey,
  ChangeReasonKey,
  ConfirmationKey,
  MaterialStatusKey,
  PriorityKey,
  ProjectStatusKey,
  ResourceTypeKey,
  SourceKey,
  TrafficLightKey,
} from './labels';

/** Ein Einsatz, wie ihn die Plantafel braucht. */
export interface AssignmentDTO {
  id: string;
  projectId: string;
  resourceType: ResourceTypeKey;
  /** Anzeigename der Ressource ("Luigi Curatolo", "Elektro Müller GmbH"). */
  resourceLabel: string;
  /** Kurzform fuer enge Zellen ("LC"). */
  resourceShort: string;
  /** Stabile Ressourcen-Kennung fuer die Ressourcenansicht. */
  resourceKey: string;
  employeeId: string | null;
  siteManagerId: string | null;
  subcontractorId: string | null;
  placeholderLabel: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  status: AssignmentStatusKey;
  source: SourceKey;
  color: string;
  /// Wofür der Einsatz da ist.
  kind: AssignmentKindKey;
  /// Konkrete Tätigkeiten für diesen Tag.
  tasks: string[];
}

/**
 * Feste Eintraege der Dispo, die es in „Das Programm" nicht gibt.
 *
 * Das Lager ist ein Arbeitsort, die Besorgungsfahrten sind ein Sammelposten
 * fuer „wer holt was". Beides ist keine Baustelle, beides braucht aber eine
 * Zeile auf der Tafel - sonst sieht niemand, wer wirklich frei ist.
 */
export type InternerEintrag = 'LAGER' | 'BESORGUNG';

export interface ProjectSummaryDTO {
  id: string;
  /** Gesetzt bei Lager und Besorgungsfahrten, sonst null. */
  internKey: InternerEintrag | null;
  erpId: string | null;
  /** Roh-Status aus "Das Programm" – erklaert, warum eine Baustelle fehlt. */
  erpStatus: string | null;
  orderNumber: string | null;
  projectNumber: string | null;
  customerName: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  primarySiteManagerId: string | null;
  primarySiteManagerName: string | null;
  primarySiteManagerColor: string | null;
  secondarySiteManagerId: string | null;
  secondarySiteManagerName: string | null;
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  status: ProjectStatusKey;
  priority: PriorityKey;
  materialStatus: MaterialStatusKey;
  customerConfirmed: ConfirmationKey;
  trafficLight: TrafficLightKey;
  trafficLightOverride: TrafficLightKey | null;
  trafficLightReasons: string[];
  internalNotes: string | null;
  specialNotes: string | null;
  isDemo: boolean;
}

export interface ResourceDTO {
  key: string;
  /** Datenart – bestimmt, woran ein Einsatz haengt. */
  type: ResourceTypeKey;
  /**
   * Wo die Ressource auf der Plantafel steht. Weicht vom Typ ab, wenn ein
   * Mitarbeiter die Faehigkeit "Bauleitung" traegt: er bleibt ein
   * Mitarbeiter, erscheint aber bei den Bauleitern.
   */
  gruppe: ResourceTypeKey;
  id: string;
  label: string;
  short: string;
  subtitle: string | null;
  color: string;
  active: boolean;
  /**
   * Bevorzugt = "gehoert zu denen, mit denen wir ueblicherweise arbeiten".
   * Nur diese stehen in der Ablageleiste; der Rest kommt ueber "Hinzufuegen"
   * dazu. Von 34 Subunternehmern braucht man taeglich eine Handvoll.
   */
  bevorzugt: boolean;
}

export type WarningSeverity = 'KRITISCH' | 'WARNUNG' | 'HINWEIS';
export type WarningBucket = 'KRITISCH' | 'HEUTE' | 'DIESE_WOCHE' | 'SPAETER';

export interface WarningDTO {
  key: string;
  severity: WarningSeverity;
  bucket: WarningBucket;
  category: string;
  title: string;
  detail: string;
  projectId: string | null;
  projectLabel: string | null;
  date: IsoDate | null;
  /** Wohin soll ein Klick fuehren? */
  href: string | null;
  dismissed: boolean;
}

export interface BoardResponse {
  from: IsoDate;
  to: IsoDate;
  days: IsoDate[];
  projects: ProjectSummaryDTO[];
  resources: ResourceDTO[];
  assignments: AssignmentDTO[];
  /** resourceKey|date -> Anzahl verschiedener Projekte an diesem Tag. */
  conflicts: Record<string, string[]>;
  kpis: {
    laufendeBaustellen: number;
    dieseWoche: number;
    roteBaustellen: number;
    offeneAenderungen: number;
    unbesetzteEinsaetze: number;
  };
}

export interface AuditEntryDTO {
  id: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  action: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  source: SourceKey;
  reason: ChangeReasonKey | null;
  reasonText: string | null;
  note: string | null;
  createdAt: string;
}
