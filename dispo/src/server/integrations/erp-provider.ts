/**
 * Integrationsschicht zu „Das Programm“ (Master-Prompt Abschnitt 16 + 44).
 *
 * Die restliche Anwendung kennt ausschliesslich dieses Interface. Ob dahinter
 * der Mock oder die echte API steckt, entscheidet eine Umgebungsvariable –
 * getauscht wird nur die Implementierung, kein Aufrufer.
 */

export interface ErpProject {
  /** Stabile ID im ERP. Schluessel fuer den Abgleich. */
  erpId: string;
  orderNumber: string | null;
  projectNumber: string | null;
  customerName: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Name des Projektleiters/Bauleiters, soweit im ERP gepflegt. */
  siteManagerName: string | null;
  plannedStart: string | null; // YYYY-MM-DD
  plannedEnd: string | null;
  /** Roh-Status aus dem ERP. Die Zuordnung erfolgt in der Sync-Schicht. */
  status: string | null;
}

export interface ErpProvider {
  readonly name: string;
  getProjects(): Promise<ErpProject[]>;
  getProject(erpId: string): Promise<ErpProject | null>;
}
