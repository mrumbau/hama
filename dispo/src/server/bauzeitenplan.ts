/**
 * Der Bauzeitenplan einer Baustelle – Datenbankseite.
 *
 * Die Rechnerei steht in `@/lib/bauzeitenplan` und ist dort ohne Datenbank
 * prüfbar. Hier geht es nur darum, sie auf echte Zeilen anzuwenden und das
 * Ergebnis in einem Rutsch zu speichern: Ein halb verschobener Plan wäre
 * schlimmer als ein gar nicht verschobener.
 */
import { prisma } from '@/lib/db';
import { colorFromString } from '@/lib/utils';
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
    phasen: rows.map((p) => ({
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
    })),
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
