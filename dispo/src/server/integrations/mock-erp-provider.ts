/**
 * Mock-Implementierung von „Das Programm“.
 *
 * Liefert plausible Auftragsdaten, solange keine echte API-Verbindung
 * besteht. Nutzt dieselbe Schnittstelle wie der spaetere echte Provider –
 * ein Austausch erfordert keine Aenderung am uebrigen Code.
 */
import type { ErpProject, ErpProvider } from './erp-provider';

function iso(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const MOCK_PROJECTS: ErpProject[] = [
  {
    erpId: 'DP-10047',
    orderNumber: 'AG-260047',
    projectNumber: 'P-2026-047',
    customerName: 'Daniel Kufner',
    name: 'Badsanierung OG',
    street: 'Rosenstraße 12',
    zip: '83624',
    city: 'Otterfing',
    contactName: 'Daniel Kufner',
    contactPhone: '+49 8024 998877',
    contactEmail: 'd.kufner@example.com',
    siteManagerName: 'Carsten Reuter',
    plannedStart: iso(1),
    plannedEnd: iso(2),
    status: 'freigegeben',
  },
  {
    erpId: 'DP-10051',
    orderNumber: 'AG-260051',
    projectNumber: 'P-2026-051',
    customerName: 'Müller Immobilien GmbH',
    name: 'Umbau Ladenfläche',
    street: 'Leopoldstraße 88',
    zip: '80802',
    city: 'München',
    contactName: 'Frau Berger',
    contactPhone: '+49 89 4455667',
    contactEmail: 'berger@mueller-immobilien.example',
    siteManagerName: 'Marlon Tschon',
    plannedStart: iso(-2),
    plannedEnd: iso(2),
    status: 'in Ausführung',
  },
  {
    erpId: 'DP-10081',
    orderNumber: 'AG-260081',
    projectNumber: 'P-2026-081',
    customerName: 'Stadtwerke Holzkirchen',
    name: 'Umbau Schalterhalle',
    street: 'Marktplatz 3',
    zip: '83607',
    city: 'Holzkirchen',
    contactName: 'Herr Lindner',
    contactPhone: '+49 8024 445566',
    contactEmail: 'lindner@stadtwerke-hk.example',
    siteManagerName: 'Carsten Reuter',
    plannedStart: iso(14),
    plannedEnd: iso(25),
    status: 'beauftragt',
  },
  {
    erpId: 'DP-10088',
    orderNumber: 'AG-260088',
    projectNumber: 'P-2026-088',
    customerName: 'Praxis Dr. Ostermeier',
    name: 'Umbau Wartezimmer',
    street: 'Sonnenweg 9',
    zip: '82031',
    city: 'Grünwald',
    contactName: 'Frau Ostermeier',
    contactPhone: '+49 89 223344',
    contactEmail: null,
    siteManagerName: null,
    plannedStart: iso(21),
    plannedEnd: iso(24),
    status: 'beauftragt',
  },
];

export class MockErpProvider implements ErpProvider {
  readonly name = 'Das Programm (Mock)';

  async getProjects(): Promise<ErpProject[]> {
    // Kleine Latenz, damit sich der Sync-Button im UI realistisch verhält.
    await new Promise((r) => setTimeout(r, 250));
    return MOCK_PROJECTS;
  }

  async getProject(erpId: string): Promise<ErpProject | null> {
    return MOCK_PROJECTS.find((p) => p.erpId === erpId) ?? null;
  }
}
