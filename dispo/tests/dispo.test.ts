/**
 * Integrationstests gemäß Master-Prompt Abschnitt 42.
 * Laufen gegen eine gestartete Instanz und räumen hinter sich auf.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, del, get, isoIn, mondayOfNextWeek, patch, post, TAG } from './helpers';

interface Ids {
  projectA: string;
  projectB: string;
  employee: string;
  manager: string;
  sub: string;
}

const ids = {} as Ids;
const MO = mondayOfNextWeek();
const DI = addDays(MO, 1);
const MI = addDays(MO, 2);

beforeAll(async () => {
  const manager = await post<{ manager: { id: string } }>('/api/site-managers', {
    firstName: 'Test',
    lastName: `Bauleiter ${TAG}`,
    phone: '+49 89 000001',
  });
  expect(manager.status).toBe(201);
  ids.manager = manager.body.manager.id;

  const employee = await post<{ employee: { id: string } }>('/api/employees', {
    firstName: 'Test',
    lastName: `Monteur ${TAG}`,
    profession: 'Trockenbau',
  });
  expect(employee.status).toBe(201);
  ids.employee = employee.body.employee.id;

  const sub = await post<{ subcontractor: { id: string } }>('/api/subcontractors', {
    companyName: `Test Elektro ${TAG}`,
  });
  expect(sub.status).toBe(201);
  ids.sub = sub.body.subcontractor.id;

  for (const key of ['projectA', 'projectB'] as const) {
    const res = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Testkunde ${key} ${TAG}`,
      name: `Testbaustelle ${key}`,
      orderNumber: `${TAG}-${key}`,
      city: 'Teststadt',
      primarySiteManagerId: ids.manager,
      plannedStart: MO,
      plannedEnd: MI,
      status: 'GEPLANT',
      materialStatus: 'VOLLSTAENDIG',
      customerConfirmed: 'BESTAETIGT',
    });
    expect(res.status).toBe(201);
    ids[key] = res.body.project.id;
  }
});

afterAll(async () => {
  await del(`/api/projects/${ids.projectA}`);
  await del(`/api/projects/${ids.projectB}`);
  await del(`/api/employees/${ids.employee}`);
  await del(`/api/subcontractors/${ids.sub}`);
  await del(`/api/site-managers/${ids.manager}`);
});

// ---------------------------------------------------------------------------

describe('Einsätze planen und verschieben', () => {
  let assignmentId = '';

  it('weist einem Projekt einen Mitarbeiter zu', async () => {
    const res = await post<{ assignment: { id: string; startDate: string }; message: string }>(
      '/api/assignments',
      {
        projectId: ids.projectA,
        resourceType: 'MITARBEITER',
        employeeId: ids.employee,
        startDate: MO,
      },
    );
    expect(res.status).toBe(201);
    expect(res.body.assignment.startDate).toBe(MO);
    expect(res.body.message).toMatch(/eingeplant/);
    assignmentId = res.body.assignment.id;
  });

  it('weist einem Projekt einen SUB zu', async () => {
    const res = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectA,
      resourceType: 'SUBUNTERNEHMER',
      subcontractorId: ids.sub,
      startDate: MI,
      status: 'BESTAETIGT',
    });
    expect(res.status).toBe(201);
  });

  it('verschiebt einen Mitarbeiter auf einen anderen Tag und meldet den Satz für den Undo-Toast', async () => {
    const res = await post<{
      message: string;
      previous: { startDate: string; projectId: string };
    }>(`/api/assignments/${assignmentId}/move`, { startDate: DI, reason: 'KUNDE' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/wurde von .* auf .* verschoben\.$/);
    expect(res.body.previous.startDate).toBe(MO);
  });

  it('macht das Verschieben rückgängig', async () => {
    const res = await post<{ assignment: { startDate: string } }>(
      `/api/assignments/${assignmentId}/move`,
      { startDate: MO, force: true },
    );
    expect(res.status).toBe(200);
    expect(res.body.assignment.startDate).toBe(MO);
  });

  it('behält die Dauer beim Verschieben eines mehrtägigen Einsatzes', async () => {
    const created = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectA,
      resourceType: 'UNBESETZT',
      placeholderLabel: 'Testplatzhalter',
      startDate: MO,
      endDate: MI, // 3 Tage
    });
    const moved = await post<{ assignment: { startDate: string; endDate: string } }>(
      `/api/assignments/${created.body.assignment.id}/move`,
      { startDate: DI },
    );
    expect(moved.body.assignment.startDate).toBe(DI);
    expect(moved.body.assignment.endDate).toBe(addDays(DI, 2));
    await del(`/api/assignments/${created.body.assignment.id}`);
  });

  it('verschiebt einen Einsatz auf eine andere Baustelle', async () => {
    const res = await post<{ assignment: { projectId: string } }>(
      `/api/assignments/${assignmentId}/move`,
      { startDate: MO, projectId: ids.projectB },
    );
    expect(res.status).toBe(200);
    expect(res.body.assignment.projectId).toBe(ids.projectB);

    // Zurück auf die Ursprungsbaustelle für die folgenden Tests.
    await post(`/api/assignments/${assignmentId}/move`, {
      startDate: MO,
      projectId: ids.projectA,
      force: true,
    });
  });
});

describe('Doppelbelegung', () => {
  it('lehnt eine Doppelbelegung zunächst mit einer Warnung ab', async () => {
    const res = await post<{ error: string; code: string; confirmable: boolean }>(
      '/api/assignments',
      {
        projectId: ids.projectB,
        resourceType: 'MITARBEITER',
        employeeId: ids.employee,
        startDate: MO,
      },
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.confirmable).toBe(true);
    expect(res.body.error).toMatch(/ist am .* bereits auf Baustelle/);
  });

  it('erlaubt die Doppelbelegung mit „Trotzdem einplanen"', async () => {
    const res = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectB,
      resourceType: 'MITARBEITER',
      employeeId: ids.employee,
      startDate: MO,
      force: true,
    });
    expect(res.status).toBe(201);

    const board = await get<{ conflicts: Record<string, string[]> }>(
      `/api/board?datum=${MO}&zeitraum=woche&abgeschlossen=1`,
    );
    const key = `MITARBEITER:${ids.employee}|${MO}`;
    expect(board.body.conflicts[key]).toBeDefined();
    expect(board.body.conflicts[key].length).toBe(2);

    await del(`/api/assignments/${res.body.assignment.id}`);
  });

  it('erzeugt eine Warnung für die Doppelbelegung', async () => {
    const created = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectB,
      resourceType: 'MITARBEITER',
      employeeId: ids.employee,
      startDate: MO,
      force: true,
    });

    const res = await get<{ warnings: { key: string; category: string; severity: string }[] }>(
      '/api/warnings',
    );
    const conflict = res.body.warnings.find(
      (w) => w.category === 'Überschneidung' && w.key.includes(ids.employee),
    );
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe('KRITISCH');

    await del(`/api/assignments/${created.body.assignment.id}`);
  });

  it('meldet einen doppelt geplanten SUB nur als Warnung, nicht als Fehler', async () => {
    const res = await post<{ error: string }>('/api/assignments', {
      projectId: ids.projectB,
      resourceType: 'SUBUNTERNEHMER',
      subcontractorId: ids.sub,
      startDate: MI,
    });
    expect(res.status).toBe(409); // bestätigungspflichtig

    const forced = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectB,
      resourceType: 'SUBUNTERNEHMER',
      subcontractorId: ids.sub,
      startDate: MI,
      force: true,
    });
    expect(forced.status).toBe(201);

    const warnings = await get<{ warnings: { key: string; severity: string }[] }>('/api/warnings');
    const subWarning = warnings.body.warnings.find(
      (w) => w.key.startsWith('conflict:SUBUNTERNEHMER') && w.key.includes(ids.sub),
    );
    expect(subWarning?.severity).toBe('WARNUNG'); // erlaubt: mehrere Teams

    await del(`/api/assignments/${forced.body.assignment.id}`);
  });

  it('behandelt Bauleiter auf mehreren Baustellen nicht als Konflikt', async () => {
    const a = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectA,
      resourceType: 'BAULEITER',
      siteManagerId: ids.manager,
      startDate: MO,
    });
    const b = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectB,
      resourceType: 'BAULEITER',
      siteManagerId: ids.manager,
      startDate: MO,
    });
    expect(b.status).toBe(201); // kein 409

    const board = await get<{ conflicts: Record<string, string[]> }>(
      `/api/board?datum=${MO}&zeitraum=woche&abgeschlossen=1`,
    );
    expect(board.body.conflicts[`BAULEITER:${ids.manager}|${MO}`]).toBeUndefined();

    await del(`/api/assignments/${a.body.assignment.id}`);
    await del(`/api/assignments/${b.body.assignment.id}`);
  });
});

describe('Projekt verschieben', () => {
  it('verschiebt den gesamten Projektzeitraum und protokolliert den Grund', async () => {
    const res = await patch<{ changed: string[] }>(`/api/projects/${ids.projectA}`, {
      plannedStart: addDays(MO, 7),
      plannedEnd: addDays(MI, 7),
      reason: 'KUNDE',
      reasonText: 'Kundenwunsch aus Test',
    });
    expect(res.status).toBe(200);
    expect(res.body.changed).toContain('plannedStart');

    const timeline = await get<{ entries: { label: string; reasonText: string | null }[] }>(
      `/api/projects/${ids.projectA}/timeline`,
    );
    const entry = timeline.body.entries.find((e) => e.label === 'Projektzeitraum geändert');
    expect(entry).toBeDefined();
    expect(entry!.reasonText).toBe('Kundenwunsch aus Test');

    // zurücksetzen
    await patch(`/api/projects/${ids.projectA}`, { plannedStart: MO, plannedEnd: MI });
  });

  it('weist ein Ende vor dem Beginn zurück', async () => {
    const res = await patch<{ error: string }>(`/api/projects/${ids.projectA}`, {
      plannedStart: MI,
      plannedEnd: MO,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Ende liegt vor/);
  });
});

describe('Audit-Log', () => {
  it('protokolliert jede relevante Änderung mit alt/neu', async () => {
    await patch(`/api/projects/${ids.projectB}`, {
      status: 'IN_AUSFUEHRUNG',
      reason: 'MR_UMBAU',
    });

    const res = await get<{
      entries: { label: string; oldValue: unknown; newValue: unknown; source: string }[];
    }>(`/api/audit?projekt=${ids.projectB}`);

    const entry = res.body.entries.find((e) => e.label === 'Status geändert');
    expect(entry).toBeDefined();
    expect(entry!.oldValue).toMatchObject({ status: 'GEPLANT' });
    expect(entry!.newValue).toMatchObject({ status: 'IN_AUSFUEHRUNG' });
    expect(entry!.source).toBe('MANUELL');
  });

  it('schreibt keinen Eintrag, wenn sich nichts geändert hat', async () => {
    const before = await get<{ entries: unknown[] }>(`/api/audit?projekt=${ids.projectB}`);
    await patch(`/api/projects/${ids.projectB}`, { status: 'IN_AUSFUEHRUNG' });
    const after = await get<{ entries: unknown[] }>(`/api/audit?projekt=${ids.projectB}`);
    expect(after.body.entries.length).toBe(before.body.entries.length);
  });
});

describe('Suche', () => {
  it('findet Projekte über Kunde und Auftragsnummer', async () => {
    const byCustomer = await get<{ hits: { type: string; title: string }[] }>(
      `/api/search?q=${encodeURIComponent(`Testkunde projectA ${TAG}`)}`,
    );
    expect(byCustomer.body.hits.some((h) => h.type === 'projekt')).toBe(true);

    const byOrder = await get<{ hits: { type: string }[] }>(
      `/api/search?q=${encodeURIComponent(`${TAG}-projectA`)}`,
    );
    expect(byOrder.body.hits.some((h) => h.type === 'projekt')).toBe(true);
  });

  it('findet Subunternehmer und Mitarbeiter', async () => {
    const sub = await get<{ hits: { type: string }[] }>(
      `/api/search?q=${encodeURIComponent(`Test Elektro ${TAG}`)}`,
    );
    expect(sub.body.hits.some((h) => h.type === 'sub')).toBe(true);

    const employee = await get<{ hits: { type: string }[] }>(
      `/api/search?q=${encodeURIComponent(`Monteur ${TAG}`)}`,
    );
    expect(employee.body.hits.some((h) => h.type === 'mitarbeiter')).toBe(true);
  });

  it('gibt bei zu kurzen Eingaben nichts zurück', async () => {
    const res = await get<{ hits: unknown[] }>('/api/search?q=a');
    expect(res.body.hits).toHaveLength(0);
  });
});

describe('Filter', () => {
  it('filtert die Plantafel nach Bauleiter', async () => {
    const res = await get<{ projects: { primarySiteManagerId: string }[] }>(
      `/api/board?datum=${MO}&zeitraum=woche&bauleiter=${ids.manager}&abgeschlossen=1`,
    );
    expect(res.body.projects.length).toBeGreaterThan(0);
    expect(res.body.projects.every((p) => p.primarySiteManagerId === ids.manager)).toBe(true);
  });

  it('zeigt mit „Nur Probleme" ausschließlich gelbe und rote Baustellen', async () => {
    const res = await get<{ projects: { trafficLight: string }[] }>(
      `/api/board?datum=${MO}&zeitraum=woche&nurProbleme=1&abgeschlossen=1`,
    );
    expect(res.body.projects.every((p) => ['ROT', 'GELB'].includes(p.trafficLight))).toBe(true);
  });

  it('filtert nach Ampelfarbe', async () => {
    const res = await get<{ projects: { trafficLight: string }[] }>(
      `/api/board?datum=${MO}&zeitraum=woche&ampel=ROT&abgeschlossen=1`,
    );
    expect(res.body.projects.every((p) => p.trafficLight === 'ROT')).toBe(true);
  });

  it('blendet abgeschlossene Projekte standardmäßig aus', async () => {
    await patch(`/api/projects/${ids.projectB}`, { status: 'ERLEDIGT' });
    const ohne = await get<{ projects: { id: string }[] }>(`/api/board?datum=${MO}&zeitraum=woche`);
    expect(ohne.body.projects.some((p) => p.id === ids.projectB)).toBe(false);

    const mit = await get<{ projects: { id: string }[] }>(
      `/api/board?datum=${MO}&zeitraum=woche&abgeschlossen=1`,
    );
    expect(mit.body.projects.some((p) => p.id === ids.projectB)).toBe(true);

    await patch(`/api/projects/${ids.projectB}`, { status: 'GEPLANT' });
  });
});

describe('Zeiträume der Plantafel', () => {
  it('liefert die passende Anzahl Tage je Ansicht', async () => {
    const tag = await get<{ days: string[] }>(`/api/board?datum=${MO}&zeitraum=tag`);
    expect(tag.body.days).toHaveLength(1);

    const woche = await get<{ days: string[] }>(`/api/board?datum=${MO}&zeitraum=woche`);
    expect(woche.body.days).toHaveLength(7);
    expect(woche.body.days[0]).toBe(MO);

    const zwei = await get<{ days: string[] }>(`/api/board?datum=${MO}&zeitraum=zweiwochen`);
    expect(zwei.body.days).toHaveLength(14);

    const monat = await get<{ days: string[] }>(`/api/board?datum=${MO}&zeitraum=monat`);
    expect(monat.body.days.length).toBeGreaterThanOrEqual(28);
    expect(monat.body.days[0].endsWith('-01')).toBe(true);
  });
});

describe('Subunternehmer anlegen', () => {
  it('legt einen SUB allein mit dem Firmennamen an und macht ihn sofort planbar', async () => {
    const created = await post<{
      subcontractor: { id: string; erpId: string | null };
      erp?: { erfolg: boolean };
      message: string;
    }>('/api/subcontractors', { companyName: `Blitz SUB ${TAG}` });
    expect(created.status).toBe(201);
    // Der Stammdatensatz gehört ins ERP – angelegt wird er dort gleich mit.
    expect(created.body.erp?.erfolg).toBe(true);
    expect(created.body.subcontractor.erpId).toBeTruthy();

    const planned = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: ids.projectA,
      resourceType: 'SUBUNTERNEHMER',
      subcontractorId: created.body.subcontractor.id,
      startDate: MO,
    });
    expect(planned.status).toBe(201);

    await del(`/api/assignments/${planned.body.assignment.id}`);
    await del(`/api/subcontractors/${created.body.subcontractor.id}`);
  });

  it('verlangt einen Firmennamen', async () => {
    const res = await post<{ error: string }>('/api/subcontractors', { companyName: '' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Firmenname/);
  });
});

describe('Ressourcen mit Historie werden deaktiviert statt gelöscht', () => {
  it('deaktiviert einen Mitarbeiter mit Einsätzen', async () => {
    const res = await del<{ message: string; deactivated?: boolean }>(
      `/api/employees/${ids.employee}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.deactivated).toBe(true);
    expect(res.body.message).toMatch(/deaktiviert statt gelöscht/);

    // Für die restlichen Tests wieder aktivieren.
    await patch(`/api/employees/${ids.employee}`, { active: true });
  });
});

describe('Subunternehmer mit Gewerken', () => {
  it('überträgt Gewerke und Notiz in den ERP-Kommentar', async () => {
    const created = await post<{
      subcontractor: { id: string; erpId: string | null };
      erp?: { erfolg: boolean; nachricht: string };
    }>('/api/subcontractors', {
      companyName: `Gewerk SUB ${TAG}`,
      street: 'Rosenstraße 12a',
      zip: '81675',
      city: 'München',
      phone: '+49 89 1234',
      note: 'Freigabe liegt vor',
      tradeName: `Estrich ${TAG}`,
    });

    expect(created.status).toBe(201);
    expect(created.body.erp?.erfolg).toBe(true);

    // Der Abgleich muss den eigenen Betrieb wiederfinden, statt ihn ein
    // zweites Mal anzulegen – geprüft am Betrieb selbst, nicht an einem
    // Gesamtzähler, den andere Testdaten mitbewegen.
    const sync = await post('/api/integrations/das-programm/sync', {});
    expect(sync.status).toBe(200);

    const nachher = await get<{ companyName: string }[]>('/api/subcontractors');
    const treffer = nachher.body.filter((s) => s.companyName === `Gewerk SUB ${TAG}`);
    expect(treffer).toHaveLength(1);

    await del(`/api/subcontractors/${created.body.subcontractor.id}`);
  });
});
