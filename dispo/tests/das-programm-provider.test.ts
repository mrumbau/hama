/**
 * Prüft den GraphQL-Provider gegen ein nachgebautes „Das Programm".
 *
 * Der echte Endpunkt ist aus der Entwicklungsumgebung nicht erreichbar,
 * deshalb liegt hier die ganze Beweislast: dass die richtigen Abfragen
 * rausgehen, dass gebündelt statt einzeln gefragt wird, und dass die Antwort
 * richtig übersetzt wird.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_VARIANTEN,
  DasProgrammProvider,
  findeAuthVariante,
  zeitraum,
} from '@/server/integrations/das-programm-provider';

interface Aufruf {
  query: string;
  variables: Record<string, unknown>;
}

/** Ersetzt `fetch` und protokolliert, was angefragt wurde. */
function erpNachbau(antwort: (a: Aufruf) => unknown) {
  const aufrufe: Aufruf[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const a = JSON.parse(String(init.body)) as Aufruf;
    aufrufe.push(a);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: antwort(a) }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { aufrufe, fetchMock };
}

function provider(writeBack = false) {
  return new DasProgrammProvider(
    'https://app.das-programm.io/api/graphql',
    'test-schluessel',
    undefined,
    undefined,
    writeBack,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Projekte lesen', () => {
  it('holt die Liste und die Details und übersetzt sie', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('projectSearch')) {
        return {
          projectSearch: [
            {
              id: 'P1',
              referenceNumber: 'P-2026-47',
              name: 'Badsanierung OG',
              status: 'order_fulfillment',
              projectManagerId: 'U-7',
              firstName: 'Daniel',
              lastName: 'Kufner',
              companyName: null,
              street: 'Rechnungsweg 1',
              zip: '80331',
              city: 'München',
              updatedOn: '2026-09-16T10:00:00Z',
            },
          ],
        };
      }
      return {
        d0: {
          id: 'P1',
          referenceNumber: 'P-2026-47',
          name: 'Badsanierung OG',
          description: 'Bad im OG komplett',
          status: 'order_fulfillment',
          startDate: '2026-09-21T00:00:00Z',
          endDate: '2026-09-25T00:00:00Z',
          projectManagerId: 'U-7',
          customer: { id: 'K1', firstName: 'Daniel', lastName: 'Kufner', companyName: null },
          projectManager: { id: 'U-7', firstName: 'Carsten', lastName: 'Reuter' },
          objectAddress: { id: 'A1', street: 'Rosenstraße 12', city: 'Otterfing' },
          salesOrderList: [{ id: 'S1', referenceNumber: 'AG-260047', name: 'Bad' }],
        },
      };
    });

    const [projekt] = await provider().getProjects();

    expect(projekt.erpId).toBe('P1');
    expect(projekt.customerName).toBe('Daniel Kufner');
    expect(projekt.orderNumber).toBe('AG-260047');
    expect(projekt.projectManagerName).toBe('Carsten Reuter');
    // Termine kommen als ISO-Zeitstempel und müssen reine Kalendertage werden.
    expect(projekt.plannedStart).toBe('2026-09-21');
    expect(projekt.plannedEnd).toBe('2026-09-25');
    // Entscheidend: gearbeitet wird an der Objektadresse, nicht an der
    // Rechnungsadresse des Kunden.
    expect(projekt.street).toBe('Rosenstraße 12');
    expect(projekt.city).toBe('Otterfing');

    expect(aufrufe[0].variables.search).toEqual({ limit: 100, currentPage: 0 });
  });

  it('blättert weiter, solange volle Seiten kommen', async () => {
    let seite = 0;
    const { aufrufe } = erpNachbau((a) => {
      if (!a.query.includes('projectSearch')) return {};
      const liste = Array.from({ length: seite === 0 ? 100 : 3 }, (_, i) => ({
        id: `P${seite}-${i}`,
        name: 'Projekt',
      }));
      seite++;
      return { projectSearch: liste };
    });

    const projekte = await provider().getProjects();

    expect(projekte).toHaveLength(103);
    const suchen = aufrufe.filter((a) => a.query.includes('projectSearch'));
    expect(suchen).toHaveLength(2);
    expect(suchen[1].variables.search).toEqual({ limit: 100, currentPage: 1 });
  });

  it('bündelt Detailabfragen statt einzeln zu fragen', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('projectSearch')) {
        return { projectSearch: Array.from({ length: 30 }, (_, i) => ({ id: `P${i}` })) };
      }
      return Object.fromEntries(
        Object.keys(a.variables).map((k, n) => [`d${n}`, { id: String(a.variables[k]) }]),
      );
    });

    await provider().getProjects();

    // 30 Projekte = 1 Suche + 2 Bündel, nicht 31 Anfragen.
    expect(aufrufe).toHaveLength(3);
    expect(Object.keys(aufrufe[1].variables)).toHaveLength(25);
    expect(Object.keys(aufrufe[2].variables)).toHaveLength(5);
  });
});

