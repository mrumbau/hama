/**
 * Demo-Daten entfernen.
 *
 * Solange die App nur vorgeführt wurde, waren Luigi, Max Muster und die drei
 * Beispielbaustellen nützlich. Sobald echte Aufträge darin stehen, sind sie
 * das Gegenteil: Man weiß bei jeder Zeile nicht, ob sie echt ist.
 *
 * Gelöscht wird nur, was ausdrücklich als Demo markiert ist (`isDemo`).
 * Echte Datensätze aus „Das Programm“ tragen die Markierung nie – sie können
 * hier also nicht versehentlich mitgehen.
 */
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';

export interface DemoBereinigung {
  projekte: number;
  einsaetze: number;
  mitarbeiter: number;
  bauleiter: number;
  subunternehmer: number;
  kommunikation: number;
  gesamt: number;
}

export async function entferneDemoDaten(): Promise<DemoBereinigung> {
  // Reihenfolge: erst was auf anderes zeigt, dann die Stammdaten. Sonst
  // hält eine Fremdschlüsselbeziehung den Löschvorgang auf.
  const demoProjekte = await prisma.project.findMany({
    where: { isDemo: true },
    select: { id: true },
  });
  const projektIds = demoProjekte.map((p) => p.id);

  const einsaetze = await prisma.assignment.deleteMany({
    where: {
      OR: [
        { projectId: { in: projektIds } },
        { employee: { isDemo: true } },
        { siteManager: { isDemo: true } },
        { subcontractor: { isDemo: true } },
      ],
    },
  });

  const kommunikation = await prisma.communication.deleteMany({
    where: { OR: [{ isDemo: true }, { projectId: { in: projektIds } }] },
  });
  await prisma.changeRequest.deleteMany({ where: { projectId: { in: projektIds } } });
  await prisma.projectNote.deleteMany({ where: { projectId: { in: projektIds } } });

  const projekte = await prisma.project.deleteMany({ where: { isDemo: true } });
  const mitarbeiter = await prisma.employee.deleteMany({ where: { isDemo: true } });
  const bauleiter = await prisma.siteManager.deleteMany({ where: { isDemo: true } });
  const subunternehmer = await prisma.subcontractor.deleteMany({ where: { isDemo: true } });

  const ergebnis: DemoBereinigung = {
    projekte: projekte.count,
    einsaetze: einsaetze.count,
    mitarbeiter: mitarbeiter.count,
    bauleiter: bauleiter.count,
    subunternehmer: subunternehmer.count,
    kommunikation: kommunikation.count,
    gesamt:
      projekte.count +
      einsaetze.count +
      mitarbeiter.count +
      bauleiter.count +
      subunternehmer.count +
      kommunikation.count,
  };

  if (ergebnis.gesamt > 0) {
    await writeAudit({
      entityType: 'integration',
      entityId: 'demo-daten',
      action: 'deleted',
      label: 'Demo-Daten entfernt',
      oldValue: ergebnis as unknown as Record<string, unknown>,
    });
  }

  return ergebnis;
}

/** Wie viele Demo-Datensätze stehen noch drin? */
export async function zaehleDemoDaten(): Promise<number> {
  const [p, e, b, s] = await Promise.all([
    prisma.project.count({ where: { isDemo: true } }),
    prisma.employee.count({ where: { isDemo: true } }),
    prisma.siteManager.count({ where: { isDemo: true } }),
    prisma.subcontractor.count({ where: { isDemo: true } }),
  ]);
  return p + e + b + s;
}
