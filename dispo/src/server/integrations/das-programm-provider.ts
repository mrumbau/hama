/**
 * Echter Provider für „Das Programm“ (GraphQL).
 *
 * Die Feldnamen stammen aus den tatsächlichen Datensätzen des Systems.
 * Was noch fehlt, sind Endpunkt und Authentifizierungs-Header – beides steht
 * in der Hersteller-Dokumentation und wird über Umgebungsvariablen gesetzt,
 * damit hier nichts fest verdrahtet ist:
 *
 *   DAS_PROGRAMM_GRAPHQL_URL   z.B. https://.../graphql
 *   DAS_PROGRAMM_API_KEY       der Schlüssel
 *   DAS_PROGRAMM_AUTH_HEADER   Name des Headers (Standard: Authorization)
 *   DAS_PROGRAMM_AUTH_PREFIX   Präfix vor dem Schlüssel (Standard: "Bearer ")
 */
import type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';

interface GraphQLAntwort<T> {
  data?: T;
  errors?: { message: string }[];
}

export class DasProgrammProvider implements ErpProvider {
  readonly name = 'Das Programm';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly authHeader = 'Authorization',
    private readonly authPrefix = 'Bearer ',
  ) {
    if (!endpoint) throw new Error('DAS_PROGRAMM_GRAPHQL_URL ist nicht gesetzt.');
    if (!apiKey) throw new Error('DAS_PROGRAMM_API_KEY ist nicht gesetzt.');
  }

  private async anfrage<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [this.authHeader]: `${this.authPrefix}${this.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
      // Secrets bleiben serverseitig – dieser Code läuft nie im Browser.
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Das Programm antwortete mit ${res.status} ${res.statusText}.`);
    }

    const body = (await res.json()) as GraphQLAntwort<T>;
    if (body.errors?.length) {
      throw new Error(`Das Programm meldet: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (!body.data) throw new Error('Das Programm lieferte keine Daten.');
    return body.data;
  }

  async healthCheck() {
    try {
      // Eine Seite mit einem Datensatz genügt als Lebenszeichen.
      await this.anfrage<{ queryProjects: { resultList: unknown[] } }>(QUERY_PROJECTS, {
        limit: 1,
        currentPage: 0,
      });
      return { ok: true, message: 'Verbindung steht.' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Unbekannter Fehler.' };
    }
  }

  async getProjects(): Promise<ErpProject[]> {
    const alle: ErpProject[] = [];
    // Seitenweise lesen, damit auch ein paar hundert Projekte ankommen.
    for (let seite = 0; seite < 50; seite++) {
      const data = await this.anfrage<{ queryProjects: { resultList: RohProjekt[] } }>(
        QUERY_PROJECTS,
        { limit: 100, currentPage: seite },
      );
      const liste = data.queryProjects?.resultList ?? [];
      alle.push(...liste.map(mapProjekt));
      if (liste.length < 100) break;
    }
    return alle;
  }

  async getProject(erpId: string): Promise<ErpProject | null> {
    const data = await this.anfrage<{ queryProjects: { resultList: RohProjekt[] } }>(
      QUERY_PROJECTS,
      { limit: 1, currentPage: 0, filterBy: { id: { valueList: [erpId] } } },
    );
    const roh = data.queryProjects?.resultList?.[0];
    return roh ? mapProjekt(roh) : null;
  }

  async getEmployees(): Promise<ErpEmployee[]> {
    const data = await this.anfrage<{ queryUser: { resultList: RohBenutzer[] } }>(QUERY_USERS, {
      limit: 200,
      currentPage: 0,
    });
    return (data.queryUser?.resultList ?? []).map((u) => ({
      erpId: u.id,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      email: u.email ?? null,
      phone: u.phone ?? u.mobile ?? null,
      role: u.role ?? null,
    }));
  }

  async getSuppliers(): Promise<ErpSupplier[]> {
    const alle: ErpSupplier[] = [];
    for (let seite = 0; seite < 50; seite++) {
      const data = await this.anfrage<{ querySupplier: { resultList: RohLieferant[] } }>(
        QUERY_SUPPLIERS,
        { limit: 100, currentPage: seite },
      );
      const liste = data.querySupplier?.resultList ?? [];
      alle.push(
        ...liste.map((s) => ({
          erpId: s.id,
          referenceNumber: s.referenceNumber ?? null,
          name: s.name ?? 'Unbenannt',
          contactName: null,
          phone: s.phone ?? null,
          email: s.email ?? null,
          street: [s.street, s.houseNumber].filter(Boolean).join(' ') || null,
          zip: s.zip ?? null,
          city: s.city ?? null,
          comment: s.comment ?? null,
        })),
      );
      if (liste.length < 100) break;
    }
    return alle;
  }
}

// ---------------------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------------------

const QUERY_PROJECTS = `
  query Projekte($limit: Int, $currentPage: Int, $filterBy: ProjectFilter) {
    queryProjects(limit: $limit, currentPage: $currentPage, filterBy: $filterBy) {
      resultList {
        id name description referenceNumber status
        street houseNumber zip city
        firstName lastName companyName
        projectManagerId
        createdOn updatedOn
      }
    }
  }
`;

const QUERY_USERS = `
  query Benutzer($limit: Int, $currentPage: Int) {
    queryUser(limit: $limit, currentPage: $currentPage) {
      resultList { id firstName lastName email phone mobile role }
    }
  }
`;

const QUERY_SUPPLIERS = `
  query Lieferanten($limit: Int, $currentPage: Int) {
    querySupplier(limit: $limit, currentPage: $currentPage) {
      resultList {
        id referenceNumber name
        street houseNumber zip city
        phone email comment
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Rohformen und Übersetzung
// ---------------------------------------------------------------------------

interface RohProjekt {
  id: string;
  name?: string;
  description?: string;
  referenceNumber?: string;
  status?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  projectManagerId?: string;
  createdOn?: string;
  updatedOn?: string;
}

interface RohBenutzer {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  role?: string;
}

interface RohLieferant {
  id: string;
  referenceNumber?: string;
  name?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  phone?: string;
  email?: string;
  comment?: string;
}

/** Der Kundenname steht je nach Kundentyp in `companyName` oder im Personennamen. */
export function mapProjekt(roh: RohProjekt): ErpProject {
  const person = [roh.firstName, roh.lastName].filter(Boolean).join(' ').trim();
  return {
    erpId: roh.id,
    referenceNumber: roh.referenceNumber ?? null,
    orderNumber: null, // Aufträge hängen separat am Projekt
    customerName: roh.companyName || person || roh.name || 'Unbekannter Kunde',
    name: roh.name ?? 'Unbenanntes Projekt',
    description: roh.description ?? null,
    street: [roh.street, roh.houseNumber].filter(Boolean).join(' ') || null,
    zip: roh.zip ?? null,
    city: roh.city ?? null,
    contactName: person || null,
    contactPhone: null,
    contactEmail: null,
    projectManagerErpId: roh.projectManagerId ?? null,
    projectManagerName: null,
    plannedStart: null, // Termine kommen aus den Aktivitäten, nicht vom Projekt
    plannedEnd: null,
    status: roh.status ?? null,
    updatedAt: roh.updatedOn ?? null,
  };
}
