/**
 * Echter Provider fuer „Das Programm“.
 *
 * Platzhalter mit fertiger Struktur: sobald Basis-URL und API-Key vorliegen,
 * muss nur noch `mapProject` an das tatsaechliche Antwortformat angepasst
 * werden. Die Schnittstelle bleibt identisch zum Mock.
 */
import type { ErpProject, ErpProvider } from './erp-provider';

export class DasProgrammProvider implements ErpProvider {
  readonly name = 'Das Programm';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    if (!baseUrl) throw new Error('DAS_PROGRAMM_BASE_URL ist nicht gesetzt.');
    if (!apiKey) throw new Error('DAS_PROGRAMM_API_KEY ist nicht gesetzt.');
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      // Secrets bleiben serverseitig – dieser Code läuft nie im Browser.
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Das Programm antwortete mit ${res.status} ${res.statusText}.`);
    }
    return (await res.json()) as T;
  }

  async getProjects(): Promise<ErpProject[]> {
    const data = await this.request<{ items?: unknown[] }>('/projects');
    return (data.items ?? []).map((item) => mapProject(item as Record<string, unknown>));
  }

  async getProject(erpId: string): Promise<ErpProject | null> {
    try {
      const data = await this.request<Record<string, unknown>>(
        `/projects/${encodeURIComponent(erpId)}`,
      );
      return mapProject(data);
    } catch {
      return null;
    }
  }
}

/**
 * Übersetzt die ERP-Antwort in unser Modell.
 * Die Feldnamen sind bewusst defensiv gelesen – die genaue Struktur wird
 * beim Anschluss der echten API verifiziert.
 */
function mapProject(raw: Record<string, unknown>): ErpProject {
  const str = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return null;
  };
  const date = (...keys: string[]): string | null => {
    const v = str(...keys);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  const erpId = str('id', 'projectId', 'projektId');
  if (!erpId) throw new Error('ERP-Datensatz ohne ID erhalten.');

  return {
    erpId,
    orderNumber: str('orderNumber', 'auftragsnummer', 'salesOrderNumber'),
    projectNumber: str('projectNumber', 'projektnummer'),
    customerName: str('customerName', 'kunde', 'customer') ?? 'Unbekannter Kunde',
    name: str('name', 'projektname', 'subject') ?? 'Unbenanntes Projekt',
    street: str('street', 'strasse', 'addressStreet'),
    zip: str('zip', 'plz', 'postalCode'),
    city: str('city', 'ort'),
    contactName: str('contactName', 'ansprechpartner'),
    contactPhone: str('contactPhone', 'telefon', 'phone'),
    contactEmail: str('contactEmail', 'email'),
    siteManagerName: str('projectManager', 'bauleiter', 'projektleiter'),
    plannedStart: date('startDate', 'beginn', 'plannedStart'),
    plannedEnd: date('endDate', 'ende', 'plannedEnd'),
    status: str('status', 'projektstatus'),
  };
}
