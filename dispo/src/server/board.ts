/**
 * Plantafel-Datenquelle.
 *
 * Laedt in wenigen Queries alles, was beide Ansichten (Baustellen +
 * Ressourcen) brauchen, und berechnet Ampel, Konflikte und KPIs serverseitig.
 * Ziel laut Master-Prompt: 100 Projekte / 150 Ressourcen / 1.000 Einsaetze
 * bleiben fluessig.
 */
import { prisma } from '@/lib/db';
import {
  addDays,
  dbDateToIso,
  isoToDbDate,
  type IsoDate,
  rangeDays,
  startOfWeek,
  todayIso,
} from '@/lib/dates';
import { CLOSED_PROJECT_STATUS } from '@/lib/labels';
import { colorFromString, fullName, initials } from '@/lib/utils';
import type { AssignmentDTO, BoardResponse, ProjectSummaryDTO, ResourceDTO } from '@/lib/types';
import { computeAmpel } from './ampel';

export interface BoardFilters {
  siteManagerIds?: string[];
  statuses?: string[];
  employeeIds?: string[];
  subcontractorIds?: string[];
  city?: string;
  trafficLights?: string[];
  /** "Nur Probleme anzeigen" – gelb + rot. */
  onlyProblems?: boolean;
  /** Freitext, greift auf Kunde/Projekt/Nummer/Ort. */
  query?: string;
  /** Auch abgeschlossene Projekte zeigen. */
  includeClosed?: boolean;
}

const UNBESETZT_COLOR = '#dc2626';