describe('Mitarbeiter lesen', () => {
  it('erkennt Ausgeschiedene und fragt für sie keine Details ab', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('employeeSearch')) {
        return {
          employeeSearch: [
            { id: 'E1', firstName: 'Luigi', lastName: 'Curatolo', email: null, deletedOn: false },
            { id: 'E2', firstName: 'Andreas', lastName: 'Vorbei', email: null, deletedOn: true },
            { id: 'E3', firstName: 'Carsten', lastName: 'Reuter', email: null, deletedOn: false },
          ],
        };
      }
      return {
        d0: { id: 'E1', mobile: '+49 170 1111111', userId: 'U-3', contractEnd: null },
        d1: { id: 'E3', userId: 'U-7', contractEnd: '2026-08-31T00:00:00Z' },
      };
    });

    const leute = await provider().getEmployees();

    expect(leute.find((l) => l.erpId === 'E1')).toMatchObject({
      userErpId: 'U-3',
      phone: '+49 170 1111111',
      ausgeschieden: false,
    });
    // Archiviert im ERP.
    expect(leute.find((l) => l.erpId === 'E2')?.ausgeschieden).toBe(true);
    // Vertrag ausgelaufen – zählt genauso.
    expect(leute.find((l) => l.erpId === 'E3')?.ausgeschieden).toBe(true);

    const details = aufrufe.filter((a) => a.query.includes('employee(id:'));
    expect(Object.keys(details[0].variables)).toHaveLength(2);
  });

  it('fragt keine Gehaltsdaten ab', async () => {
    const { aufrufe } = erpNachbau((a) =>
      a.query.includes('employeeSearch')
        ? { employeeSearch: [{ id: 'E1' }] }
        : { d0: { id: 'E1' } },
    );
    await provider().getEmployees();
    const alles = aufrufe.map((a) => a.query).join(' ');
    expect(alles).not.toMatch(/salary|hourlyWage/);
  });
});

describe('Lieferanten lesen', () => {
  it('holt Details nur für die Subunternehmer', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('supplierSearch')) {
        return {
          supplierSearch: [
            { id: 'L1', name: 'Elektro Müller GmbH', comment: 'Sub | Tätigkeit: Elektro' },
            { id: 'L2', name: 'Pfleiderer', comment: 'Tätigkeit: Platten' },
            { id: 'L3', name: 'Garten Grün', comment: 'Tätigkeit: Substrat und Pflanzen' },
          ],
        };
      }
      return {
        d0: {
          id: 'L1',
          phone: '+49 89 55500-1',
          email: 'info@elektro-mueller.example',
          contactPersonList: [{ id: 'C1', firstName: 'Stefan', lastName: 'Müller' }],
        },
      };
    });

    const liste = await provider().getSuppliers();

    // Alle Lieferanten kommen zurück – gefiltert wird erst im Sync.
    expect(liste).toHaveLength(3);
    const sub = liste.find((l) => l.erpId === 'L1');
    expect(sub?.contactName).toBe('Stefan Müller');
    expect(sub?.phone).toBe('+49 89 55500-1');
    // „Substrat" ist kein Subunternehmer und kostet keine Detailabfrage.
    const details = aufrufe.filter((a) => a.query.includes('supplier(id:'));
    expect(Object.keys(details[0].variables)).toHaveLength(1);
  });
});

