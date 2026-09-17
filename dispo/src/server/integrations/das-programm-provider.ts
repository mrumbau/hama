/**
 * Echter Provider für „Das Programm“ (GraphQL).
 *
 * Gebaut streng nach der Hersteller-Dokumentation: Listen kommen aus den
 * `…Search`-Abfragen, Details aus den Einzelobjekt-Abfragen. Es werden
 * ausschliesslich dokumentierte Felder angefragt – GraphQL bricht die ganze
 * Abfrage ab, sobald ein Feld nicht existiert, also wird hier nichts geraten.
 *
 * Die Aufrufform stammt aus einer laufenden Anbindung desselben Systems
 * (CardScan im Bestellwesen) und aus dessen Introspection-Abbild – nicht aus
 * der Online-Dokumentation. Die stimmt bei den Feldnamen, aber nicht bei den
 * Argumenten: Suchen heißen `search`, nicht `request`, und Mutationen nehmen
 * `payload`, nicht `input`. Mit den Namen aus der Doku antwortet der Server
 * auf jede Abfrage mit einem Fehler.
 *
 * Konfiguration über Umgebungsvariablen:
 *   DAS_PROGRAMM_GRAPHQL_URL   Standard: https://app.das-programm.io/api/graphql
 *   DAS_PROGRAMM_API_KEY       der API-Token aus „Das Programm"
 *   DAS_PROGRAMM_AUTH_HEADER   Standard: x-techni-api-token
 *   DAS_PROGRAMM_AUTH_PREFIX   Standard: leer
 *   DAS_PROGRAMM_WRITEBACK=1   erlaubt das Zurückschreiben des Projektstatus
 */
import type { ErpEmployee, ErpProject, ErpProvider, ErpSupplier } from './erp-provider';

export const DAS_PROGRAMM_STANDARD_URL = 'https://app.das-programm.io/api/graphql';

