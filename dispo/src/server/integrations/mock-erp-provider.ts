/**
 * Mock-Implementierung von „Das Programm“.
 *
 * Die Datensätze sind den echten nachempfunden: dieselben Statuswerte
 * (`new`, `active`, `order_fulfillment`, `closed`), dieselbe Art, Gewerk und
 * SUB-Kennzeichnung im Kommentarfeld eines Lieferanten unterzubringen.
 * Damit prüft der Mock dieselben Übersetzungsregeln wie die echte API.
 */
import type {
  ErpEmployee,
  ErpProject,
  ErpProvider,
  ErpSupplier,
  ErpSupplierNeu,
} from './erp-provider';

function iso(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const PROJEKTE: ErpProject[] = [
  {
    erpId: 'DP-10047',
    referenceNumber: 'P-2026-47',
    orderNumber: 'AG-260047',
    customerName: 'Daniel Kufner',
    name: 'Badsanierung OG',
    description: 'Komplette Sanierung Bad Obergeschoss',
    street: 'Rosenstraße 12',
    zip: '83624',
    city: 'Otterfing',
    contactName: 'Daniel Kufner',
    contactPhone: '+49 8024 998877',
    contactEmail: 'd.kufner@example.com',
    projectManagerErpId: 'U-CR',
    projectManagerName: 'Carsten Reuter',
    plannedStart: iso(1),
    plannedEnd: iso(2),
    status: 'order_fulfillment',
    updatedAt: iso(-1),
  },
  {
    erpId: 'DP-10051',
    referenceNumber: 'P-2026-51',
    orderNumber: 'AG-260051',
    customerName: 'Müller Immobilien GmbH',
    name: 'Umbau Ladenfläche',
    description: null,
    street: 'Leopoldstraße 88',
    zip: '80802',
    city: 'München',
    contactName: 'Frau Berger',
    contactPhone: '+49 89 4455667',
    contactEmail: 'berger@mueller-immobilien.example',
    projectManagerErpId: 'U-MT',
    projectManagerName: 'Marlon Tschon',
    plannedStart: iso(-2),
    plannedEnd: iso(2),
    status: 'order_fulfillment',
    updatedAt: iso(0),
  },
  {
    erpId: 'DP-10081',
    referenceNumber: 'P-2026-81',
    orderNumber: null,
    customerName: 'Stadtwerke Holzkirchen',
    name: 'Umbau Schalterhalle',
    description: null,
    street: 'Marktplatz 3',
    zip: '83607',
    city: 'Holzkirchen',
    contactName: 'Herr Lindner',
    contactPhone: '+49 8024 445566',
    contactEmail: null,
    projectManagerErpId: 'U-CR',
    projectManagerName: 'Carsten Reuter',
    plannedStart: iso(14),
    plannedEnd: iso(25),
    status: 'won',
    updatedAt: iso(-3),
  },
  {
    erpId: 'DP-10088',
    referenceNumber: 'P-2026-88',
    orderNumber: null,
    customerName: 'Praxis Dr. Ostermeier',
    name: 'Umbau Wartezimmer',
    description: null,
    street: 'Sonnenweg 9',
    zip: '82031',
    city: 'Grünwald',
    contactName: 'Frau Ostermeier',
    contactPhone: '+49 89 223344',
    contactEmail: null,
    projectManagerErpId: null,
    projectManagerName: null,
    plannedStart: null,
    plannedEnd: null,
    status: 'quotation',
    updatedAt: iso(-5),
  },
  {
    erpId: 'DP-10090',
    referenceNumber: 'P-2026-90',
    orderNumber: 'AG-260090',
    customerName: 'Familie Brandl',
    name: 'Dachausbau',
    description: null,
    street: 'Lindenweg 3',
    zip: '83607',
    city: 'Holzkirchen',
    contactName: 'Herr Brandl',
    contactPhone: null,
    contactEmail: null,
    projectManagerErpId: 'U-CR',
    projectManagerName: 'Carsten Reuter',
    plannedStart: iso(-40),
    plannedEnd: iso(-20),
    // Im ERP abgeschlossen – die Dispo muss nachziehen.
    status: 'closed',
    updatedAt: iso(-2),
  },
];

const BENUTZER: ErpEmployee[] = [
  {
    erpId: 'E-1',
    userErpId: 'U-CR',
    firstName: 'Carsten',
    lastName: 'Reuter',
    email: 'c.reuter@mrumbau.example',
    phone: '+49 89 1234567-11',
    role: 'Bauleitung',
    ausgeschieden: false,
  },
  {
    erpId: 'E-2',
    userErpId: 'U-MT',
    firstName: 'Marlon',
    lastName: 'Tschon',
    email: 'm.tschon@mrumbau.example',
    phone: '+49 89 1234567-12',
    role: 'Bauleitung',
    ausgeschieden: false,
  },
  {
    erpId: 'E-3',
    userErpId: 'U-LC',
    firstName: 'Luigi',
    lastName: 'Curatolo',
    email: null,
    phone: '+49 170 1111111',
    role: null,
    ausgeschieden: false,
  },
  {
    erpId: 'E-4',
    userErpId: 'U-GP',
    firstName: 'Gerhard',
    lastName: 'Pettkat',
    email: null,
    phone: '+49 170 3333333',
    role: null,
    ausgeschieden: false,
  },
  {
    erpId: 'E-5',
    userErpId: 'U-NJ',
    firstName: 'Nada',
    lastName: 'Jerinic',
    email: null,
    phone: null,
    role: 'Büro',
    ausgeschieden: false,
  },
  // Ausgeschieden: darf nicht auf der Plantafel landen, und ein bereits
  // angelegter Mitarbeiter muss beim Sync inaktiv werden.
  {
    erpId: 'E-6',
    userErpId: 'U-AV',
    firstName: 'Andreas',
    lastName: 'Vorbei',
    email: null,
    phone: null,
    role: null,
    ausgeschieden: true,
  },
];

const LIEFERANTEN: ErpSupplier[] = [
  {
    erpId: 'L-70301',
    referenceNumber: '70301',
    name: 'Elektro Müller GmbH',
    contactName: null,
    phone: '+49 89 55500-1',
    email: 'info@elektro-mueller.example',
    street: 'Industriestraße 4',
    zip: '81675',
    city: 'München',
    comment: 'Lieferant seit: 12.01.2025 | Sub | AP bei: Stefan Müller\nTätigkeit: Elektro',
  },
  {
    erpId: 'L-70302',
    referenceNumber: '70302',
    name: 'Trockenbau Huber',
    contactName: null,
    phone: '+49 8104 5550-2',
    email: 'buero@trockenbau-huber.example',
    street: 'Dorfstraße 9',
    zip: '85653',
    city: 'Aying',
    comment: 'Subunternehmer | AP bei: Josef Huber\nTätigkeit: Trockenbau und Akustikdecken',
  },
  {
    erpId: 'L-70303',
    referenceNumber: '70303',
    name: 'Sanitär Maier',
    contactName: null,
    phone: '+49 8104 5550-3',
    email: null,
    street: 'Bahnhofstraße 1',
    zip: '83627',
    city: 'Otterfing',
    comment: 'Nachunternehmer\nTätigkeit: Sanitär, Heizung',
  },
  {
    // Kein SUB – ein reiner Materiallieferant. Darf nicht übernommen werden.
    erpId: 'L-70114',
    referenceNumber: '70114',
    name: 'Pfleiderer Deutschland GmbH',
    contactName: null,
    phone: '+49 9181 28-480',
    email: 'info@pfleiderer.com',
    street: 'Ingolstädter Straße 51',
    zip: '92318',
    city: 'Neumarkt in der Oberpfalz',
    comment: 'Lieferant seit: 04.11.2024\nTätigkeit: Holz- und Plattenwerkstoffe',
  },
  {
    // Stolperfalle: „Substrat" darf NICHT als Subunternehmer gelten.
    erpId: 'L-70115',
    referenceNumber: '70115',
    name: 'Garten Grün GmbH',
    contactName: null,
    phone: null,
    email: null,
    street: null,
    zip: '85521',
    city: 'Ottobrunn',
    comment: 'Lieferant seit: 01.03.2025\nTätigkeit: Substrat und Pflanzen',
  },
];

/**
 * Im Mock zurückgeschriebene Status.
 *
 * Bewusst ausserhalb der Klasse: `getErpProvider()` erzeugt bei jedem Aufruf
 * eine neue Instanz, und der Testmodus soll den kompletten Weg zeigen –
 * Status in der Dispo setzen, danach synchronisieren, Wert steht im ERP.
 */
const MOCK_GESCHRIEBEN = new Map<string, string>();

/** Im Testmodus angelegte Lieferanten – damit der Rückweg sichtbar wird. */
const MOCK_NEUE_LIEFERANTEN: ErpSupplier[] = [];

export class MockErpProvider implements ErpProvider {
  readonly name = 'Das Programm (Mock)';
  readonly canWriteBack = true;

  async healthCheck() {
    return { ok: true, message: 'Testmodus – es werden Beispieldaten geliefert.' };
  }

  async getProjects(): Promise<ErpProject[]> {
    // Kleine Latenz, damit sich der Sync-Button im UI realistisch verhält.
    await new Promise((r) => setTimeout(r, 200));
    return PROJEKTE.map((p) => this.mitStatus(p));
  }

  async getProject(erpId: string): Promise<ErpProject | null> {
    const treffer = PROJEKTE.find((p) => p.erpId === erpId);
    return treffer ? this.mitStatus(treffer) : null;
  }

  async setProjectStatus(erpId: string, erpStatus: string): Promise<void> {
    if (!PROJEKTE.some((p) => p.erpId === erpId)) {
      throw new Error(`Projekt ${erpId} gibt es im ERP nicht.`);
    }
    MOCK_GESCHRIEBEN.set(erpId, erpStatus);
  }

  private mitStatus(p: ErpProject): ErpProject {
    const ueberschrieben = MOCK_GESCHRIEBEN.get(p.erpId);
    return ueberschrieben ? { ...p, status: ueberschrieben } : p;
  }

  async getEmployees(): Promise<ErpEmployee[]> {
    return BENUTZER;
  }

  async getSuppliers(): Promise<ErpSupplier[]> {
    return [...LIEFERANTEN, ...MOCK_NEUE_LIEFERANTEN];
  }

  /** Legt an und liefert ihn beim nächsten Abgleich mit zurück. */
  async createSupplier(daten: ErpSupplierNeu) {
    // Die laufende Nummer darf sich nach einem Neustart nicht wiederholen –
    // sonst kollidiert sie mit einer ID, die in der Datenbank schon steht.
    const nummer = `L-MOCK-${Date.now().toString(36)}${MOCK_NEUE_LIEFERANTEN.length}`;
    MOCK_NEUE_LIEFERANTEN.push({
      erpId: `mock-${nummer}`,
      referenceNumber: nummer,
      name: daten.name,
      contactName: null,
      phone: daten.phone,
      email: daten.email,
      street: [daten.street, daten.houseNumber].filter(Boolean).join(' ') || null,
      zip: daten.zip,
      city: daten.city,
      comment: daten.comment,
    });
    return { erpId: `mock-${nummer}`, referenceNumber: nummer };
  }

  async verfuegbareMutationen() {
    return ['createProject', 'createSupplier', 'updateProject'];
  }
}