describe('Status zurückschreiben', () => {
  it('schickt genau id und status', async () => {
    const { aufrufe } = erpNachbau(() => ({ updateProject: { id: 'P1', status: 'closed' } }));
    await provider(true).setProjectStatus('P1', 'closed');

    expect(aufrufe[0].query).toContain('updateProject');
    expect(aufrufe[0].variables.payload).toEqual({ id: 'P1', status: 'closed' });
  });

  it('schreibt nichts, solange es nicht eingeschaltet ist', async () => {
    const { fetchMock } = erpNachbau(() => ({}));
    await expect(provider(false).setProjectStatus('P1', 'closed')).rejects.toThrow(
      /nicht eingeschaltet/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Fehler beim Einrichten', () => {
  it('gibt den Antworttext mit aus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: async () => 'missing api key',
          }) as unknown as Response,
      ),
    );

    const health = await provider().healthCheck();

    expect(health.ok).toBe(false);
    // Ohne den Antworttext rätselt man beim Einrichten über den Header.
    expect(health.message).toContain('401');
    expect(health.message).toContain('missing api key');
  });

  it('meldet GraphQL-Fehler im Klartext', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ errors: [{ message: 'Cannot query field "foo"' }] }),
          }) as unknown as Response,
      ),
    );

    const health = await provider().healthCheck();
    expect(health.message).toContain('Cannot query field');
  });
});

describe('Header-Variante finden', () => {
  /** Ein ERP, das nur eine bestimmte Header-Form akzeptiert. */
  function erpMitHeader(erwartet: { header: string; wert: string }) {
    const versuche: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        versuche.push(Object.keys(headers).join(','));
        if (headers[erwartet.header] === erwartet.wert) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => JSON.stringify({ data: { projectStatusSearch: [{ id: '1' }] } }),
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () => '{"error":"invalid_token","error_description":"Invalid token"}',
        } as unknown as Response;
      }),
    );
    return versuche;
  }

  it('findet einen Schlüssel, der ohne Bearer-Präfix erwartet wird', async () => {
    erpMitHeader({ header: 'X-API-KEY', wert: 'abc123' });

    const r = await findeAuthVariante('https://example.invalid/graphql', 'abc123');
    const treffer = r.find((e) => e.ok);

    expect(treffer?.header).toBe('X-API-KEY');
    expect(treffer?.prefix).toBe('');
    // Nach dem Treffer wird nicht weiter probiert.
    expect(r[r.length - 1].ok).toBe(true);
  });

  it('meldet bei durchgehend abgelehntem Schlüssel alle Versuche', async () => {
    erpMitHeader({ header: 'Authorization', wert: 'Bearer der-echte-schluessel' });

    const r = await findeAuthVariante('https://example.invalid/graphql', 'falscher-schluessel');

    expect(r.every((e) => !e.ok)).toBe(true);
    expect(r).toHaveLength(AUTH_VARIANTEN.length);
    // Der Antworttext muss durchgereicht werden – er ist die eigentliche Auskunft.
    expect(r[0].antwort).toContain('invalid_token');
  });

  it('wertet einen GraphQL-Fehler trotz HTTP 200 nicht als Erfolg', async () => {
    // Manche Server antworten auf eine abgelehnte Anmeldung mit 200 und
    // schreiben den Fehler in den Rumpf.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '{"errors":[{"message":"Not authorized"}]}',
          }) as unknown as Response,
      ),
    );

    const r = await findeAuthVariante('https://example.invalid/graphql', 'egal');
    expect(r.some((e) => e.ok)).toBe(false);
  });
});

describe('Schlüssel aufräumen', () => {
  it('entfernt Zeilenumbrüche rund um den Schlüssel', async () => {
    const { aufrufe, fetchMock } = erpNachbau(() => ({ projectSearch: [] }));
    const p = new DasProgrammProvider('https://example.invalid/graphql', '  abc123\n');
    await p.healthCheck();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    // Standard ist der Header, den „Das Programm" tatsächlich erwartet.
    expect(headers['x-techni-api-token']).toBe('abc123');
    expect(aufrufe).toHaveLength(1);
  });
});