/** So erwartet „Das Programm" den Token – ohne Präfix, nicht über Authorization. */
export const DAS_PROGRAMM_STANDARD_HEADER = 'x-techni-api-token';

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
  /** Was beim letzten Abruf nicht geklappt hat. Wird im Sync-Bericht gemeldet. */
  readonly hinweise: string[] = [];

  private readonly apiKey: string;

  constructor(
    private readonly endpoint: string,
    apiKey: string,
    private readonly authHeader = DAS_PROGRAMM_STANDARD_HEADER,
    private readonly authPrefix = '',
    writeBack = false,
  ) {
    if (!endpoint) throw new Error('DAS_PROGRAMM_GRAPHQL_URL ist nicht gesetzt.');
    if (!apiKey) throw new Error('DAS_PROGRAMM_API_KEY ist nicht gesetzt.');
    this.canWriteBack = writeBack;

    // Beim Kopieren aus einer Oberflaeche kommt gern ein Zeilenumbruch mit,
    // und manche schreiben das "Bearer " versehentlich in den Wert. Beides
    // fuehrt zu einem 401, den man dem Schluessel nicht ansieht.
    this.apiKey = apiKey.trim().replace(/^Bearer\s+/i, '');
  }

  private anmeldung(): Record<string, string> {
    return { [this.authHeader]: `${this.authPrefix}${this.apiKey}` };
  }

  private async anfrage<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.anmeldung(),
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

  /**
   * Liest eine `…Search`-Abfrage seitenweise vollständig aus.
   * Geblättert wird über `currentPage`, nicht über einen Datensatz-Offset.
   */
  private async alleSeiten<T>(query: string, feld: string): Promise<T[]> {
    const alle: T[] = [];
    for (let seite = 0; seite < MAX_SEITEN; seite++) {
      const data = await this.anfrage<Record<string, T[]>>(query, {
        search: { limit: SEITE, currentPage: seite },
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
      // ID! – die Einzelabfragen verlangen eine Pflicht-ID. Mit `ID` lehnt
      // der Server die ganze Abfrage ab, noch bevor er sie ausführt.
      const deklaration = teil.map((_, n) => `$id${n}: ID!`).join(', ');
      const rumpf = teil.map((_, n) => `d${n}: ${wurzel}(id: $id${n}) { ${felder} }`).join('\n');
      const variables = Object.fromEntries(teil.map((id, n) => [`id${n}`, id]));

      try {
        const data = await this.anfrage<Record<string, T | null>>(
          `query Details(${deklaration}) {\n${rumpf}\n}`,
          variables,
        );
        teil.forEach((id, n) => {
          const treffer = data[`d${n}`];
          if (treffer) ergebnis.set(id, treffer);
        });
      } catch (e) {
        // Die Detailabfrage ist das Kür, die Liste ist die Pflicht. Fällt ein
        // Feld weg, sollen trotzdem alle Baustellen ankommen – mit weniger
        // Angaben, aber sichtbar gemeldet statt still.
        const grund = e instanceof Error ? e.message : 'Unbekannter Fehler.';
        const meldung = `Details zu ${wurzel} konnten nicht gelesen werden: ${grund}`;
        if (!this.hinweise.includes(meldung)) this.hinweise.push(meldung);
      }
    }
    return ergebnis;
  }

  async healthCheck() {
    try {
      // Ein einzelnes Projekt genügt als Lebenszeichen.
      const data = await this.anfrage<{ projectSearch: { id: string }[] }>(QUERY_HEALTH, {
        search: { limit: 1, currentPage: 0 },
      });
      const anzahl = data.projectSearch?.length ?? 0;
      return {
        ok: true,
        message:
          anzahl > 0
            ? 'Verbindung steht, Projekte sind lesbar.'
            : 'Verbindung steht (keine Projekte gefunden).',
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
      payload: { id: erpId, status: erpStatus },
    });
  }
}

// ---------------------------------------------------------------------------
// Abfragen – jedes Feld steht so in der Hersteller-Dokumentation.
// ---------------------------------------------------------------------------

const QUERY_HEALTH = `
  query Lebenszeichen($search: QueryRequest!) {
    projectSearch(search: $search) { id }
  }
`;

const QUERY_PROJECT_SEARCH = `
  query Projekte($search: QueryRequest!) {
    projectSearch(search: $search) {
      id referenceNumber name status
      projectStatusId projectManagerId
      firstName lastName companyName
      street zip city
      updatedOn
    }
  }
`;

/**
 * Termine stehen in „Das Programm" nur selten am Projekt selbst. Gepflegt
 * werden sie an den Aufträgen, den Projektaufgaben und den Terminen – deshalb
 * holen wir alle drei und nehmen die äußeren Ränder. Ohne das bleibt die
 * Plantafel leer, obwohl im ERP alles terminiert ist.
 */
const PROJEKT_FELDER = `
  id referenceNumber name description status
  startDate endDate
  projectManagerId
  createdOn updatedOn
  customer { id firstName lastName companyName }
  projectManager { id firstName lastName }
  objectAddress { id street city }
  salesOrderList { id referenceNumber name startTime endTime dueDate }
  projectTaskList { id name status startTime endTime dueDate }
  appointmentList { id name startTime endTime }
`;

const QUERY_PROJECT = `
  query Projekt($id: ID!) {
    project(id: $id) { ${PROJEKT_FELDER} }
  }
`;

const QUERY_EMPLOYEE_SEARCH = `
  query Mitarbeiter($search: QueryRequest!) {
    employeeSearch(search: $search) {
      id referenceNumber firstName lastName email
      street zip city deletedOn
    }
  }
`;

// Bewusst ohne Gehaltsdaten: die Dispo hat dort nichts zu suchen.
const MITARBEITER_FELDER = `id firstName lastName email phone mobile userId contractEnd`;

const QUERY_SUPPLIER_SEARCH = `
  query Lieferanten($search: QueryRequest!) {
    supplierSearch(search: $search) {
      id referenceNumber name street zip city comment
    }
  }
`;

const LIEFERANT_FELDER = `
  id name houseNumber phone email comment
  contactPersonList { id firstName lastName }
`;

const MUTATION_UPDATE_PROJECT = `
  mutation StatusZurueckschreiben($payload: ProjectInputObjectType!) {
    updateProject(payload: $payload) { id referenceNumber name status }
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
  salesOrderList?:
    | {
        id: string;
        referenceNumber?: string | null;
        name?: string | null;
        startTime?: string | null;
        endTime?: string | null;
        dueDate?: string | null;
      }[]
    | null;
  projectTaskList?:
    | {
        id: string;
        name?: string | null;
        status?: string | null;
        startTime?: string | null;
        endTime?: string | null;
        dueDate?: string | null;
      }[]
    | null;
  appointmentList?:
    | { id: string; name?: string | null; startTime?: string | null; endTime?: string | null }[]
    | null;
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
 * Frühester Beginn und spätestes Ende über alles, was am Projekt terminiert
 * ist: das Projekt selbst, seine Aufträge, Projektaufgaben und Termine.
 *
 * Eine Baustelle dauert von der ersten bis zur letzten Tätigkeit – für die
 * Plantafel ist genau diese Spanne die Zeile.
 */
export function zeitraum(detail: RohProjektDetail | null): {
  start: string | null;
  ende: string | null;
} {
  if (!detail) return { start: null, ende: null };

  const starts: string[] = [];
  const enden: string[] = [];

  const merke = (start?: string | null, ende?: string | null) => {
    const a = nurDatum(start);
    const b = nurDatum(ende);
    if (a) starts.push(a);
    if (b) enden.push(b);
    // Ein Termin ohne Ende dauert diesen einen Tag.
    if (a && !b) enden.push(a);
  };

  merke(detail.startDate, detail.endDate);
  for (const a of detail.salesOrderList ?? []) merke(a.startTime, a.endTime ?? a.dueDate);
  for (const t of detail.projectTaskList ?? []) merke(t.startTime, t.endTime ?? t.dueDate);
  for (const t of detail.appointmentList ?? []) merke(t.startTime, t.endTime);

  // ISO-Datumsstrings lassen sich als Text vergleichen.
  return {
    start: starts.length ? starts.sort()[0] : null,
    ende: enden.length ? enden.sort()[enden.length - 1] : null,
  };
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
  const spanne = zeitraum(detail);

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
    plannedStart: spanne.start,
    plannedEnd: spanne.ende,
    status: detail?.status ?? suche?.status ?? null,
    updatedAt: detail?.updatedOn ?? suche?.updatedOn ?? null,
  };
}

// ---------------------------------------------------------------------------
// Einrichtungshilfe
// ---------------------------------------------------------------------------

/**
 * Wie Schlüssel üblicherweise mitgeschickt werden.
 *
 * Steht in der Dokumentation nicht eindeutig, welcher Header erwartet wird,
 * ist Ausprobieren schneller als Nachfragen – aber nur von Hand angestossen,
 * nie im laufenden Betrieb.
 */
export const AUTH_VARIANTEN: { header: string; prefix: string; name: string }[] = [
  { header: DAS_PROGRAMM_STANDARD_HEADER, prefix: '', name: 'x-techni-api-token: <Schlüssel>' },
  { header: 'Authorization', prefix: 'Bearer ', name: 'Authorization: Bearer <Schlüssel>' },
  { header: 'Authorization', prefix: '', name: 'Authorization: <Schlüssel>' },
  { header: 'Authorization', prefix: 'Token ', name: 'Authorization: Token <Schlüssel>' },
  { header: 'X-API-KEY', prefix: '', name: 'X-API-KEY: <Schlüssel>' },
  { header: 'x-api-key', prefix: '', name: 'x-api-key: <Schlüssel>' },
  { header: 'apikey', prefix: '', name: 'apikey: <Schlüssel>' },
];

export interface VariantenErgebnis {
  name: string;
  header: string;
  prefix: string;
  ok: boolean;
  status: number | null;
  antwort: string;
}

/**
 * Probiert die gängigen Header-Formen durch und meldet, welche der Server
 * akzeptiert. Antworten alle mit demselben Fehler, liegt es nicht am Header,
 * sondern am Schlüssel selbst – auch das ist eine brauchbare Auskunft.
 */
export async function findeAuthVariante(
  endpoint: string,
  apiKey: string,
): Promise<VariantenErgebnis[]> {
  const ergebnisse: VariantenErgebnis[] = [];

  for (const variante of AUTH_VARIANTEN) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          [variante.header]: `${variante.prefix}${apiKey}`,
        },
        body: JSON.stringify({
          query:
            'query Test($request: QueryRequest) { projectStatusSearch(request: $request) { id } }',
          variables: { request: { limit: 1, offset: 0 } },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });

      const text = (await res.text().catch(() => '')).trim().slice(0, 200);
      // Erfolg heisst: HTTP 200 *und* keine GraphQL-Fehler im Rumpf.
      const ok = res.ok && !/"errors"\s*:/.test(text) && !/invalid_token/i.test(text);
      ergebnisse.push({
        name: variante.name,
        header: variante.header,
        prefix: variante.prefix,
        ok,
        status: res.status,
        antwort: text,
      });
      if (ok) break; // Die erste, die funktioniert, genügt.
    } catch (e) {
      ergebnisse.push({
        name: variante.name,
        header: variante.header,
        prefix: variante.prefix,
        ok: false,
        status: null,
        antwort: e instanceof Error ? e.message : 'Unbekannter Fehler.',
      });
    }
  }

  return ergebnisse;
}