export async function loadBoard(
  from: IsoDate,
  to: IsoDate,
  filters: BoardFilters = {},
): Promise<BoardResponse> {
  const today = todayIso();
  const days = rangeDays(from, to);

  const [projectRows, assignmentRows, employees, siteManagers, subcontractors, openRequests] =
    await Promise.all([
      prisma.project.findMany({
        include: {
          primarySiteManager: true,
          secondarySiteManager: true,
        },
        orderBy: [{ plannedStart: 'asc' }, { customerName: 'asc' }],
      }),
      prisma.assignment.findMany({
        where: {
          startDate: { lte: isoToDbDate(to) },
          endDate: { gte: isoToDbDate(from) },
        },
        include: {
          employee: true,
          siteManager: true,
          subcontractor: { include: { trades: { include: { trade: true } } } },
        },
      }),
      prisma.employee.findMany({
        include: { trades: { include: { trade: true } } },
        orderBy: [{ lastName: 'asc' }],
      }),
      prisma.siteManager.findMany({ orderBy: [{ lastName: 'asc' }] }),
      prisma.subcontractor.findMany({
        include: { trades: { include: { trade: true } } },
        orderBy: [{ companyName: 'asc' }],
      }),
      prisma.changeRequest.groupBy({
        by: ['projectId'],
        where: { status: 'OFFEN', projectId: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const openRequestsByProject = new Map<string, number>();
  for (const row of openRequests) {
    if (row.projectId) openRequestsByProject.set(row.projectId, row._count._all);
  }

  // --- Einsaetze in DTOs uebersetzen ---
  const assignments: AssignmentDTO[] = assignmentRows.map((a) => {
    let label = a.placeholderLabel ?? 'Unbesetzt';
    let short = '??';
    let resourceKey = `UNBESETZT:${a.id}`;
    let color = UNBESETZT_COLOR;

    if (a.employee) {
      label = fullName(a.employee);
      short = a.employee.shortCode || initials(a.employee.firstName, a.employee.lastName);
      resourceKey = `MITARBEITER:${a.employee.id}`;
      color = '#0f766e';
    } else if (a.siteManager) {
      label = fullName(a.siteManager);
      short = a.siteManager.shortCode || initials(a.siteManager.firstName, a.siteManager.lastName);
      resourceKey = `BAULEITER:${a.siteManager.id}`;
      color = a.siteManager.color;
    } else if (a.subcontractor) {
      label = a.subcontractor.companyName;
      short = a.subcontractor.companyName.slice(0, 12);
      resourceKey = `SUBUNTERNEHMER:${a.subcontractor.id}`;
      color =
        a.subcontractor.trades[0]?.trade.color ?? colorFromString(a.subcontractor.companyName);
    }

    return {
      id: a.id,
      projectId: a.projectId,
      resourceType: a.resourceType as AssignmentDTO['resourceType'],
      resourceLabel: label,
      resourceShort: short,
      resourceKey,
      employeeId: a.employeeId,
      siteManagerId: a.siteManagerId,
      subcontractorId: a.subcontractorId,
      placeholderLabel: a.placeholderLabel,
      startDate: dbDateToIso(a.startDate),
      endDate: dbDateToIso(a.endDate),
      startTime: a.startTime,
      endTime: a.endTime,
      note: a.note,
      status: a.status as AssignmentDTO['status'],
      source: a.source as AssignmentDTO['source'],
      color,
      kind: a.kind as AssignmentDTO['kind'],
      tasks: a.tasks,
    };
  });

  const byProject = new Map<string, AssignmentDTO[]>();
  for (const a of assignments) {
    const list = byProject.get(a.projectId);
    if (list) list.push(a);
    else byProject.set(a.projectId, [a]);
  }

  // --- Konflikte: dieselbe Ressource am selben Tag auf mehreren Baustellen ---
  const dayIndex = new Map<string, Set<string>>(); // resourceKey|date -> projectIds
  for (const a of assignments) {
    if (a.status === 'ABGESAGT' || a.resourceType === 'UNBESETZT') continue;
    for (let d = a.startDate; d <= a.endDate; d = addDays(d, 1)) {
      const k = `${a.resourceKey}|${d}`;
      const set = dayIndex.get(k) ?? new Set<string>();
      set.add(a.projectId);
      dayIndex.set(k, set);
    }
  }
  const conflicts: Record<string, string[]> = {};
  const staffConflictProjects = new Set<string>();
  const subConflictProjects = new Set<string>();
  for (const [key, projectIds] of dayIndex) {
    if (projectIds.size < 2) continue;
    // Bauleiter zaehlen nicht als Konflikt – sie betreuen naturgemaess mehrere
    // Baustellen gleichzeitig.
    if (key.startsWith('BAULEITER:')) continue;
    conflicts[key] = [...projectIds];
    const target = key.startsWith('SUBUNTERNEHMER:') ? subConflictProjects : staffConflictProjects;
    for (const p of projectIds) target.add(p);
  }

  // --- Projekte + Ampel ---
  const allProjects: ProjectSummaryDTO[] = projectRows.map((p) => {
    const projectAssignments = byProject.get(p.id) ?? [];
    const ampel = computeAmpel(
      {
        status: p.status,
        plannedStart: p.plannedStart ? dbDateToIso(p.plannedStart) : null,
        plannedEnd: p.plannedEnd ? dbDateToIso(p.plannedEnd) : null,
        materialStatus: p.materialStatus,
        customerConfirmed: p.customerConfirmed,
        primarySiteManagerId: p.primarySiteManagerId,
        assignments: projectAssignments,
        hasStaffConflict: staffConflictProjects.has(p.id),
        hasSubDoubleBooking: subConflictProjects.has(p.id),
        openChangeRequests: openRequestsByProject.get(p.id) ?? 0,
      },
      today,
    );

    return {
      id: p.id,
      erpId: p.erpId,
      orderNumber: p.orderNumber,
      projectNumber: p.projectNumber,
      customerName: p.customerName,
      name: p.name,
      street: p.street,
      zip: p.zip,
      city: p.city,
      contactName: p.contactName,
      contactPhone: p.contactPhone,
      contactEmail: p.contactEmail,
      primarySiteManagerId: p.primarySiteManagerId,
      primarySiteManagerName: p.primarySiteManager ? fullName(p.primarySiteManager) : null,
      primarySiteManagerColor: p.primarySiteManager?.color ?? null,
      secondarySiteManagerId: p.secondarySiteManagerId,
      secondarySiteManagerName: p.secondarySiteManager ? fullName(p.secondarySiteManager) : null,
      plannedStart: p.plannedStart ? dbDateToIso(p.plannedStart) : null,
      plannedEnd: p.plannedEnd ? dbDateToIso(p.plannedEnd) : null,
      status: p.status as ProjectSummaryDTO['status'],
      priority: p.priority as ProjectSummaryDTO['priority'],
      materialStatus: p.materialStatus as ProjectSummaryDTO['materialStatus'],
      customerConfirmed: p.customerConfirmed as ProjectSummaryDTO['customerConfirmed'],
      trafficLight: (p.trafficLightOverride ?? ampel.light) as ProjectSummaryDTO['trafficLight'],
      trafficLightOverride:
        (p.trafficLightOverride as ProjectSummaryDTO['trafficLightOverride']) ?? null,
      trafficLightReasons: ampel.reasons,
      internalNotes: p.internalNotes,
      specialNotes: p.specialNotes,
      isDemo: p.isDemo,
    };
  });

  // --- KPIs immer auf der Gesamtmenge, nicht auf der gefilterten Sicht ---
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const kpis = {
    laufendeBaustellen: allProjects.filter(
      (p) => !CLOSED_PROJECT_STATUS.includes(p.status) && p.status !== 'NEU',
    ).length,
    dieseWoche: allProjects.filter(
      (p) =>
        p.plannedStart &&
        p.plannedStart <= weekEnd &&
        (p.plannedEnd ?? p.plannedStart) >= weekStart,
    ).length,
    roteBaustellen: allProjects.filter((p) => p.trafficLight === 'ROT').length,
    offeneAenderungen: await prisma.changeRequest.count({ where: { status: 'OFFEN' } }),
    unbesetzteEinsaetze: assignments.filter(
      (a) => a.resourceType === 'UNBESETZT' && a.status !== 'ABGESAGT',
    ).length,
  };

  // --- Filter anwenden ---
  const projects = allProjects.filter((p) => matchesFilters(p, byProject.get(p.id) ?? [], filters));
  const visibleIds = new Set(projects.map((p) => p.id));
  const visibleAssignments = assignments.filter((a) => visibleIds.has(a.projectId));

  // --- Ressourcenliste (Ansicht B) ---
  const resources: ResourceDTO[] = [
    ...siteManagers.map<ResourceDTO>((m) => ({
      key: `BAULEITER:${m.id}`,
      type: 'BAULEITER',
      gruppe: 'BAULEITER',
      id: m.id,
      label: fullName(m),
      short: m.shortCode,
      subtitle: 'Bauleiter',
      color: m.color,
      active: m.active,
    })),
    // Bürokräfte disponiert niemand – sie gehören nicht auf die Tafel.
    ...employees
      .filter((e) => !hatFaehigkeit(e.trades, BUERO_FAEHIGKEIT))
      .map<ResourceDTO>((e) => {
        // Wer die Fähigkeit „Bauleitung" trägt, steht bei den Bauleitern.
        // Die Einsatzart bleibt „Mitarbeiter", sonst zeigte der Einsatz auf
        // einen Bauleiter-Datensatz, den es zu dieser Person nicht gibt.
        const leitetBau = hatFaehigkeit(e.trades, BAULEITUNG_FAEHIGKEIT);
        const gewerke = e.trades.map((t) => t.trade.name);
        return {
          key: `MITARBEITER:${e.id}`,
          type: 'MITARBEITER',
          gruppe: leitetBau ? 'BAULEITER' : 'MITARBEITER',
          id: e.id,
          label: fullName(e),
          short: e.shortCode,
          subtitle: gewerke.join(', ') || e.profession,
          color: leitetBau ? '#7c3aed' : '#0f766e',
          active: e.active,
        };
      }),
    ...subcontractors.map<ResourceDTO>((s) => ({
      key: `SUBUNTERNEHMER:${s.id}`,
      type: 'SUBUNTERNEHMER',
      gruppe: 'SUBUNTERNEHMER',
      id: s.id,
      label: s.companyName,
      short: s.companyName.slice(0, 12),
      subtitle: s.trades.map((t) => t.trade.name).join(', ') || 'Subunternehmer',
      color: s.trades[0]?.trade.color ?? colorFromString(s.companyName),
      active: s.active,
    })),
  ];

  return {
    from,
    to,
    days,
    projects,
    resources,
    assignments: visibleAssignments,
    conflicts,
    kpis,
  };
}

function matchesFilters(
  p: ProjectSummaryDTO,
  assignments: AssignmentDTO[],
  f: BoardFilters,
): boolean {
  if (!f.includeClosed && CLOSED_PROJECT_STATUS.includes(p.status)) return false;
  if (f.siteManagerIds?.length) {
    const ids = [p.primarySiteManagerId, p.secondarySiteManagerId].filter(Boolean);
    if (!ids.some((id) => f.siteManagerIds!.includes(id!))) return false;
  }
  if (f.statuses?.length && !f.statuses.includes(p.status)) return false;
  if (f.trafficLights?.length && !f.trafficLights.includes(p.trafficLight)) return false;
  if (f.onlyProblems && p.trafficLight !== 'ROT' && p.trafficLight !== 'GELB') return false;
  if (f.city && !(p.city ?? '').toLowerCase().includes(f.city.toLowerCase())) return false;
  if (f.employeeIds?.length) {
    if (!assignments.some((a) => a.employeeId && f.employeeIds!.includes(a.employeeId))) {
      return false;
    }
  }
  if (f.subcontractorIds?.length) {
    if (
      !assignments.some((a) => a.subcontractorId && f.subcontractorIds!.includes(a.subcontractorId))
    ) {
      return false;
    }
  }
  if (f.query) {
    const q = f.query.toLowerCase();
    const haystack = [
      p.customerName,
      p.name,
      p.orderNumber,
      p.projectNumber,
      p.city,
      p.street,
      p.zip,
      p.contactName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/**
 * Fähigkeiten, die nicht beschreiben, *was* jemand kann, sondern *wo* er
 * hingehört. Sie steuern die Plantafel.
 */
const BUERO_FAEHIGKEIT = 'büro';
const BAULEITUNG_FAEHIGKEIT = 'bauleitung';

function hatFaehigkeit(trades: { trade: { name: string } }[], gesucht: string): boolean {
  return trades.some((t) => t.trade.name.trim().toLowerCase() === gesucht);
}
