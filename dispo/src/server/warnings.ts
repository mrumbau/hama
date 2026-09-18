/**
 * Automatische Warnungen + "Offene Punkte" (Master-Prompt 22 + 23).
 *
 * Alles wird live aus dem aktuellen Datenstand berechnet. Persistiert wird
 * nur, was der Disponent bewusst weggeklickt hat (`WarningDismissal`).
 */
import { prisma } from '@/lib/db';
import {
  addDays,
  dbDateToIso,
  diffDays,
  formatDateShort,
  type IsoDate,
  startOfWeek,
  todayIso,
} from '@/lib/dates';
import { CLOSED_PROJECT_STATUS, PROJECT_STATUS_LABEL } from '@/lib/labels';
import type { WarningBucket, WarningDTO, WarningSeverity } from '@/lib/types';
import { loadBoard } from './board';

const SEVERITY_RANK: Record<WarningSeverity, number> = {
  KRITISCH: 0,
  WARNUNG: 1,
  HINWEIS: 2,
};
const BUCKET_RANK: Record<WarningBucket, number> = {
  KRITISCH: 0,
  HEUTE: 1,
  DIESE_WOCHE: 2,
  SPAETER: 3,
};

export async function computeWarnings(
  options: {
    includeDismissed?: boolean;
    /**
     * Nur die Baustellen dieses Bauleiters. Jeder der drei soll seine
     * eigenen offenen Punkte sehen – eine Liste mit den Sorgen der Kollegen
     * liest niemand zu Ende.
     */
    siteManagerId?: string | null;
  } = {},
) {
  const today = todayIso();
  const horizonEnd = addDays(today, 28);
  const horizonStart = addDays(today, -14);

  const [board, dismissals, communications, changeRequests] = await Promise.all([
    loadBoard(horizonStart, horizonEnd, {
      includeClosed: true,
      ...(options.siteManagerId ? { siteManagerIds: [options.siteManagerId] } : {}),
    }),
    prisma.warningDismissal.findMany(),
    prisma.communication.findMany({
      where: { status: { in: ['NEU', 'IN_PRUEFUNG'] } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    }),
    prisma.changeRequest.findMany({
      where: { status: 'OFFEN' },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  const dismissed = new Set(dismissals.map((d) => d.warningKey));
  const warnings: WarningDTO[] = [];
  const weekEnd = addDays(startOfWeek(today), 6);

  const bucketFor = (date: IsoDate | null, severity: WarningSeverity): WarningBucket => {
    if (severity === 'KRITISCH') return 'KRITISCH';
    if (!date) return 'SPAETER';
    if (date <= today) return 'HEUTE';
    if (date <= weekEnd) return 'DIESE_WOCHE';
    return 'SPAETER';
  };

  const push = (w: Omit<WarningDTO, 'dismissed' | 'bucket'> & { bucket?: WarningBucket }) => {
    warnings.push({
      ...w,
      bucket: w.bucket ?? bucketFor(w.date, w.severity),
      dismissed: dismissed.has(w.key),
    });
  };

  const projectLabel = (p: { orderNumber: string | null; customerName: string; name: string }) =>
    [p.orderNumber, `${p.customerName} – ${p.name}`].filter(Boolean).join(' · ');

  // ---------------------------------------------------------------------
  // Projektbezogene Warnungen
  // ---------------------------------------------------------------------
  const assignmentsByProject = new Map<string, typeof board.assignments>();
  for (const a of board.assignments) {
    const list = assignmentsByProject.get(a.projectId);
    if (list) list.push(a);
    else assignmentsByProject.set(a.projectId, [a]);
  }

  for (const p of board.projects) {
    if (CLOSED_PROJECT_STATUS.includes(p.status)) continue;
    const label = projectLabel(p);
    const own = assignmentsByProject.get(p.id) ?? [];
    const aktive = own.filter((a) => a.status !== 'ABGESAGT');
    const hatPersonal = aktive.some(
      (a) => a.resourceType === 'MITARBEITER' || a.resourceType === 'SUBUNTERNEHMER',
    );
    const start = p.plannedStart;
    const tageBisStart = start ? diffDays(today, start) : null;
    const laeuft = !!start && start <= today && (p.plannedEnd ?? start) >= today;

    if (!start) {
      push({
        key: `no_date:${p.id}`,
        severity: 'HINWEIS',
        category: 'Terminierung',
        title: 'Projekt ohne Termin',
        detail: `${label} hat keinen geplanten Beginn und kann nicht disponiert werden.`,
        projectId: p.id,
        projectLabel: label,
        date: null,
        href: `/projekte?projekt=${p.id}`,
      });
    }

    if (start && tageBisStart !== null && tageBisStart >= 0 && tageBisStart <= 3) {
      push({
        key: `starts_soon:${p.id}:${start}`,
        severity: 'HINWEIS',
        category: 'Beginn',
        title:
          tageBisStart === 0
            ? 'Baustelle beginnt heute'
            : `Baustelle beginnt in ${tageBisStart} Tag(en)`,
        detail: `${label} beginnt am ${formatDateShort(start)}.`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/plantafel?projekt=${p.id}&datum=${start}`,
      });
    }

    if (!hatPersonal && start && tageBisStart !== null && (laeuft || tageBisStart <= 3)) {
      push({
        key: `no_staff:${p.id}:${start}`,
        severity: tageBisStart <= 1 || laeuft ? 'KRITISCH' : 'WARNUNG',
        category: 'Personal',
        title: 'Kein Personal eingeplant',
        detail: laeuft
          ? `${label} läuft, aber es ist kein Mitarbeiter und kein SUB eingeplant.`
          : `${label} beginnt am ${formatDateShort(start)}, aber es wurde kein Mitarbeiter eingeplant.`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/plantafel?projekt=${p.id}&datum=${start}`,
      });
    }

    if (!p.primarySiteManagerId) {
      push({
        key: `no_manager:${p.id}`,
        severity: start && tageBisStart !== null && tageBisStart <= 3 ? 'WARNUNG' : 'HINWEIS',
        category: 'Bauleitung',
        title: 'Baustelle ohne Bauleiter',
        detail: `${label} hat keinen zuständigen Bauleiter.`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/projekte?projekt=${p.id}`,
      });
    }

    if (p.materialStatus === 'OFFEN' && start && tageBisStart !== null && tageBisStart <= 5) {
      push({
        key: `material:${p.id}:${start}`,
        severity: tageBisStart <= 2 ? 'KRITISCH' : 'WARNUNG',
        category: 'Material',
        title: 'Material fehlt',
        detail: `${label} beginnt am ${formatDateShort(start)}. Materialstatus ist OFFEN.`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/projekte?projekt=${p.id}&tab=uebersicht`,
      });
    }

    if (
      p.customerConfirmed !== 'BESTAETIGT' &&
      start &&
      tageBisStart !== null &&
      tageBisStart <= 7 &&
      tageBisStart >= -1
    ) {
      push({
        key: `customer:${p.id}:${start}`,
        severity: p.customerConfirmed === 'ABGELEHNT' ? 'KRITISCH' : 'WARNUNG',
        category: 'Kunde',
        title:
          p.customerConfirmed === 'ABGELEHNT'
            ? 'Kunde hat abgesagt'
            : 'Kunde hat noch nicht bestätigt',
        detail: `${label} – Kundenbestätigung steht aus (Beginn ${formatDateShort(start)}).`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/projekte?projekt=${p.id}`,
      });
    }

    const unbestaetigteSubs = aktive.filter(
      (a) => a.resourceType === 'SUBUNTERNEHMER' && a.status === 'GEPLANT',
    );
    for (const sub of unbestaetigteSubs) {
      if (diffDays(today, sub.startDate) > 7 || diffDays(today, sub.startDate) < -1) continue;
      push({
        key: `sub_unconfirmed:${sub.id}`,
        severity: diffDays(today, sub.startDate) <= 2 ? 'WARNUNG' : 'HINWEIS',
        category: 'Subunternehmer',
        title: 'SUB nicht bestätigt',
        detail: `${sub.resourceLabel} ist am ${formatDateShort(sub.startDate)} für ${label} eingeplant, hat aber noch nicht bestätigt.`,
        projectId: p.id,
        projectLabel: label,
        date: sub.startDate,
        href: `/plantafel?projekt=${p.id}&datum=${sub.startDate}`,
      });
    }

    const unbesetzt = aktive.filter((a) => a.resourceType === 'UNBESETZT');
    for (const slot of unbesetzt) {
      push({
        key: `unfilled:${slot.id}`,
        severity: diffDays(today, slot.startDate) <= 2 ? 'KRITISCH' : 'WARNUNG',
        category: 'Personal',
        title: 'Einsatz unbesetzt',
        detail: `${label}: „${slot.placeholderLabel ?? 'Unbesetzt'}“ am ${formatDateShort(slot.startDate)} ist nicht besetzt.`,
        projectId: p.id,
        projectLabel: label,
        date: slot.startDate,
        href: `/plantafel?projekt=${p.id}&datum=${slot.startDate}`,
      });
    }

    if (p.status === 'IN_AUSFUEHRUNG' && p.plannedEnd && diffDays(p.plannedEnd, today) > 0) {
      push({
        key: `overrun:${p.id}`,
        severity: 'WARNUNG',
        category: 'Laufzeit',
        title: 'Baustelle läuft zu lange',
        detail: `${label} läuft seit ${diffDays(p.plannedEnd, today)} Tag(en) über das geplante Ende (${formatDateShort(p.plannedEnd)}) hinaus.`,
        projectId: p.id,
        projectLabel: label,
        date: p.plannedEnd,
        href: `/projekte?projekt=${p.id}`,
      });
    }

    if (p.status === 'TERMINIERUNG_ERFORDERLICH' || p.status === 'NEU') {
      push({
        key: `needs_scheduling:${p.id}`,
        severity: 'HINWEIS',
        category: 'Terminierung',
        title: 'Planung unvollständig',
        detail: `${label} steht auf „${PROJECT_STATUS_LABEL[p.status]}“.`,
        projectId: p.id,
        projectLabel: label,
        date: start,
        href: `/projekte?projekt=${p.id}`,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Terminueberschneidungen
  // ---------------------------------------------------------------------
  const projectById = new Map(board.projects.map((p) => [p.id, p]));
  for (const [key, projectIds] of Object.entries(board.conflicts)) {
    const [resourceKey, date] = key.split('|');
    const [type, id] = resourceKey.split(':');
    if (date < addDays(today, -1)) continue;
    const sample = board.assignments.find((a) => a.resourceKey === resourceKey);
    const name = sample?.resourceLabel ?? id;
    const names = projectIds
      .map((pid) => projectById.get(pid))
      .filter(Boolean)
      .map((p) => `${p!.customerName} ${p!.name}`);

    const istSub = type === 'SUBUNTERNEHMER';
    push({
      key: `conflict:${resourceKey}:${date}`,
      // Ein SUB darf mehrere Teams haben – deshalb nur Warnung, kein Fehler.
      severity: istSub ? 'WARNUNG' : 'KRITISCH',
      category: 'Überschneidung',
      title: istSub
        ? `${name} ist am selben Tag auf ${projectIds.length} Baustellen geplant`
        : `${name} ist doppelt eingeplant`,
      detail: `${formatDateShort(date)}: ${names.join(' · ')}${
        istSub ? ' (zulässig, wenn mehrere Teams vorhanden sind)' : ''
      }`,
      projectId: projectIds[0] ?? null,
      projectLabel: names[0] ?? null,
      date,
      href: `/plantafel?ansicht=ressourcen&datum=${date}`,
    });
  }

  // ---------------------------------------------------------------------
  // Kommunikation / Aenderungsvorschlaege
  // ---------------------------------------------------------------------
  for (const c of communications) {
    push({
      key: `comm_unchecked:${c.id}`,
      severity: c.status === 'NEU' ? 'WARNUNG' : 'HINWEIS',
      category: 'Kommunikation',
      title: 'Telefonat noch nicht geprüft',
      detail: `${c.customerName ?? c.contactNumber ?? 'Unbekannt'}: ${
        c.summary ?? 'Keine Zusammenfassung vorhanden.'
      }`,
      projectId: c.projectId,
      projectLabel: null,
      date: dbDateToIso(c.occurredAt),
      href: `/kommunikation?eintrag=${c.id}`,
    });
  }

  for (const cr of changeRequests) {
    push({
      key: `change_request:${cr.id}`,
      severity: cr.type === 'TERMIN_AENDERUNG' ? 'KRITISCH' : 'WARNUNG',
      category: 'Änderung',
      title: cr.title,
      detail:
        cr.description ??
        `Offener Änderungsvorschlag${cr.project ? ` für ${cr.project.customerName} ${cr.project.name}` : ''}.`,
      projectId: cr.projectId,
      projectLabel: cr.project ? `${cr.project.customerName} – ${cr.project.name}` : null,
      date: dbDateToIso(cr.createdAt),
      href: `/kommunikation?vorschlag=${cr.id}`,
    });
  }

  const visible = options.includeDismissed ? warnings : warnings.filter((w) => !w.dismissed);

  visible.sort((a, b) => {
    const bucket = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
    if (bucket !== 0) return bucket;
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return (a.date ?? '9999').localeCompare(b.date ?? '9999');
  });

  return visible;
}
