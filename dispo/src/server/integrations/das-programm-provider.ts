/**
 * Echter Provider für „Das Programm“ (GraphQL).
 *
 * Gebaut streng nach der Hersteller-Dokumentation: Listen kommen aus den
 * `…Search`-Abfragen, Details aus den Einzelobjekt-Abfragen. Es werden
 * ausschliesslich dokumentierte Felder angefragt – GraphQL bricht die ganze
 * Abfrage ab, sobald ein Feld nicht existiert, also wird hier nichts geraten.
 *
 * Konfiguration über Umgebungsvariablen:
 *   DAS_PROGRAMM_GRAPHQL_URL   Standard: https://app.das-programm.io/api/graphql
 *   DAS_PROGRAMM_API_KEY       der Schlüssel
 *   DAS_PROGRAMM_AUTH_HEADER   Name des Headers (Standard: Authorization)
 *   DAS_PROGRAMM_AUTH_PREFIX   Präfix vor dem Schlüssel (Standard: "Bearer ")
 *   DAS_PROGRAMM_WRITEBACK=1   erlaubt das Zurückschreiben des Projektstatus
 */
import type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';

export const DAS_PROGRAMM_STANDARD_URL = 'https://app.das-programm.io/api/graphql';

/** Wieviele Datensätze pro Seite. */
const SEITE = 100;
/** Wieviele Einzelabfragen in einer Anfrage gebündelt werden. */
const BUENDEL = 25;
/** Nach so vielen Seiten wird abgebrochen – Schutz vor Endlosschleifen. */
const MAX_SEITEN = 50;

interface GraphQLAntwort<T> {
  data?: T;
  errors?: { message: string }[];
}

