/**
 * Ampelsystem (Master-Prompt Abschnitt 9).
 *
 * Die Ampel wird IMMER berechnet, nie gespeichert – gespeicherte Ampeln
 * veralten in dem Moment, in dem sich ein Einsatz aendert. Nur eine bewusste
 * manuelle Uebersteuerung (`trafficLightOverride`) wird persistiert.
 */
import { addDays, diffDays, type IsoDate, todayIso } from '@/lib/dates';
import { CLOSED_PROJECT_STATUS, type TrafficLightKey } from '@/lib/labels';
import type { AssignmentDTO } from '@/lib/types';

export interface AmpelInput {
  status: string;
  plannedStart: IsoDate | null;
  plannedEnd: IsoDate | null;
  materialStatus: string;
  customerConfirmed: string;
  primarySiteManagerId: string | null;
  assignments: AssignmentDTO[];
  /** Eigener Mitarbeiter ist am selben Tag auf einer anderen Baustelle. */
  hasStaffConflict: boolean;
  /** SUB ist am selben Tag mehrfach verplant – zulaessig, aber pruefenswert. */
  hasSubDoubleBooking: boolean;
  /** Offene Aenderungsvorschlaege (z.B. ungeklaerte Terminaenderung). */
  openChangeRequests: number;
}

export interface AmpelResult {
  light: TrafficLightKey;
  reasons: string[];
}

/** Ab wie vielen Tagen vor Beginn wird fehlende Planung kritisch? */
const KRITISCH_VORLAUF_TAGE = 2;
/** Ab wann warnt das System bei offenem Material? */
const MATERIAL_VORLAUF_TAGE = 5;

