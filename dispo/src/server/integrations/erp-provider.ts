/**
 * Integrationsschicht zu „Das Programm“ (Master-Prompt Abschnitt 16 + 44).
 *
 * Die restliche Anwendung kennt ausschliesslich dieses Interface. Ob dahinter
 * der Mock oder die echte GraphQL-API steckt, entscheidet eine
 * Umgebungsvariable – getauscht wird nur die Implementierung.
 */

export interface ErpProject {
  /** Stabile ID im ERP. Schluessel fuer den Abgleich. */
  erpId: string;
  /** Projektnummer, z.B. P-2026-47. */
  referenceNumber: string | null;
  /** Auftragsnummer, falls ein Auftrag am Projekt haengt. */
  orderNumber: string | null;
  customerName: string;
  name: string;
  description: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** ERP-Benutzer-ID des Projektleiters. */
  projectManagerErpId: string | null;
  projectManagerName: string | null;
  plannedStart: string | null; // YYYY-MM-DD
  plannedEnd: string | null;
  /** Roh-Status aus dem ERP (new, active, order_fulfillment, closed, …). */
  status: string | null;
  /** Wann der Datensatz im ERP zuletzt geaendert wurde – fuer den Abgleich. */
  updatedAt: string | null;
}

/**
 * Ein Mitarbeiter aus „Das Programm“ (`employeeSearch` / `employee`).
 *
 * Bauleiter und gewerbliche Mitarbeiter stehen dort in derselben Liste. Wer
 * Bauleiter ist, verrät erst das Projekt: dessen `projectManagerId` zeigt auf
 * einen Benutzer (User), nicht auf den Personalstammsatz – deshalb führen wir
 * beide IDs mit.
 */
export interface ErpEmployee {
  /** ID des Personalstammsatzes. */
  erpId: string;
  /** ID des zugehörigen Logins, falls vorhanden. Passt zu `projectManagerErpId`. */
  userErpId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Rolle/Funktion, soweit das ERP sie kennt. */
  role: string | null;
  /** Archiviert oder Vertrag ausgelaufen – gehört nicht mehr auf die Plantafel. */
  ausgeschieden: boolean;
}

/**
 * Ein Lieferant aus „Das Programm“. Subunternehmer sind dort nicht eigens
 * gruppiert – sie werden im Kommentarfeld als solche gekennzeichnet.
 */
export interface ErpSupplier {
  erpId: string;
  referenceNumber: string | null;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  /** Freitext. Enthaelt u.a. „Tätigkeit: …“ und die SUB-Kennzeichnung. */
  comment: string | null;
}

export interface ErpProvider {
  readonly name: string;
  /** Laeuft die Verbindung ueberhaupt? Fuer die Anzeige in den Einstellungen. */
  healthCheck(): Promise<{ ok: boolean; message: string }>;
  getProjects(): Promise<ErpProject[]>;
  getProject(erpId: string): Promise<ErpProject | null>;
  getEmployees(): Promise<ErpEmployee[]>;
  getSuppliers(): Promise<ErpSupplier[]>;
  /**
   * Schreibt den Projektstatus zurueck ins ERP.
   *
   * Absichtlich die einzige schreibende Operation: alles andere gehoert dem
   * ERP, und je weniger die Dispo dort anfasst, desto weniger kann sie
   * kaputtmachen. `null` bedeutet: dieser Provider kann nicht zurueckschreiben.
   */
  setProjectStatus?(erpId: string, erpStatus: string): Promise<void>;
  /** Ist das Zurueckschreiben eingeschaltet und konfiguriert? */
  readonly canWriteBack: boolean;
}
