/**
 * Sicherung der Dispo-Daten.
 *
 * Die Planung der ganzen Firma liegt in einer Datenbank, die jemand anderem
 * gehört. Eine Sicherung, an die man im Ernstfall nicht selbst herankommt,
 * ist keine – deshalb liegt der Stand jede Nacht als lesbare Datei in Box.
 *
 * Bewusst kein Datenbank-Abzug (pg_dump): Der ließe sich nur mit demselben
 * Postgres wieder einspielen. Eine JSON-Datei kann man öffnen, durchsuchen
 * und notfalls von Hand abtippen – und `scripts/sicherung-einspielen.mjs`
 * schreibt sie in eine leere Datenbank zurück.
 */
import { prisma } from '@/lib/db';

/** Was nie in eine Sicherung gehört, die in einem geteilten Ordner landet. */
export const GEHEIM = /(token|secret|geheimnis|passwort|password)$/i;

/**
 * Die Reihenfolge ist die Einspielreihenfolge: Ein Einsatz braucht das
 * Projekt, das Projekt braucht den Bauleiter. Wer hier etwas einfügt, muss
 * es hinter alles setzen, worauf es zeigt.
 */
export const TABELLEN = [
  'trades',
  'siteManagers',
  'employees',
  'employeeTrades',
  'subcontractors',
  'subcontractorTrades',
  'users',
  'projects',
  'projectNotes',
  'assignments',
  'communications',
  'changeRequests',
  'warningDismissals',
  'auditLog',
  'settings',
] as const;

export type Tabelle = (typeof TABELLEN)[number];

export interface Sicherung {
  /** Wann der Stand entstanden ist. */
  stand: string;
  /** Aus welcher Umgebung – damit niemand den Probestand zurückspielt. */
  umgebung: string;
  /** Der Stand der Migrationen. Passt er nicht, passt das Einspielen nicht. */
  migration: string | null;
  daten: Record<Tabelle, unknown[]>;
  anzahl: Record<Tabelle, number>;
}

/**
 * Passwörter bleiben draußen.
 *
 * Ein Hash ist kein Klartext, aber er gehört trotzdem nicht in einen Ordner,
 * in den Kollegen schauen können. Wer nach einem Rückspielen wieder hinein
 * will, meldet sich über Microsoft an oder bekommt ein neues Kennwort.
 */
function ohnePasswort<T extends { passwordHash?: unknown }>(zeile: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _weg, ...rest } = zeile;
  return rest;
}

export async function erstelleSicherung(): Promise<Sicherung> {
  const [
    trades,
    siteManagers,
    employees,
    employeeTrades,
    subcontractors,
    subcontractorTrades,
    users,
    projects,
    projectNotes,
    assignments,
    communications,
    changeRequests,
    warningDismissals,
    auditLog,
    settings,
    migration,
  ] = await Promise.all([
    prisma.trade.findMany(),
    prisma.siteManager.findMany(),
    prisma.employee.findMany(),
    prisma.employeeTrade.findMany(),
    prisma.subcontractor.findMany(),
    prisma.subcontractorTrade.findMany(),
    prisma.user.findMany(),
    prisma.project.findMany(),
    prisma.projectNote.findMany(),
    prisma.assignment.findMany(),
    prisma.communication.findMany(),
    prisma.changeRequest.findMany(),
    prisma.warningDismissal.findMany(),
    prisma.auditLog.findMany(),
    prisma.setting.findMany(),
    letzteMigration(),
  ]);

  const daten = {
    trades,
    siteManagers,
    employees,
    employeeTrades,
    subcontractors,
    subcontractorTrades,
    users: users.map(ohnePasswort),
    projects,
    projectNotes,
    assignments,
    communications,
    changeRequests,
    warningDismissals,
    auditLog,
    // Der Ausweis des Zeitplans steht hier drin. Er sichert nichts, was man
    // wiederherstellen müsste – er sperrt nur eine Tür auf.
    settings: settings.filter((s) => !GEHEIM.test(s.key)),
  } satisfies Record<Tabelle, unknown[]>;

  return {
    stand: new Date().toISOString(),
    umgebung: process.env.VERCEL_ENV ?? 'lokal',
    migration,
    daten,
    anzahl: Object.fromEntries(
      TABELLEN.map((t) => [t, daten[t].length]),
    ) as Sicherung['anzahl'],
  };
}

async function letzteMigration(): Promise<string | null> {
  try {
    const zeilen = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1
    `;
    return zeilen[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

/** Ein Name je Tag – damit liegen die Stände von selbst sortiert. */
export function dateiname(stand: string | Date = new Date()): string {
  const iso = typeof stand === 'string' ? stand : stand.toISOString();
  return `dispo-sicherung-${iso.slice(0, 10)}.json`;
}

/**
 * Sieht die Sicherung nach Daten aus?
 *
 * Eine leere Datei, die jede Nacht die gestrige überschreibt, ist
 * gefährlicher als gar keine: Sie sieht aus wie eine Sicherung. Kommen also
 * keine Projekte und keine Mitarbeiter mit, wird nicht hochgeladen.
 */
export function wirktBefuellt(s: Sicherung): boolean {
  return s.anzahl.projects > 0 || s.anzahl.employees > 0 || s.anzahl.siteManagers > 0;
}