export class DasProgrammProvider implements ErpProvider {
  readonly name = 'Das Programm';
  readonly canWriteBack: boolean;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly authHeader = 'Authorization',
    private readonly authPrefix = 'Bearer ',
    writeBack = false,
  ) {
    if (!endpoint) throw new Error('DAS_PROGRAMM_GRAPHQL_URL ist nicht gesetzt.');
    if (!apiKey) throw new Error('DAS_PROGRAMM_API_KEY ist nicht gesetzt.');
    this.canWriteBack = writeBack;
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
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      // Der Text hilft beim Einrichten mehr als der blosse Statuscode:
      // ein falscher Auth-Header sieht sonst aus wie ein defekter Server.
      const text = await res.text().catch(() => '');
      const zusatz = text.trim().slice(0, 300);
      throw new Error(
        `Das Programm antwortete mit ${res.status} ${res.statusText}.` +
          (zusatz ? ` Antwort: ${zusatz}` : ''),
      );
    }

    const body = (await res.json()) as GraphQLAntwort<T>;
    if (body.errors?.length) {
      throw new Error(`Das Programm meldet: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (!body.data) throw new Error('Das Programm lieferte keine Daten.');
    return body.data;
  }

  /** Liest eine `…Search`-Abfrage seitenweise vollständig aus. */
  private async alleSeiten<T>(query: string, feld: string): Promise<T[]> {
    const alle: T[] = [];
    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      const data = await this.anfrage<Record<string, T[]>>(query, {
        request: { limit: SEITE, offset: seite * SEITE },
      });
      const liste = data[feld] ?? [];
      alle.push(...liste);
      if (liste.length < SEITE) break;
    }
    return alle;
  }

  /**
   * Holt Einzelobjekte gebündelt: eine Abfrage mit mehreren Aliassen statt
   * einer Anfrage je Datensatz. Bei 200 Mitarbeitern sind das 8 Anfragen
   * statt 200.
   */
  private async details<T>(
    wurzel: 'project' | 'employee' | 'supplier',
    ids: string[],
    felder: string,
  ): Promise<Map<string, T>> {
    const ergebnis = new Map<string, T>();
    for (let i = 0; i < ids.length; i += BUENDEL) {
      const teil = ids.slice(i, i + BUENDEL);
      const deklaration = teil.map((_, n) => `$id${n}: ID`).join(', ');
      const rumpf = teil.map((_, n) => `d${n}: ${wurzel}(id: $id${n}) { ${felder} }`).join('\n');
      const variables = Object.fromEntries(teil.map((id, n) => [`id${n}`, id]));
      const data = await this.anfrage<Record<string, T | null>>(
        `query Details(${deklaration}) {\n${rumpf}\n}`,
        variables,
      );
      teil.forEach((id, n) => {
        const treffer = data[`d${n}`];
        if (treffer) ergebnis.set(id, treffer);
      });
    }
    return ergebnis;
  }

  async healthCheck() {
    try {
      // Die Statusliste ist die billigste Abfrage und braucht keine Rechte
      // auf Kundendaten.
      const data = await this.anfrage<{ projectStatusSearch: { id: string }[] }>(
        QUERY_PROJECT_STATUS,
        { request: { limit: 1, offset: 0 } },
      );
      const anzahl = data.projectStatusSearch?.length ?? 0;
      return {
        ok: true,
        message: `Verbindung steht (${anzahl > 0 ? 'Projektstatus gelesen' : 'keine Projektstatus hinterlegt'}).`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Unbekannter Fehler.' };
    }
  }

  async getProjects(): Promise<ErpProject[]> {
    const treffer = await this.alleSeiten<RohProjektSuche>(QUERY_PROJECT_SEARCH, 'projectSearch');
    const details = await this.details<RohProjektDetail>(
      'project',
      treffer.map((t) => t.id),
      PROJEKT_FELDER,
    );
    return treffer.map((t) => mapProjekt(t, details.get(t.id) ?? null));
  }

  async getProject(erpId: string): Promise<ErpProject | null> {
    const data = await this.anfrage<{ project: RohProjektDetail | null }>(QUERY_PROJECT, {
      id: erpId,
    });
    return data.project ? mapProjekt(null, data.project) : null;
  }

  async getEmployees(): Promise<ErpEmployee[]> {
    const treffer = await this.alleSeiten<RohMitarbeiterSuche>(
      QUERY_EMPLOYEE_SEARCH,
      'employeeSearch',
    );
    // Archivierte Mitarbeiter brauchen keine Detailabfrage.
    const aktiv = treffer.filter((t) => !t.deletedOn);
    const details = await this.details<RohMitarbeiterDetail>(
      'employee',
      aktiv.map((t) => t.id),
      MITARBEITER_FELDER,
    );

    return treffer.map((t) => {
      const d = details.get(t.id) ?? null;
      const vertragEnde = d?.contractEnd ? d.contractEnd.slice(0, 10) : null;
      const heute = new Date().toISOString().slice(0, 10);
      return {
        erpId: t.id,
        userErpId: d?.userId ?? null,
        firstName: t.firstName ?? '',
        lastName: t.lastName ?? '',
        email: t.email ?? d?.email ?? null,
        phone: d?.mobile ?? d?.phone ?? null,
        role: null, // „Das Programm" führt keine Funktion am Mitarbeiter.
        ausgeschieden: Boolean(t.deletedOn) || (vertragEnde !== null && vertragEnde < heute),
      };
    });
  }

  async getSuppliers(): Promise<ErpSupplier[]> {
    const treffer = await this.alleSeiten<RohLieferantSuche>(
      QUERY_SUPPLIER_SEARCH,
      'supplierSearch',
    );
    // Nur für die Subunternehmer lohnt die Detailabfrage – Materiallieferanten
    // interessieren die Dispo nicht, und es sind meist deutlich mehr.
    const { istSubunternehmer } = await import('./mapping');
    const relevant = treffer.filter((t) =>
      istSubunternehmer({ comment: t.comment ?? null, name: t.name ?? '' }),
    );
    const details = await this.details<RohLieferantDetail>(
      'supplier',
      relevant.map((t) => t.id),
      LIEFERANT_FELDER,
    );

    return treffer.map((t) => {
      const d = details.get(t.id) ?? null;
      const ap = d?.contactPersonList?.[0];
      return {
        erpId: t.id,
        referenceNumber: t.referenceNumber ?? null,
        name: t.name ?? 'Unbenannt',
        contactName: ap
          ? [ap.firstName, ap.lastName].filter(Boolean).join(' ').trim() || null
          : null,
        phone: d?.phone ?? null,
        email: d?.email ?? null,
        street: [t.street, d?.houseNumber].filter(Boolean).join(' ') || null,
        zip: t.zip ?? null,
        city: t.city ?? null,
        comment: t.comment ?? null,
      };
    });
  }

  async setProjectStatus(erpId: string, erpStatus: string): Promise<void> {
    if (!this.canWriteBack) {
      throw new Error('Zurückschreiben ist nicht eingeschaltet (DAS_PROGRAMM_WRITEBACK).');
    }
    await this.anfrage<{ updateProject: { id: string } }>(MUTATION_UPDATE_PROJECT, {
      input: { id: erpId, status: erpStatus },
    });
  }
}

// ---------------------------------------------------------------------------
// Abfragen – jedes Feld steht so in der Hersteller-Dokumentation.
// ---------------------------------------------------------------------------

const QUERY_PROJECT_STATUS = `
  query Projektstatus($request: QueryRequest) {
    projectStatusSearch(request: $request) { id name position }
  }
`;

const QUERY_PROJECT_SEARCH = `
  query Projekte($request: QueryRequest) {
    projectSearch(request: $request) {
      id referenceNumber name status
      projectStatusId projectManagerId
      firstName lastName companyName
      street zip city
      updatedOn
    }
  }
`;

const PROJEKT_FELDER = `
  id referenceNumber name description status
  startDate endDate
  projectManagerId
  createdOn updatedOn
  customer { id firstName lastName companyName }
  projectManager { id firstName lastName }
  objectAddress { id street city }
  salesOrderList { id referenceNumber name }
`;

const QUERY_PROJECT = `
  query Projekt($id: ID) {
    project(id: $id) { ${PROJEKT_FELDER} }
  }
`;

const QUERY_EMPLOYEE_SEARCH = `
  query Mitarbeiter($request: QueryRequest) {
    employeeSearch(request: $request) {
      id referenceNumber firstName lastName email
      street zip city deletedOn
    }
  }
`;

// Bewusst ohne Gehaltsdaten: die Dispo hat dort nichts zu suchen.
const MITARBEITER_FELDER = `id firstName lastName email phone mobile userId contractEnd`;

const QUERY_SUPPLIER_SEARCH = `
  query Lieferanten($request: QueryRequest) {
    supplierSearch(request: $request) {
      id referenceNumber name street zip city comment
    }
  }
`;

const LIEFERANT_FELDER = `
  id name houseNumber phone email comment
  contactPersonList { id firstName lastName }
`;

const MUTATION_UPDATE_PROJECT = `
  mutation StatusZurueckschreiben($input: ProjectInputObjectType) {
    updateProject(input: $input) { id referenceNumber name status }
  }
`;

// ---------------------------------------------------------------------------
// Rohformen und Übersetzung
// ---------------------------------------------------------------------------

interface RohProjektSuche {
  id: string;
  referenceNumber?: string | null;
  name?: string | null;
  status?: string | null;
  projectStatusId?: string | null;
  projectManagerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  updatedOn?: string | null;
}

interface RohProjektDetail {
  id: string;
  referenceNumber?: string | null;
  name?: string | null;
  description?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  projectManagerId?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
  customer?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
  } | null;
  projectManager?: { id: string; firstName?: string | null; lastName?: string | null } | null;
  objectAddress?: { id: string; street?: string | null; city?: string | null } | null;
  salesOrderList?: { id: string; referenceNumber?: string | null; name?: string | null }[] | null;
}

interface RohMitarbeiterSuche {
  id: string;
  referenceNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  deletedOn?: boolean | null;
}

interface RohMitarbeiterDetail {
  id: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  userId?: string | null;
  contractEnd?: string | null;
}

interface RohLieferantSuche {
  id: string;
  referenceNumber?: string | null;
  name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  comment?: string | null;
}

interface RohLieferantDetail {
  id: string;
  houseNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPersonList?: { id: string; firstName?: string | null; lastName?: string | null }[] | null;
}

/** `SiestaDateTime` ist ISO 8601 – die Dispo rechnet in reinen Kalendertagen. */
function nurDatum(wert: string | null | undefined): string | null {
  if (!wert) return null;
  const treffer = /^(\d{4}-\d{2}-\d{2})/.exec(wert);
  return treffer ? treffer[1] : null;
}

/**
 * Setzt ein Projekt aus Such- und Detailtreffer zusammen.
 *
 * Die Adresse ist der heikle Teil: `projectSearch` liefert die Anschrift des
 * Kunden, die Baustelle steht aber in `objectAddress`. Für die Dispo zählt,
 * wo gearbeitet wird – die Objektadresse hat deshalb Vorrang.
 */
export function mapProjekt(
  suche: RohProjektSuche | null,
  detail: RohProjektDetail | null,
): ErpProject {
  const id = detail?.id ?? suche?.id ?? '';
  const kunde = detail?.customer;
  const person = [kunde?.firstName ?? suche?.firstName, kunde?.lastName ?? suche?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const firma = kunde?.companyName ?? suche?.companyName ?? null;

  const objekt = detail?.objectAddress;
  const leiter = detail?.projectManager;
  const auftrag = detail?.salesOrderList?.[0];

  return {
    erpId: id,
    referenceNumber: detail?.referenceNumber ?? suche?.referenceNumber ?? null,
    orderNumber: auftrag?.referenceNumber ?? null,
    customerName: firma || person || detail?.name || suche?.name || 'Unbekannter Kunde',
    name: detail?.name ?? suche?.name ?? 'Unbenanntes Projekt',
    description: detail?.description ?? null,
    street: objekt?.street ?? suche?.street ?? null,
    zip: objekt ? null : (suche?.zip ?? null),
    city: objekt?.city ?? suche?.city ?? null,
    contactName: person || null,
    contactPhone: null,
    contactEmail: null,
    projectManagerErpId: detail?.projectManagerId ?? suche?.projectManagerId ?? null,
    projectManagerName: leiter
      ? [leiter.firstName, leiter.lastName].filter(Boolean).join(' ').trim() || null
      : null,
    plannedStart: nurDatum(detail?.startDate),
    plannedEnd: nurDatum(detail?.endDate),
    status: detail?.status ?? suche?.status ?? null,
    updatedAt: detail?.updatedOn ?? suche?.updatedOn ?? null,
  };
}
