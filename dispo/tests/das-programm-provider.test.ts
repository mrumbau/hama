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
} from '@/server/integrations/das-programm-provider';
import { vergissTokens } from '@/server/integrations/das-programm-auth';

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
    'Authorization',
    'Bearer ',
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

    expect(aufrufe[0].variables.request).toEqual({ limit: 100, offset: 0 });
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
    expect(suchen[1].variables.request).toEqual({ limit: 100, offset: 100 });
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
    expect(aufrufe[0].variables.input).toEqual({ id: 'P1', status: 'closed' });
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
  it('entfernt Zeilenumbrüche und ein versehentliches Bearer im Wert', async () => {
    const { aufrufe, fetchMock } = erpNachbau(() => ({ projectStatusSearch: [] }));
    const p = new DasProgrammProvider(
      'https://example.invalid/graphql',
      '  Bearer abc123\n',
      'Authorization',
      'Bearer ',
    );
    await p.healthCheck();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer abc123');
    expect(aufrufe).toHaveLength(1);
  });
});

describe('Anmeldung über Client-Zugangsdaten', () => {
  it('holt ein Token und schickt es als Bearer mit', async () => {
    vergissTokens();
    const aufrufe: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        aufrufe.push({ url, headers: init.headers as Record<string, string> });
        if (url.includes('/oauth/token')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            text: async () => '{"access_token":"frisches-token","expires_in":3600}',
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ data: { projectStatusSearch: [{ id: '1' }] } }),
        } as unknown as Response;
      }),
    );

    const p = new DasProgrammProvider(
      'https://app.das-programm.io/api/graphql',
      '',
      'Authorization',
      'Bearer ',
      false,
      {
        tokenUrl: 'https://app.das-programm.io/api/oauth/token',
        clientId: 'dispo',
        clientSecret: 'geheim',
        scope: null,
      },
    );
    const health = await p.healthCheck();

    expect(health.ok).toBe(true);
    const graphql = aufrufe.find((a) => a.url.endsWith('/graphql'));
    expect(graphql?.headers.Authorization).toBe('Bearer frisches-token');
  });

  it('kommt ohne API-Schlüssel aus, wenn Client-Zugangsdaten da sind', () => {
    expect(
      () =>
        new DasProgrammProvider(
          'https://example.invalid/graphql',
          '',
          'Authorization',
          'Bearer ',
          false,
          {
            tokenUrl: 'https://example.invalid/api/oauth/token',
            clientId: 'a',
            clientSecret: 'b',
            scope: null,
          },
        ),
    ).not.toThrow();

    // Ohne beides darf die App gar nicht erst starten.
    expect(() => new DasProgrammProvider('https://example.invalid/graphql', '')).toThrow(
      /Weder DAS_PROGRAMM_API_KEY noch/,
    );
  });
});
