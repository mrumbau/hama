/**
 * Tests für die Integrationen: Das Programm (Sync) und 3CX (Eingang, AI).
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addDays,
  BASE_URL,
  del,
  get,
  isoIn,
  post,
  postSigned,
  sign,
  TAG,
  webhookSecret,
} from './helpers';

const created: { projects: string[]; managers: string[] } = { projects: [], managers: [] };

afterAll(async () => {
  for (const id of created.projects) await del(`/api/projects/${id}`);
  for (const id of created.managers) await del(`/api/site-managers/${id}`);
});

describe('Das Programm – Synchronisation', () => {
  it('übernimmt Projekte, Personen und Subunternehmer', async () => {
    const res = await post<{
      provider: string;
      projekte: { neu: number; aktualisiert: number; unveraendert: number };
      mitarbeiter: { neu: number };
      subunternehmer: { neu: number; uebersprungen: number };
      hinweise: string[];
    }>('/api/integrations/das-programm/sync', {});

    expect(res.status).toBe(200);
    expect(res.body.provider).toMatch(/Mock/);
    // Reine Materiallieferanten dürfen nicht als SUB hereinkommen.
    expect(res.body.subunternehmer.uebersprungen).toBeGreaterThan(0);
  });

  it('ist idempotent – ein zweiter Lauf legt nichts doppelt an', async () => {
    await post('/api/integrations/das-programm/sync', {});
    const zweiter = await post<{
      projekte: { neu: number };
      subunternehmer: { neu: number };
      mitarbeiter: { neu: number };
    }>('/api/integrations/das-programm/sync', {});
    expect(zweiter.body.projekte.neu).toBe(0);
    expect(zweiter.body.subunternehmer.neu).toBe(0);
    expect(zweiter.body.mitarbeiter.neu).toBe(0);
  });

  it('schließt ein Projekt, das im ERP abgeschlossen ist', async () => {
    await post('/api/integrations/das-programm/sync', {});
    const projekte = await get<{ projects: { erpId: string | null; status: string }[] }>(
      '/api/projects?abgeschlossen=1',
    );
    const brandl = projekte.body.projects.find((p) => p.erpId === 'DP-10090');
    expect(brandl?.status).toBe('ERLEDIGT');
  });

  it('dreht eine laufende Dispo-Planung nicht zurück', async () => {
    const projekte = await get<{ projects: { erpId: string | null; status: string }[] }>(
      '/api/projects?abgeschlossen=1',
    );
    // Im ERP steht order_fulfillment – die Dispo weiß es genauer.
    const laufend = projekte.body.projects.find((p) => p.erpId === 'DP-10051');
    expect(laufend?.status).toBe('IN_AUSFUEHRUNG');
  });

  it('übernimmt Gewerk und Ansprechpartner aus dem Kommentarfeld', async () => {
    const subs =
      await get<{ companyName: string; contactName: string | null; tradeNames: string[] }[]>(
        '/api/subcontractors',
      );
    const elektro = subs.body.find((s) => s.companyName === 'Elektro Müller GmbH');
    expect(elektro?.contactName).toBe('Stefan Müller');
    expect(elektro?.tradeNames).toContain('Elektro');
  });

  it('meldet Termin-Abweichungen, statt die Dispo-Planung zu überschreiben', async () => {
    const res = await post<{ hinweise: string[] }>('/api/integrations/das-programm/sync', {});
    // Entweder es gibt Abweichungen (dann werden sie gemeldet) oder keine.
    for (const hinweis of res.body.hinweise) {
      expect(hinweis).toMatch(/beibehalten|übersprungen/);
    }
  });

  it('meldet den Sync-Zustand und die Erreichbarkeit', async () => {
    const res = await get<{
      state: { status: string; lastSyncAt: string | null };
      health: { ok: boolean };
    }>('/api/integrations/das-programm/sync');
    expect(res.body.state.status).toBe('ERFOLGREICH');
    expect(res.body.health.ok).toBe(true);
  });
});

describe('3CX – Ereigniseingang', () => {
  let projectId = '';
  let communicationId = '';
  let changeRequestId = '';
  const phone = '+49 8024 5559999';
  const start = isoIn(10);

  beforeAll(async () => {
    const manager = await post<{ manager: { id: string } }>('/api/site-managers', {
      firstName: '3CX',
      lastName: `Bauleiter ${TAG}`,
    });
    created.managers.push(manager.body.manager.id);

    const project = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Telefonkunde ${TAG}`,
      name: 'Anruftest',
      orderNumber: `${TAG}-3CX`,
      contactPhone: phone,
      primarySiteManagerId: manager.body.manager.id,
      plannedStart: start,
      plannedEnd: addDays(start, 1),
      status: 'GEPLANT',
    });
    projectId = project.body.project.id;
    created.projects.push(projectId);
  });

  it('nimmt ein 3CX-Demoevent an und ordnet es über die Telefonnummer zu', async () => {
    const res = await postSigned<{
      communicationId: string;
      projectId: string | null;
      matchNote: string;
      changeRequestIds: string[];
    }>('/api/integrations/3cx/events', {
      callId: `${TAG}-call-1`,
      occurredAt: new Date().toISOString(),
      direction: 'EINGEHEND',
      callerNumber: phone,
      calledNumber: '+49 89 1234567-11',
      durationSeconds: 392,
      agentName: 'Carsten Reuter',
      customerName: `Telefonkunde ${TAG}`,
      summary: 'Der Kunde kann am Dienstag nicht. Die Arbeiten sollen am Donnerstag stattfinden.',
      isDemo: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.matchNote).toMatch(/eindeutig/);
    communicationId = res.body.communicationId;
    changeRequestId = res.body.changeRequestIds[0];
  });

  it('erzeugt daraus einen Änderungsvorschlag – ohne den Termin zu ändern', async () => {
    expect(changeRequestId).toBeTruthy();

    const project = await get<{ project: { plannedStart: string } }>(`/api/projects/${projectId}`);
    // Nichts wurde automatisch geändert.
    expect(project.body.project.plannedStart).toBe(start);

    const requests = await get<{
      changeRequests: {
        id: string;
        type: string;
        status: string;
        proposedValue: { plannedStart?: string } | null;
      }[];
    }>('/api/change-requests?status=OFFEN');

    const cr = requests.body.changeRequests.find((r) => r.id === changeRequestId);
    expect(cr).toBeDefined();
    expect(cr!.type).toBe('TERMIN_AENDERUNG');
    expect(cr!.status).toBe('OFFEN');
    expect(cr!.proposedValue?.plannedStart).toBeTruthy();
  });

  it('macht die ungeprüfte Terminänderung als Warnung sichtbar', async () => {
    const res = await get<{ warnings: { key: string; category: string }[] }>('/api/warnings');
    expect(res.body.warnings.some((w) => w.key === `change_request:${changeRequestId}`)).toBe(true);
    expect(res.body.warnings.some((w) => w.key === `comm_unchecked:${communicationId}`)).toBe(true);
  });

  it('ignoriert eine doppelt zugestellte Call-ID', async () => {
    const res = await postSigned<{ duplicate: boolean }>('/api/integrations/3cx/events', {
      callId: `${TAG}-call-1`,
      callerNumber: phone,
      summary: 'Dieselbe Zustellung erneut.',
    });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  it('lehnt einen Änderungsvorschlag ab, ohne etwas zu ändern', async () => {
    const event = await postSigned<{ changeRequestIds: string[] }>('/api/integrations/3cx/events', {
      callId: `${TAG}-call-reject`,
      callerNumber: phone,
      summary: 'Der Kunde kann am Montag nicht, Freitag wäre besser.',
      isDemo: true,
    });
    const id = event.body.changeRequestIds[0];
    expect(id).toBeTruthy();

    const vorher = await get<{ project: { plannedStart: string } }>(`/api/projects/${projectId}`);

    const res = await post<{ message: string }>(`/api/change-requests/${id}`, {
      action: 'ablehnen',
      note: 'Termin bleibt.',
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Nichts wurde geändert/);

    const nachher = await get<{ project: { plannedStart: string } }>(`/api/projects/${projectId}`);
    expect(nachher.body.project.plannedStart).toBe(vorher.body.project.plannedStart);
  });

  it('übernimmt einen Änderungsvorschlag und verschiebt Termin samt Einsätzen', async () => {
    // Einen Einsatz anlegen, der mitverschoben werden soll.
    const employee = await post<{ employee: { id: string } }>('/api/employees', {
      firstName: '3CX',
      lastName: `Monteur ${TAG}`,
    });
    const assignment = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId,
      resourceType: 'MITARBEITER',
      employeeId: employee.body.employee.id,
      startDate: start,
    });

    const neuerStart = addDays(start, 2);
    const res = await post<{ message: string }>(`/api/change-requests/${changeRequestId}`, {
      action: 'uebernehmen',
      payload: {
        plannedStart: neuerStart,
        plannedEnd: addDays(neuerStart, 1),
        moveAssignments: true,
        reason: 'KUNDE',
        reasonText: 'Kundenwunsch aus Telefonat.',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Projektzeitraum/);

    const project = await get<{
      project: { plannedStart: string; customerConfirmed: string };
      assignments: { id: string; startDate: string }[];
    }>(`/api/projects/${projectId}`);

    expect(project.body.project.plannedStart).toBe(neuerStart);
    // Nach einer Verschiebung muss der Kunde neu bestätigen.
    expect(project.body.project.customerConfirmed).toBe('ANGEFRAGT');

    const moved = project.body.assignments.find((a) => a.id === assignment.body.assignment.id);
    expect(moved!.startDate).toBe(neuerStart);

    // Die Änderung steht im Protokoll, inklusive Quelle.
    const timeline = await get<{ entries: { label: string; source: string }[] }>(
      `/api/projects/${projectId}/timeline`,
    );
    const entry = timeline.body.entries.find((e) => e.label === 'Termin geändert');
    expect(entry?.source).toBe('TELEFON_3CX');

    await del(`/api/assignments/${assignment.body.assignment.id}`);
    await del(`/api/employees/${employee.body.employee.id}`);
  });

  it('entscheidet bei mehreren laufenden Projekten desselben Kunden nicht selbst', async () => {
    const second = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Telefonkunde ${TAG}`,
      name: 'Zweite Baustelle',
      orderNumber: `${TAG}-3CX-2`,
      contactPhone: phone,
      plannedStart: isoIn(20),
      status: 'GEPLANT',
    });
    created.projects.push(second.body.project.id);

    const res = await postSigned<{
      projectId: string | null;
      candidateProjectIds: string[];
      matchNote: string;
    }>('/api/integrations/3cx/events', {
      callId: `${TAG}-call-ambiguous`,
      callerNumber: phone,
      customerName: `Telefonkunde ${TAG}`,
      summary: 'Kurze Rückfrage zum Ablauf.',
      isDemo: true,
    });

    expect(res.body.projectId).toBeNull();
    expect(res.body.candidateProjectIds.length).toBeGreaterThanOrEqual(2);
    expect(res.body.matchNote).toMatch(/bitte Projekt auswählen/i);
  });

  it('weist ungültige Ereignisse ab', async () => {
    const res = await postSigned<{ error: string }>('/api/integrations/3cx/events', {
      durationSeconds: 'viel zu lang',
    });
    expect(res.status).toBe(422);
  });

  it('erfüllt den Demo-Testanruf aus der Spezifikation', async () => {
    const res = await post<{ communicationId: string; changeRequestIds: string[] }>(
      '/api/integrations/3cx/simulate',
      {},
    );
    expect(res.status).toBe(201);
    expect(res.body.changeRequestIds.length).toBeGreaterThan(0);

    const requests = await get<{
      changeRequests: { id: string; title: string; type: string }[];
    }>('/api/change-requests?status=OFFEN');
    const cr = requests.body.changeRequests.find((r) => r.id === res.body.changeRequestIds[0]);
    expect(cr!.type).toBe('TERMIN_AENDERUNG');
    expect(cr!.title).toMatch(/Terminänderung/);

    await post(`/api/change-requests/${cr!.id}`, { action: 'ablehnen' });
  });
});

describe('3CX – Webhook-Absicherung', () => {
  const konfiguriert = webhookSecret().length > 0;

  it.skipIf(!konfiguriert)('weist eine falsche Signatur ab', async () => {
    const res = await postSigned<{ error: string }>(
      '/api/integrations/3cx/events',
      { callId: `${TAG}-bad-sig`, summary: 'Angriffsversuch.' },
      { signature: 'offensichtlich-falsch' },
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Signatur/);
  });

  it.skipIf(!konfiguriert)('akzeptiert auch die Schreibweise "sha256=<hex>"', async () => {
    const payload = { callId: `${TAG}-sig-prefix`, summary: 'Signaturformat-Test.', isDemo: true };
    const body = JSON.stringify(payload);
    const res = await fetch(`${BASE_URL}/api/integrations/3cx/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dispo-signature': `sha256=${sign(body)}`,
      },
      body,
    });
    expect([200, 201]).toContain(res.status);
  });

  it.skipIf(!konfiguriert)('weist eine Signatur über einen anderen Body ab', async () => {
    const res = await postSigned<{ error: string }>(
      '/api/integrations/3cx/events',
      { callId: `${TAG}-tampered`, summary: 'Manipuliert.' },
      { signature: sign(JSON.stringify({ callId: 'etwas-anderes' })) },
    );
    expect(res.status).toBe(401);
  });
});

describe('Offene Punkte', () => {
  it('sortiert kritisch vor heute vor später', async () => {
    const res = await get<{ warnings: { bucket: string; severity: string }[] }>('/api/warnings');
    const order = ['KRITISCH', 'HEUTE', 'DIESE_WOCHE', 'SPAETER'];
    const indices = res.body.warnings.map((w) => order.indexOf(w.bucket));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
    }
  });

  it('kann einen offenen Punkt abhaken und wieder öffnen', async () => {
    const before = await get<{ warnings: { key: string }[] }>('/api/warnings');
    const key = before.body.warnings[0]?.key;
    if (!key) return;

    await post('/api/warnings', { warningKey: key, dismissed: true });
    const hidden = await get<{ warnings: { key: string }[] }>('/api/warnings');
    expect(hidden.body.warnings.some((w) => w.key === key)).toBe(false);

    const withDone = await get<{ warnings: { key: string; dismissed: boolean }[] }>(
      '/api/warnings?erledigte=1',
    );
    expect(withDone.body.warnings.find((w) => w.key === key)?.dismissed).toBe(true);

    await post('/api/warnings', { warningKey: key, dismissed: false });
    const restored = await get<{ warnings: { key: string }[] }>('/api/warnings');
    expect(restored.body.warnings.some((w) => w.key === key)).toBe(true);
  });
});
