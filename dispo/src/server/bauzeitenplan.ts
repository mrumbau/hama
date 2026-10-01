/**
 * Der Bauzeitenplan einer Baustelle – Datenbankseite.
 *
 * Die Rechnerei steht in `@/lib/bauzeitenplan` und ist dort ohne Datenbank
 * prüfbar. Hier geht es nur darum, sie auf echte Zeilen anzuwenden und das
 * Ergebnis in einem Rutsch zu speichern: Ein halb verschobener Plan wäre
 * schlimmer als ein gar nicht verschobener.
 */
import type { AssignmentStatus, ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { colorFromString } from '@/lib/utils';
import { CLOSED_PROJECT_STATUS } from '@/lib/labels';
import { dbDateToIso, isoToDbDate, type IsoDate } from '@/lib/dates';
import {
  verschiebeAbHier,
  verschiebeNurDiese,
  type Phase,
  type Raster,
} from '@/lib/bauzeitenplan';

/**
 * Steht für dieses Gewerk jemand auf der Plantafel?
 *
 *   ok         – es ist jemand eingeplant, und wenn eine Firma hinterlegt ist,
 *                dann auch diese Firma.
 *   firmaFehlt – es ist jemand da, aber nicht die Firma, die laut Plan kommen
 *                soll. Das ist der heimtückische Fall: Der Balken sieht
 *                vollständig aus, und am Montag steht die falsche Mannschaft da.
 *   niemand    – im ganzen Zeitraum kein Einsatz. Der Balken steht im Plan und
 *                auf der Tafel ist nichts.
 */
export type Besetzung = 'ok' | 'firmaFehlt' | 'niemand';

export interface PhaseDTO {
  id: string;
  tradeId: string | null;
  /** Was auf dem Balken steht: eigene Bezeichnung, sonst der Gewerkename. */
  titel: string;
  /**
   * Die eigene Bezeichnung selbst, roh. Die Oberflaeche braucht sie getrennt
   * vom Titel: Sonst hielt sie den Ersatztext "Ohne Bezeichnung" fuer eine
   * eingetippte Bezeichnung und speicherte ihn beim naechsten Mal als solche.
   */
  label: string | null;
  gewerk: string | null;
  farbe: string;
  subcontractorId: string | null;
  firma: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string | null;
  sortOrder: number;
  besetzung: Besetzung;
  /** Wer im Zeitraum auf der Tafel steht – für den Mauszeiger. */
  wer: string[];
}

export interface BauzeitenplanDTO {
  projectId: string;
  raster: Raster;
  phasen: PhaseDTO[];
}

/** Ohne Gewerk und ohne eigene Bezeichnung bleibt die Zeile nicht namenlos. */
const OHNE_NAMEN = 'Ohne Bezeichnung';

/** Die Farbe, die ein Gewerk hat, solange niemand eine ausgesucht hat. */
const STANDARDGRAU = '#64748b';

/**
 * Welche Farbe bekommt der Balken?
 *
 * Hat jemand dem Gewerk eine Farbe gegeben, gilt die. Sonst wird eine aus
 * dem Namen abgeleitet - dieselbe bei jedem Aufruf, also auch morgen noch.
 * Der Grund ist schlicht: Ein Bauzeitenplan, auf dem alle Balken dasselbe
 * Grau haben, ist nicht zu lesen, und bis jemand vierzehn Gewerken von Hand
 * Farben gibt, vergeht Zeit, die der Plan nicht hat.
 */
function balkenfarbe(name: string | undefined, farbe: string | undefined): string {
  if (farbe && farbe !== STANDARDGRAU) return farbe;
  return colorFromString(name ?? OHNE_NAMEN);
}

/**
 * Ein Einsatz, soweit die Besetzungsfrage ihn braucht.
 *
 * Abgesagte zaehlen nicht: Ein abgesagter Einsatz ist das Gegenteil einer
 * Besetzung. Vorschlaege zaehlen mit - jemand hat sich etwas vorgenommen, und
 * genau das will man wissen, bevor man die Baustelle fuer besetzt haelt. Dass
 * es nur ein Vorschlag ist, steht auf der Plantafel.
 */
interface Einsatz {
  projectId: string;
  subcontractorId: string | null;
  von: IsoDate;
  bis: IsoDate;
  wer: string;
}

const ZAEHLT_NICHT: AssignmentStatus[] = ['ABGESAGT'];

/**
 * Je Baustelle gebuendelt. Einmal gruppiert statt je Zeile gefiltert: Bei
 * dreissig Baustellen mit je fuenfzehn Zeilen und dreitausend Einsaetzen
 * waren das sonst ueber eine Million Vergleiche fuer eine Seite.
 */
type EinsaetzeJeBaustelle = Map<string, Einsatz[]>;

/** Einsaetze der genannten Baustellen, auf das Noetige eingekocht. */
async function einsaetzeFuer(projectIds: string[]): Promise<EinsaetzeJeBaustelle> {
  const jeBaustelle: EinsaetzeJeBaustelle = new Map();
  if (!projectIds.length) return jeBaustelle;
  const rows = await prisma.assignment.findMany({
    where: { projectId: { in: projectIds }, status: { notIn: ZAEHLT_NICHT } },
    select: {
      projectId: true,
      subcontractorId: true,
      startDate: true,
      endDate: true,
      placeholderLabel: true,
      employee: { select: { firstName: true, lastName: true } },
      siteManager: { select: { firstName: true, lastName: true } },
      subcontractor: { select: { companyName: true } },
    },
  });

  for (const a of rows) {
    const einsatz: Einsatz = {
      projectId: a.projectId,
      subcontractorId: a.subcontractorId,
      von: dbDateToIso(a.startDate),
      bis: dbDateToIso(a.endDate),
      wer:
        a.subcontractor?.companyName ??
        (a.employee ? `${a.employee.firstName} ${a.employee.lastName}`.trim() : null) ??
        (a.siteManager ? `${a.siteManager.firstName} ${a.siteManager.lastName}`.trim() : null) ??
        a.placeholderLabel ??
        'Unbesetzt',
    };
    const liste = jeBaustelle.get(a.projectId);
    if (liste) liste.push(einsatz);
    else jeBaustelle.set(a.projectId, [einsatz]);
  }
  return jeBaustelle;
}

/**
 * Steht fuer diese Zeile jemand auf der Tafel?
 *
 * Ueberschneidung, nicht Deckung: Ein Gewerk ueber drei Wochen, fuer das nur
 * die erste Woche besetzt ist, gilt als besetzt. Alles andere waere eine
 * Warnung, die bei fast jeder Zeile leuchtet und die darum keiner mehr liest.
 */
function besetzungFuer(
  phase: { startDate: IsoDate; endDate: IsoDate; subcontractorId: string | null },
  einsaetze: Einsatz[],
): { besetzung: Besetzung; wer: string[] } {
  const imZeitraum = einsaetze.filter((e) => e.von <= phase.endDate && e.bis >= phase.startDate);
  const wer = [...new Set(imZeitraum.map((e) => e.wer))];

  if (!imZeitraum.length) return { besetzung: 'niemand', wer };
  if (
    phase.subcontractorId &&
    !imZeitraum.some((e) => e.subcontractorId === phase.subcontractorId)
  ) {
    return { besetzung: 'firmaFehlt', wer };
  }
  return { besetzung: 'ok', wer };
}

export async function ladeBauzeitenplan(projectId: string): Promise<BauzeitenplanDTO> {
  const [projekt, rows, einsaetze] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { scheduleUnit: true },
    }),
    prisma.schedulePhase.findMany({
      where: { projectId },
      include: { trade: true, subcontractor: true },
      orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
    }),
    einsaetzeFuer([projectId]),
  ]);

  return {
    projectId,
    raster: (projekt.scheduleUnit === 'TAG' ? 'TAG' : 'WOCHE') as Raster,
    phasen: rows.map((r) => phaseDTO(r, einsaetze)),
  };
}