export function computeAmpel(input: AmpelInput, today: IsoDate = todayIso()): AmpelResult {
  const reasons: string[] = [];

  // Abgeschlossene Projekte sind nie rot – sie sind fertig.
  if (CLOSED_PROJECT_STATUS.includes(input.status as never)) {
    return { light: 'GRUEN', reasons: ['Projekt abgeschlossen'] };
  }

  // Noch nicht terminierbar.
  if (!input.plannedStart) {
    return { light: 'GRAU', reasons: ['Kein geplanter Beginn hinterlegt'] };
  }
  if (input.status === 'NEU' || input.status === 'TERMINIERUNG_ERFORDERLICH') {
    reasons.push('Terminierung noch erforderlich');
  }

  const start = input.plannedStart;
  const end = input.plannedEnd ?? input.plannedStart;
  const tageBisStart = diffDays(today, start);
  const laeuftBereits = tageBisStart <= 0 && diffDays(today, end) >= 0;

  const arbeitsEinsaetze = input.assignments.filter(
    (a) => a.status !== 'ABGESAGT' && a.resourceType !== 'BAULEITER',
  );
  const hatPersonal = arbeitsEinsaetze.some(
    (a) => a.resourceType === 'MITARBEITER' || a.resourceType === 'SUBUNTERNEHMER',
  );
  const unbesetzt = input.assignments.filter(
    (a) => a.resourceType === 'UNBESETZT' && a.status !== 'ABGESAGT',
  );

  // --- ROT: Ausfuehrung gefaehrdet ---
  const rot: string[] = [];

  if (input.customerConfirmed === 'ABGELEHNT') {
    rot.push('Kunde hat abgesagt');
  }
  if (!hatPersonal && (laeuftBereits || tageBisStart <= KRITISCH_VORLAUF_TAGE)) {
    rot.push(
      laeuftBereits
        ? 'Baustelle läuft, aber es ist niemand eingeplant'
        : `Beginn in ${tageBisStart} Tag(en), aber kein Mitarbeiter/SUB eingeplant`,
    );
  }
  // Ein unbesetzter Einsatz ist erst dann kritisch, wenn SEIN Tag naht –
  // nicht schon, weil das Projekt laengst begonnen hat.
  const unbesetztKritisch = unbesetzt.filter(
    (a) => diffDays(today, a.startDate) <= KRITISCH_VORLAUF_TAGE,
  );
  if (unbesetztKritisch.length > 0) {
    rot.push(`${unbesetztKritisch.length} unbesetzte(r) Einsatz/Einsätze in den nächsten Tagen`);
  }
  if (
    input.materialStatus === 'OFFEN' &&
    (laeuftBereits || tageBisStart <= KRITISCH_VORLAUF_TAGE)
  ) {
    rot.push('Material fehlt und Beginn steht unmittelbar bevor');
  }
  if (input.hasStaffConflict) {
    rot.push('Terminüberschneidung beim eingeplanten Personal');
  }
  if (input.openChangeRequests > 0) {
    rot.push(`${input.openChangeRequests} ungeklärte Terminänderung(en) aus Kommunikation`);
  }
  // Einsatz ausserhalb des Planzeitraums.
  const ausserhalb = input.assignments.filter(
    (a) => a.status !== 'ABGESAGT' && (a.startDate < start || a.endDate > addDays(end, 0)),
  );
  if (ausserhalb.length > 0) {
    rot.push('Einsätze liegen außerhalb des geplanten Projektzeitraums');
  }
  if (input.status === 'IN_AUSFUEHRUNG' && diffDays(end, today) > 0) {
    rot.push(`Baustelle läuft ${diffDays(end, today)} Tag(e) über das geplante Ende hinaus`);
  }

  if (rot.length > 0) return { light: 'ROT', reasons: [...rot, ...reasons] };

  // --- GELB: Planung vorhanden, aber etwas ist offen ---
  const gelb: string[] = [];

  if (input.customerConfirmed !== 'BESTAETIGT') {
    gelb.push('Kunde hat den Termin noch nicht bestätigt');
  }
  if (input.materialStatus === 'TEILWEISE') {
    gelb.push('Material nur teilweise vorhanden');
  }
  if (input.materialStatus === 'OFFEN' && tageBisStart <= MATERIAL_VORLAUF_TAGE) {
    gelb.push('Material noch offen');
  }
  if (!input.primarySiteManagerId) {
    gelb.push('Kein Bauleiter zugeordnet');
  }
  if (!hatPersonal) {
    gelb.push('Noch kein Mitarbeiter oder SUB eingeplant');
  }
  if (unbesetzt.length > 0) {
    gelb.push(`${unbesetzt.length} unbesetzte(r) Einsatz/Einsätze`);
  }
  if (input.hasSubDoubleBooking) {
    // Erlaubt – ein SUB kann mehrere Teams haben –, aber der Disponent
    // soll es sehen.
    gelb.push('Ein Subunternehmer ist am selben Tag auf mehreren Baustellen');
  }
  const unbestaetigteSubs = input.assignments.filter(
    (a) => a.resourceType === 'SUBUNTERNEHMER' && a.status === 'GEPLANT',
  );
  if (unbestaetigteSubs.length > 0) {
    gelb.push(`${unbestaetigteSubs.length} SUB-Einsatz/-Einsätze noch nicht bestätigt`);
  }
  if (input.status === 'WARTEN_AUF_KUNDE') gelb.push('Warten auf Kunde');
  if (input.status === 'WARTEN_AUF_MATERIAL') gelb.push('Warten auf Material');
  if (input.status === 'WARTEN_AUF_SUB') gelb.push('Warten auf SUB');
  if (input.status === 'UNTERBROCHEN') gelb.push('Baustelle unterbrochen');

  if (gelb.length > 0) return { light: 'GELB', reasons: [...gelb, ...reasons] };

  return { light: 'GRUEN', reasons: reasons.length ? reasons : ['Vollständig geplant'] };
}

export const AMPEL_CLASS: Record<TrafficLightKey, string> = {
  GRUEN: 'bg-ampel-gruen',
  GELB: 'bg-ampel-gelb',
  ROT: 'bg-ampel-rot',
  GRAU: 'bg-ampel-grau',
};
