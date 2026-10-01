/**
 * Der Bauzeitenplan einer Baustelle – Datenbankseite.
 *
 * Die Rechnerei steht in `@/lib/bauzeitenplan` und ist dort ohne Datenbank
 * prüfbar. Hier geht es nur darum, sie auf echte Zeilen anzuwenden und das
 * Ergebnis in einem Rutsch zu speichern: Ein halb verschobener Plan wäre
 * schlimmer als ein gar nicht verschobener.
 */
import type { ProjectStatus } from '@prisma/client';
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

export interface PhaseDTO {
  id: string;
  tradeId: string | null;
  /** Was auf dem Balken steht: eigene Bezeichnung, sonst der Gewerkename. */
  titel: string;
  gewerk: string | null;
  farbe: string;
  subcontractorId: string | null;
  firma: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string | null;
  sortOrder: number;
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

export async function ladeBauzeitenplan(projectId: string): Promise<BauzeitenplanDTO> {
  const [projekt, rows] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { scheduleUnit: true },
    }),
    prisma.schedulePhase.findMany({
      where: { projectId },
      include: { trade: true, subcontractor: true },
      orderBy: [{ startDate: 'asc' }, { sortOrder: 'asc' }],
    }),
  ]);

  return {
    projectId,
    raster: (projekt.scheduleUnit === 'TAG' ? 'TAG' : 'WOCHE') as Raster,
    phasen: rows.map(phaseDTO),
  };
}

/**
 * Eine Zeile, wie die Oberfläche sie braucht.
 *
 * Eine Stelle für beide Wege – Einzelplan und Übersicht. Zwei Abschriften
 * derselben Umwandlung laufen auseinander, und zwar immer an der Farbe.
 */
function phaseDTO(p: {
  id: string;
  tradeId: string | null;
  label: string | null;
  subcontractorId: string | null;
  note: string | null;
  sortOrder: number;
  startDate: Date;
  endDate: Date;
  trade: { name: string; color: string } | null;
  subcontractor: { companyName: string } | null;
}): PhaseDTO {
  return {
    id: p.id,
    tradeId: p.tradeId,
    titel: p.label?.trim() || p.trade?.name || OHNE_NAMEN,
    gewerk: p.trade?.name ?? null,
    farbe: balkenfarbe(p.trade?.name, p.trade?.color),
    subcontractorId: p.subcontractorId,
    firma: p.subcontractor?.companyName ?? null,
    startDate: dbDateToIso(p.startDate),
    endDate: dbDateToIso(p.endDate),
    note: p.note,
    sortOrder: p.sortOrder,
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

  return projekte.map((p) => ({
    id: p.id,
    customerName: p.customerName,
    name: p.name,
    status: p.status,
    bauleiter: p.primarySiteManager
      ? `${p.primarySiteManager.firstName} ${p.primarySiteManager.lastName}`.trim()
      : null,
    raster: (p.scheduleUnit === 'TAG' ? 'TAG' : 'WOCHE') as Raster,
    phasen: p.schedulePhases.map(phaseDTO),
  }));
}