describe('Aufrufform – die Falle aus der Online-Dokumentation', () => {
  /**
   * Die Doku nennt die Argumente `request` und `input`. Tatsächlich heißen
   * sie `search` und `payload`. Mit den falschen Namen antwortet der Server
   * auf *jede* Abfrage mit einem Fehler – und zwar erst im Betrieb, weil
   * GraphQL das nicht beim Bauen prüft. Deshalb steht es hier fest.
   */
  it('nennt das Suchargument search und niemals request', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('projectSearch')) return { projectSearch: [{ id: 'P1' }] };
      if (a.query.includes('employeeSearch')) return { employeeSearch: [] };
      if (a.query.includes('supplierSearch')) return { supplierSearch: [] };
      return { d0: { id: 'P1' } };
    });

    const p = provider();
    await p.getProjects();
    await p.getEmployees();
    await p.getSuppliers();

    const alles = aufrufe.map((a) => a.query).join('\n');
    expect(alles).toMatch(/Search\(search: \$search\)/);
    expect(alles).not.toMatch(/request:/);
    expect(alles).not.toMatch(/\(input:/);
  });

  it('nennt das Mutations-Argument payload und niemals input', async () => {
    const { aufrufe } = erpNachbau(() => ({ updateProject: { id: 'P1' } }));
    await provider(true).setProjectStatus('P1', 'closed');

    expect(aufrufe[0].query).toMatch(/updateProject\(payload: \$payload\)/);
    expect(aufrufe[0].query).not.toMatch(/input:/);
  });

  it('blättert über currentPage, nicht über einen Offset', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (!a.query.includes('projectSearch')) return {};
      const seite = (a.variables.search as { currentPage: number }).currentPage;
      return {
        projectSearch: seite === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: `P${i}` })) : [],
      };
    });

    await provider().getProjects();

    const suchen = aufrufe.filter((a) => a.query.includes('projectSearch'));
    expect(suchen[1].variables.search).toEqual({ limit: 100, currentPage: 1 });
    expect(JSON.stringify(suchen[1].variables)).not.toContain('offset');
  });

  it('schickt den Schlüssel im Header x-techni-api-token, nicht über Authorization', async () => {
    const { fetchMock } = erpNachbau(() => ({ projectSearch: [] }));
    await provider().healthCheck();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-techni-api-token']).toBe('test-schluessel');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('Pflichtangaben im GraphQL-Kopf', () => {
  /**
   * `project(id: ID!)` verlangt eine Pflicht-ID. Wird die Variable als `ID`
   * deklariert, weist der Server die komplette Abfrage ab – und zwar erst
   * zur Laufzeit, mit einer Meldung pro Bündel-Alias.
   */
  it('deklariert die IDs der Detailabfragen als ID!', async () => {
    const { aufrufe } = erpNachbau((a) => {
      if (a.query.includes('projectSearch')) {
        return { projectSearch: [{ id: 'P1' }, { id: 'P2' }] };
      }
      return { d0: { id: 'P1' }, d1: { id: 'P2' } };
    });

    await provider().getProjects();

    const detail = aufrufe.find((a) => a.query.includes('project(id:'));
    expect(detail?.query).toContain('$id0: ID!');
    expect(detail?.query).toContain('$id1: ID!');
    expect(detail?.query).not.toMatch(/\$id\d+: ID[^!]/);
  });

  it('deklariert auch die Einzelabfrage als ID!', async () => {
    const { aufrufe } = erpNachbau(() => ({ project: { id: 'P1', name: 'Bad' } }));
    await provider().getProject('P1');

    expect(aufrufe[0].query).toContain('$id: ID!');
  });
});

