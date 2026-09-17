/**
 * Übersetzung zwischen „Das Programm“ und der Dispo-App.
 *
 * Bewusst reine Funktionen ohne Datenbank und ohne Netz: Genau hier entstehen
 * die Fehler, die man erst Wochen später bemerkt („warum ist die Baustelle
 * plötzlich erledigt?"), deshalb ist jede Regel einzeln prüfbar.
 */
import type { ProjectStatusKey } from '@/lib/labels';
import type { ErpSupplier } from './erp-provider';

// ---------------------------------------------------------------------------
// Projektstatus
// ---------------------------------------------------------------------------

/**
 * ERP-Status → Dispo-Status.
 *
 * Grundsatz: Das ERP bestimmt, WO im kaufmännischen Ablauf ein Projekt steht.
 * Wie weit die Ausführung ist, weiß nur die Dispo. Deshalb übersetzen wir nur
 * die Ränder verbindlich – Anfang („noch nicht terminierbar") und Ende
 * („abgeschlossen") – und lassen die Mitte in Ruhe.
 */
const ERP_STATUS_MAP: Record<string, ProjectStatusKey | null> = {
  // Kaufmännischer Vorlauf: noch keine Baustelle.
  new: 'NEU',
  quotation: 'NEU',
  sales: 'NEU',
  lost: null, // wird gesondert behandelt

  // Beauftragt, aber die Dispo entscheidet über die Terminierung.
  won: 'TERMINIERUNG_ERFORDERLICH',
  active: 'TERMINIERUNG_ERFORDERLICH',
  order_fulfillment: null, // läuft – Dispo-Status nicht anfassen

  // Abgeschlossen.
  invoice: 'FERTIG',
  waiting_for_payment: 'FERTIG',
  closed: 'ERLEDIGT',
};

/** Dispo-Status, die eine bewusste Entscheidung des Disponenten sind. */
const DISPO_EIGENE_STATUS: ProjectStatusKey[] = [
  'GEPLANT',
  'BESTAETIGT',
  'IN_AUSFUEHRUNG',
  'UNTERBROCHEN',
  'WARTEN_AUF_KUNDE',
  'WARTEN_AUF_MATERIAL',
  'WARTEN_AUF_SUB',
  'ABNAHME',
];

export interface StatusEntscheidung {
  /** Neuer Dispo-Status, oder null wenn nichts zu ändern ist. */
  neuerStatus: ProjectStatusKey | null;
  grund: string;
}

/**
 * Entscheidet, ob ein ERP-Status den Dispo-Status überschreiben darf.
 *
 * Eine im ERP abgeschlossene Baustelle wird auch in der Dispo geschlossen –
 * das ist der Fall, den der Disponent erwartet. Umgekehrt darf ein ERP-Status
 * wie „active" eine laufende Planung NICHT zurücksetzen: sonst springt eine
 * Baustelle, die gerade in Ausführung ist, zurück auf „Terminierung
 * erforderlich", nur weil im ERP jemand etwas gespeichert hat.
 */
export function entscheideStatus(
  erpStatus: string | null,
  aktuellerDispoStatus: ProjectStatusKey,
): StatusEntscheidung {
  if (!erpStatus) {
    return { neuerStatus: null, grund: 'Kein Status aus dem ERP übermittelt.' };
  }

  const normalisiert = erpStatus.trim().toLowerCase();

  if (normalisiert === 'lost') {
    return aktuellerDispoStatus === 'ERLEDIGT'
      ? { neuerStatus: null, grund: 'Bereits abgeschlossen.' }
      : { neuerStatus: 'ERLEDIGT', grund: 'Auftrag im ERP verloren.' };
  }

  const ziel = ERP_STATUS_MAP[normalisiert];
  if (ziel === undefined) {
    return { neuerStatus: null, grund: `Unbekannter ERP-Status „${erpStatus}".` };
  }
  if (ziel === null) {
    return { neuerStatus: null, grund: 'ERP-Status lässt die Dispo-Planung bewusst unberührt.' };
  }
  if (ziel === aktuellerDispoStatus) {
    return { neuerStatus: null, grund: 'Status stimmt bereits überein.' };
  }

  // Abschluss setzt sich immer durch.
  if (ziel === 'ERLEDIGT' || ziel === 'FERTIG') {
    return { neuerStatus: ziel, grund: `Im ERP auf „${erpStatus}" gesetzt.` };
  }

  // Sonst: eine laufende Dispo-Planung nicht zurückdrehen.
  if (DISPO_EIGENE_STATUS.includes(aktuellerDispoStatus)) {
    return {
      neuerStatus: null,
      grund: 'Dispo-Planung ist weiter fortgeschritten als der ERP-Status.',
    };
  }

  return { neuerStatus: ziel, grund: `Aus dem ERP übernommen („${erpStatus}").` };
}

// ---------------------------------------------------------------------------
// Subunternehmer unter den Lieferanten erkennen
// ---------------------------------------------------------------------------

/**
 * „Das Programm" kennt keine eigene Gruppe für Subunternehmer – sie sind im
 * Kommentarfeld gekennzeichnet. Wir suchen nach dem Wortstamm „sub", aber nur
 * als eigenes Wort: sonst würde „Substrat" oder „Subunternehmerhaftung
 * ausgeschlossen" einen Lieferanten fälschlich zum SUB machen.
 */
