/**
 * Übersetzung zwischen „Das Programm“ und der Dispo-App.
 *
 * Bewusst reine Funktionen ohne Datenbank und ohne Netz: Genau hier entstehen
 * die Fehler, die man erst Wochen später bemerkt („warum ist die Baustelle
 * plötzlich erledigt?"), deshalb ist jede Regel einzeln prüfbar.
 */
import { erpStatusName, gehoertAufDieTafel, type ProjectStatusKey } from '@/lib/labels';
import type { ErpSupplier } from './erp-provider';

// ---------------------------------------------------------------------------
// Projektstatus
// ---------------------------------------------------------------------------

/**
 * Welche ERP-Status gehören auf die Plantafel?
 *
 * Bewusst eine **Positivliste**: Gezeigt wird nur, was beauftragt ist oder
 * gerade abgewickelt wird. Alles davor ist Vertrieb, alles danach ist
 * Buchhaltung – beides interessiert die Disposition nicht.
 *
 * Die Liste ist eng, und das ist der Sinn: Beim ersten echten Abgleich kamen
 * 16 Projekte herein, von denen 15 längst erledigt oder nie zum Auftrag
 * geworden waren. Eine Plantafel, auf der solche Zeilen stehen, wird nicht
 * gelesen. Ein unbekannter Status gilt deshalb als „nicht zeigen" – neue
 * Status im ERP fluten die Tafel so nicht von selbst.
 */
const ERP_STATUS_AUF_DER_TAFEL: Record<string, ProjectStatusKey> = {
  // Beauftragt, aber noch nicht terminiert.
  won: 'TERMINIERUNG_ERFORDERLICH',
  // Läuft – wie weit, weiß nur die Dispo.
  order_fulfillment: 'IN_AUSFUEHRUNG',
};

export { gehoertAufDieTafel };

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
 * Entscheidet, welchen Dispo-Status ein ERP-Status nach sich zieht.
 *
 * Zwei Regeln, mehr nicht:
 *
 *  1. Verlässt ein Projekt die Positivliste – abgerechnet, verloren,
 *     abgeschlossen – wird es in der Dispo auf *Erledigt* gesetzt und
 *     verschwindet damit von der Tafel.
 *  2. Steht es auf der Liste, darf der ERP-Status eine laufende Planung
 *     **nicht** zurückdrehen. Sonst springt eine Baustelle, an der gerade
 *     gearbeitet wird, zurück auf „Terminierung erforderlich", nur weil im
 *     ERP jemand etwas gespeichert hat.
 */
export function entscheideStatus(
  erpStatus: string | null,
  aktuellerDispoStatus: ProjectStatusKey,
): StatusEntscheidung {
  if (!erpStatus) {
    return { neuerStatus: null, grund: 'Kein Status aus dem ERP übermittelt.' };
  }

  const normalisiert = erpStatus.trim().toLowerCase();
  const ziel = ERP_STATUS_AUF_DER_TAFEL[normalisiert];

  if (!ziel) {
    return aktuellerDispoStatus === 'ERLEDIGT'
      ? { neuerStatus: null, grund: 'Bereits von der Tafel genommen.' }
      : {
          neuerStatus: 'ERLEDIGT',
          grund: `Im ERP auf „${erpStatusName(erpStatus)}" – gehört nicht auf die Plantafel.`,
        };
  }

  if (ziel === aktuellerDispoStatus) {
    return { neuerStatus: null, grund: 'Status stimmt bereits überein.' };
  }

  // Eine laufende Planung nicht zurückdrehen.
  if (DISPO_EIGENE_STATUS.includes(aktuellerDispoStatus)) {
    return {
      neuerStatus: null,
      grund: 'Dispo-Planung ist weiter fortgeschritten als der ERP-Status.',
    };
  }

  return { neuerStatus: ziel, grund: `Aus dem ERP übernommen („${erpStatusName(erpStatus)}").` };
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
 * Ist dieser Lieferant gesperrt?
 *
 * Gesperrte tragen das Wort irgendwo im Kommentar – oft zusammen mit einem
 * stehengebliebenen „Sub aktiv" weiter unten. Die Sperre gewinnt: Wer nicht
 * mehr beauftragt werden darf, hat auf der Plantafel nichts verloren, egal
 * was sonst noch im Feld steht.
 */
const GESPERRT_MUSTER =
  /(gesperrt|sperre|nicht\s+mehr\s+(aktiv|nutzen|verwenden|beauftragen|einsetzen)|keine\s+zusammenarbeit|zusammenarbeit\s+beendet|\binaktiv\b)/i;

export function istGesperrt(comment: string | null): boolean {
  return comment ? GESPERRT_MUSTER.test(comment) : false;
}

/**
 * Liest die Gewerke aus der Zeile „Tätigkeit: …“ im Kommentarfeld.
 *
 * Die Zeile lautet in der Praxis „Tätigkeit: Subunternehmer – Trockenbau und
 * Innenausbau“. Das Wort „Subunternehmer“ ist dabei die Kennzeichnung, nicht
 * das Gewerk – unbesehen übernommen landet es als Fähigkeit in den Stammdaten
 * und steht dann bei jedem zweiten Betrieb als „Fähigkeit: Subunternehmer“.
 * Es wird deshalb abgeschnitten.
 */
const SUB_PRAEFIX = /^\s*(sub|subunternehmer|subunternehmen|nachunternehmer)\s*[–—:-]\s*/i;

export function leseGewerke(comment: string | null): string[] {
  if (!comment) return [];
  const treffer = /t[äa]tigkeit\s*:\s*([^\n|]+)/i.exec(comment);
  if (!treffer) return [];

  return (
    treffer[1]
      .replace(SUB_PRAEFIX, '')
      .split(/[,/]| und /i)
      // „Bau- und Renovierungsarbeiten“ zerfällt zu „Bau-“ und
      // „Renovierungsarbeiten“; der hängende Bindestrich gehört nicht in einen
      // Stammdatensatz.
      .map((t) =>
        t
          .replace(SUB_PRAEFIX, '')
          .replace(/[\s–—-]+$/, '')
          .trim(),
      )
      .filter((t) => t.length > 1 && t.length <= 40)
      .filter((t) => !/^(sub|subunternehmer|subunternehmen|nachunternehmer)$/i.test(t))
  );
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