describe('Wenn die Detailabfrage scheitert', () => {
  /**
   * Die Feldauswahl der Detailabfragen ist die unsicherste Stelle der
   * Anbindung – ein einziger falscher Feldname lässt den Server die ganze
   * Abfrage zurückweisen. Dann sollen trotzdem alle Baustellen ankommen.
   */
  it('liefert die Baustellen trotzdem, nur mit weniger Angaben', async () => {
    erpNachbau((a) => {
      if (a.query.includes('projectSearch')) {
        return {
          projectSearch: [
            { id: 'P1', name: 'Bad', referenceNumber: 'P-26-1', companyName: 'Müller GmbH' },
          ],
        };
      }
      throw new Error('unerreichbar');
    });
    // Die Detailabfrage antwortet mit einem GraphQL-Fehler.
    const echterFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    echterFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const a = JSON.parse(String(init.body)) as { query: string };
      if (a.query.includes('projectSearch')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            data: {
              projectSearch: [
                { id: 'P1', name: 'Bad', referenceNumber: 'P-26-1', companyName: 'Müller GmbH' },
              ],
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ errors: [{ message: 'Cannot query field "objectAddress"' }] }),
      } as unknown as Response;
    });

    const p = provider();
    const projekte = await p.getProjects();

    expect(projekte).toHaveLength(1);
    expect(projekte[0].customerName).toBe('Müller GmbH');
    expect(projekte[0].referenceNumber).toBe('P-26-1');
    // Und der Ausfall wird gemeldet, nicht verschwiegen.
    expect(p.hinweise.join(' ')).toContain('objectAddress');
  });
});

describe('Zeitraum einer Baustelle', () => {
  /**
   * In „Das Programm" stehen die Termine an Aufträgen, Projektaufgaben und
   * Terminen – am Projekt selbst fast nie. Beim ersten echten Abgleich hatte
   * deshalb keine einzige der 16 Baustellen ein Datum.
   */
  it('nimmt den frühesten Beginn und das späteste Ende über alles', () => {
    const spanne = zeitraum({
      id: 'P1',
      startDate: null,
      endDate: null,
      salesOrderList: [
        { id: 'A1', startTime: '2026-09-15T07:00:00', endTime: '2026-09-30T16:00:00' },
      ],
      projectTaskList: [
        { id: 'T1', startTime: '2026-08-31T22:00:00', endTime: '2026-10-29T23:00:00' },
      ],
      appointmentList: [
        { id: 'X1', startTime: '2026-09-20T08:00:00', endTime: '2026-09-20T10:00:00' },
      ],
    });

    expect(spanne.start).toBe('2026-08-31');
    expect(spanne.ende).toBe('2026-10-29');
  });

  it('nimmt das Fälligkeitsdatum, wenn kein Ende gepflegt ist', () => {
    const spanne = zeitraum({
      id: 'P1',
      salesOrderList: [
        {
          id: 'A1',
          startTime: '2026-09-01T00:00:00',
          endTime: null,
          dueDate: '2026-09-12T00:00:00',
        },
      ],
    });

    expect(spanne.ende).toBe('2026-09-12');
  });

  it('lässt einen Termin ohne Ende einen Tag dauern', () => {
    const spanne = zeitraum({
      id: 'P1',
      appointmentList: [{ id: 'X1', startTime: '2026-09-18T09:00:00', endTime: null }],
    });

    expect(spanne.start).toBe('2026-09-18');
    expect(spanne.ende).toBe('2026-09-18');
  });

  it('meldet nichts, wo nichts terminiert ist – statt heute zu raten', () => {
    expect(zeitraum({ id: 'P1' })).toEqual({ start: null, ende: null });
    expect(zeitraum(null)).toEqual({ start: null, ende: null });
  });

  it('bevorzugt kein Datum vor dem anderen, sondern nur die Ränder', () => {
    // Das Projekt selbst trägt einen späteren Beginn als seine Aufgabe.
    const spanne = zeitraum({
      id: 'P1',
      startDate: '2026-10-01T00:00:00',
      endDate: '2026-10-05T00:00:00',
      projectTaskList: [
        { id: 'T1', startTime: '2026-09-25T00:00:00', endTime: '2026-10-20T00:00:00' },
      ],
    });

    expect(spanne.start).toBe('2026-09-25');
    expect(spanne.ende).toBe('2026-10-20');
  });
});