/**
 * Eine Zeile, wie die Oberfläche sie braucht.
 *
 * Eine Stelle für beide Wege – Einzelplan und Übersicht. Zwei Abschriften
 * derselben Umwandlung laufen auseinander, und zwar immer an der Farbe.
 */
function phaseDTO(
  p: {
    id: string;
    projectId: string;
    tradeId: string | null;
    label: string | null;
    subcontractorId: string | null;
    note: string | null;
    sortOrder: number;
    startDate: Date;
    endDate: Date;
    trade: { name: string; color: string } | null;
    subcontractor: { companyName: string } | null;
  },
  einsaetze: EinsaetzeJeBaustelle,
): PhaseDTO {
  const startDate = dbDateToIso(p.startDate);
  const endDate = dbDateToIso(p.endDate);
  const besetzung = besetzungFuer(
    { startDate, endDate, subcontractorId: p.subcontractorId },
    einsaetze.get(p.projectId) ?? [],
  );

  return {
    id: p.id,
    tradeId: p.tradeId,
    titel: p.label?.trim() || p.trade?.name || OHNE_NAMEN,
    label: p.label?.trim() || null,
    gewerk: p.trade?.name ?? null,
    farbe: balkenfarbe(p.trade?.name, p.trade?.color),
    subcontractorId: p.subcontractorId,
    firma: p.subcontractor?.companyName ?? null,
    startDate,
    endDate,
    note: p.note,
    sortOrder: p.sortOrder,
    besetzung: besetzung.besetzung,
    wer: besetzung.wer,
  };
}