const SUB_MUSTER =
  /(^|[^a-zäöüß])(sub|subunternehmer|subunternehmen|nachunternehmer)([^a-zäöüß]|$)/i;

export function istSubunternehmer(supplier: Pick<ErpSupplier, 'comment' | 'name'>): boolean {
  const text = `${supplier.comment ?? ''} ${supplier.name}`;
  return SUB_MUSTER.test(text);
}

/**
 * Liest das Gewerk aus der Zeile „Tätigkeit: …“ im Kommentarfeld.
 * Mehrere Gewerke werden an Komma und Schrägstrich getrennt.
 */
export function leseGewerke(comment: string | null): string[] {
  if (!comment) return [];
  const treffer = /t[äa]tigkeit\s*:\s*([^\n|]+)/i.exec(comment);
  if (!treffer) return [];
  return treffer[1]
    .split(/[,/]| und /i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length <= 40);
}

/** Ansprechpartner aus „AP bei: …“ lesen, falls vorhanden. */
export function leseAnsprechpartner(comment: string | null): string | null {
  if (!comment) return null;
  const treffer = /ap\s+bei\s*:\s*([^\n|]+)/i.exec(comment);
  return treffer ? treffer[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Personen
// ---------------------------------------------------------------------------

/**
 * Ist dieser ERP-Benutzer ein Bauleiter?
 *
 * Das ERP unterscheidet nicht zwischen Bauleitung und gewerblichen
 * Mitarbeitern. Wer als Projektleiter an mindestens einem Projekt hängt,
 * ist sicher Bauleiter; alle anderen kommen als Mitarbeiter herein und
 * können in der Dispo umgetragen werden.
 */
export function istBauleiter(erpUserId: string, projektleiterIds: Set<string>): boolean {
  return projektleiterIds.has(erpUserId);
}

/** Kürzel aus Vor- und Nachname, z.B. „Carsten Reuter“ → „CR“. */
export function kuerzel(firstName: string, lastName: string): string {
  const a = firstName.trim()[0] ?? '';
  const b = lastName.trim()[0] ?? '';
  return (a + b).toUpperCase() || 'XX';
}

// ---------------------------------------------------------------------------
// Rückrichtung: Dispo-Status → ERP-Status
// ---------------------------------------------------------------------------

/**
 * Position eines ERP-Status im kaufmännischen Ablauf.
 *
 * Gebraucht wird die Reihenfolge für eine einzige, aber wichtige Regel: die
 * Dispo darf ein Projekt im ERP nur *vorwärts* bewegen. Sonst würde ein
 * Disponent, der eine Baustelle versehentlich zurücksetzt, im ERP eine
 * bereits geschriebene Rechnung wieder in die Auftragsabwicklung schieben.
 */
const ERP_REIHENFOLGE: Record<string, number> = {
  new: 0,
  quotation: 1,
  sales: 1,
  won: 2,
  active: 2,
  order_fulfillment: 3,
  invoice: 4,
  waiting_for_payment: 5,
  closed: 6,
};

/** Dispo-Status → ERP-Status. Nur die Schritte, die im ERP etwas bedeuten. */
const DISPO_NACH_ERP: Partial<Record<ProjectStatusKey, string>> = {
  IN_AUSFUEHRUNG: 'order_fulfillment',
  ABNAHME: 'order_fulfillment',
  FERTIG: 'invoice',
  ERLEDIGT: 'closed',
};

export interface RueckschreibEntscheidung {
  /** ERP-Status, der gesetzt werden soll – oder null, wenn nichts zu tun ist. */
  erpStatus: string | null;
  grund: string;
}

/**
 * Entscheidet, ob eine Statusänderung in der Dispo ins ERP geschrieben wird.
 *
 * Bewusst zurückhaltend: geschrieben wird nur, wenn der neue Status im ERP
 * echt weiter vorne liegt als der aktuelle. Planungs-Zwischenstände
 * („warten auf Material") interessieren das ERP nicht und werden geschluckt.
 */
export function entscheideRueckschreiben(
  dispoStatus: ProjectStatusKey,
  aktuellerErpStatus: string | null,
): RueckschreibEntscheidung {
  const ziel = DISPO_NACH_ERP[dispoStatus];
  if (!ziel) {
    return { erpStatus: null, grund: 'Dieser Dispo-Status hat im ERP keine Entsprechung.' };
  }

  const aktuell = (aktuellerErpStatus ?? '').trim().toLowerCase();

  if (aktuell === 'lost') {
    return { erpStatus: null, grund: 'Auftrag ist im ERP als verloren markiert.' };
  }
  if (aktuell === ziel) {
    return { erpStatus: null, grund: 'Status im ERP stimmt bereits.' };
  }

  const rangJetzt = ERP_REIHENFOLGE[aktuell];
  const rangZiel = ERP_REIHENFOLGE[ziel];

  if (rangJetzt === undefined) {
    return {
      erpStatus: null,
      grund: `ERP-Status „${aktuellerErpStatus}" ist unbekannt – es wird nichts überschrieben.`,
    };
  }
  if (rangZiel <= rangJetzt) {
    return {
      erpStatus: null,
      grund: `Das ERP ist bereits bei „${aktuell}" – es wird nicht zurückgesetzt.`,
    };
  }

  return { erpStatus: ziel, grund: `Dispo meldet „${dispoStatus}" an das ERP.` };
}