/** Die Zeilen, wie die Verschieberegel sie braucht. */
async function phasenFuer(projectId: string): Promise<Phase[]> {
  const rows = await prisma.schedulePhase.findMany({
    where: { projectId },
    select: { id: true, startDate: true, endDate: true },
  });
  return rows.map((p) => ({
    id: p.id,
    startDate: dbDateToIso(p.startDate),
    endDate: dbDateToIso(p.endDate),
  }));
}

/**
 * Verschieben – entweder ab hier oder nur diese eine Zeile.
 *
 * Alles in einer Transaktion: Entweder steht der ganze Plan danach richtig,
 * oder es hat sich nichts bewegt. Ein Abbruch mittendrin hinterließe einen
 * Plan, in dem Gewerke einander überholt haben, und das sähe aus wie eine
 * absichtliche Planung.
 */
export async function verschiebePhase(
  projectId: string,
  phaseId: string,
  tage: number,
  modus: 'abHier' | 'nurDiese',
): Promise<number> {
  const phasen = await phasenFuer(projectId);
  const aenderungen =
    modus === 'abHier'
      ? verschiebeAbHier(phasen, phaseId, tage)
      : verschiebeNurDiese(phasen, phaseId, tage);

  if (!aenderungen.length) return 0;

  await prisma.$transaction(
    aenderungen.map((a) =>
      prisma.schedulePhase.update({
        where: { id: a.id },
        data: { startDate: isoToDbDate(a.startDate), endDate: isoToDbDate(a.endDate) },
      }),
    ),
  );
  return aenderungen.length;
}

/** Kurzform für das Protokoll: „Sanitär: 12.10. → 19.10." */
export function protokollZeile(titel: string, von: IsoDate, nach: IsoDate): string {
  const kurz = (d: IsoDate) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  return `${titel}: ${kurz(von)} → ${kurz(nach)}`;
}

// ---------------------------------------------------------------------------
// Alle Baustellen auf einer Zeitachse
// ---------------------------------------------------------------------------

export interface BaustellePlanDTO {
  id: string;
  customerName: string;
  name: string;
  status: string;
  bauleiter: string | null;
  /** Das Raster, in dem diese Baustelle gerechnet wird. */
  raster: Raster;
  phasen: PhaseDTO[];
}

/**
 * Die Übersicht: jede Baustelle mit ihrem Plan, auf einer gemeinsamen
 * Zeitachse lesbar.
 *
 * Der Grund für die eigene Seite ist derselbe wie bei der Plantafel: Ein Plan
 * je Baustelle beantwortet „läuft diese Baustelle rund?". Die Frage, die
 * wehtut, ist eine andere – „wo stehen diese Woche drei Gewerke gleichzeitig,
 * und haben wir dafür überhaupt Leute?". Die sieht man nur, wenn alle
 * Baustellen untereinanderstehen.
 *
 * Abgeschlossenes bleibt draußen. Ein Bauzeitenplan ist ein Blick nach vorn;
 * fertige Baustellen machen die Achse nur lang.
 */
export async function ladeAlleBauzeitenplaene(): Promise<BaustellePlanDTO[]> {
  const projekte = await prisma.project.findMany({
    where: {
      // Lager, Besorgungsfahrten, Urlaub und Krank haben keinen Bauablauf.
      internKey: null,
      status: { notIn: CLOSED_PROJECT_STATUS as ProjectStatus[] },
    },
    select: {
      id: true,
      customerName: true,
      name: true,
      status: true,
      scheduleUnit: true,
      primarySiteManager: { select: { firstName: true, lastName: true } },
      schedulePhases: {
        include: { trade: true, subcontractor: true },
        orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
      },
    },
    orderBy: [{ customerName: 'asc' }, { name: 'asc' }],
  });

  /*
   * Eine Abfrage fuer alle Baustellen, nicht eine je Baustelle. Bei dreissig
   * offenen Baustellen waeren das sonst dreissig Abfragen fuer eine Seite.
   */
  const einsaetze = await einsaetzeFuer(projekte.map((p) => p.id));

  return projekte.map((p) => ({
    id: p.id,
    customerName: p.customerName,
    name: p.name,
    status: p.status,
    bauleiter: p.primarySiteManager
      ? `${p.primarySiteManager.firstName} ${p.primarySiteManager.lastName}`.trim()
      : null,
    raster: (p.scheduleUnit === 'TAG' ? 'TAG' : 'WOCHE') as Raster,
    phasen: p.schedulePhases.map((r) => phaseDTO(r, einsaetze)),
  }));
}
