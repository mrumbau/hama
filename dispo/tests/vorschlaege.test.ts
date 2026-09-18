/**
 * Planvorschläge annehmen und ablehnen.
 *
 * Gegen die laufende App, nicht gegen eine Behauptung: Ob das Ablehnen
 * ohne Grund durchgeht, entscheidet das Schema im Server – das lässt sich
 * nur feststellen, indem man es abschickt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { del, get, mondayOfNextWeek, post, TAG } from './helpers';

const MO = mondayOfNextWeek();

let projektId = '';
let mitarbeiterId = '';
const aufraeumen: string[] = [];

interface Vorschlag {
  id: string;
  ressource: string;
  vorgeschlagenVon: string;
}

async function neuerEinsatz(): Promise<string> {
  const res = await post<{ assignment: { id: string }; message: string }>('/api/assignments', {
    projectId: projektId,
    resourceType: 'MITARBEITER',
    employeeId: mitarbeiterId,
    startDate: MO,
    force: true,
  });
  expect(res.status).toBe(201);
  aufraeumen.push(res.body.assignment.id);
  return res.body.assignment.id;
}

beforeAll(async () => {
  const projekt = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Vorschlaege ${TAG}`,
    name: 'Testbaustelle',
  });
  projektId = projekt.body.project.id;

  const person = await post<{ employee: { id: string } }>('/api/employees', {
    firstName: 'Test',
    lastName: `Vorschlagender ${TAG}`,
  });
  mitarbeiterId = person.body.employee.id;
});

afterAll(async () => {
  for (const id of aufraeumen) await del(`/api/assignments/${id}`);
  if (mitarbeiterId) await del(`/api/employees/${mitarbeiterId}`);
  if (projektId) await del(`/api/projects/${projektId}`);
});

describe('Neue Einsätze sind Vorschläge', () => {
  it('meldet beim Anlegen, dass es ein Vorschlag ist – auch als Admin', async () => {
    const res = await post<{ message: string }>('/api/assignments', {
      projectId: projektId,
      resourceType: 'MITARBEITER',
      employeeId: mitarbeiterId,
      startDate: MO,
      force: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Vorschlag/);
    const id = (res.body as unknown as { assignment: { id: string } }).assignment.id;
    aufraeumen.push(id);
  });

  it('steht danach in der Vorschlagsliste, mit Namen des Urhebers', async () => {
    const id = await neuerEinsatz();
    const liste = await get<{ darfFreigeben: boolean; vorschlaege: Vorschlag[] }>(
      '/api/planvorschlaege',
    );
    const meiner = liste.body.vorschlaege.find((v) => v.id === id);
    expect(meiner, 'Der Vorschlag fehlt in der Liste').toBeDefined();
    // Ohne den Namen muss man jeden Vorschlag anklicken, um zu wissen, mit
    // wem man reden muss.
    expect(meiner!.vorgeschlagenVon).not.toBe('Unbekannt');
  });
});

describe('Annehmen und Ablehnen', () => {
  it('nimmt mehrere auf einmal an', async () => {
    const a = await neuerEinsatz();
    const b = await neuerEinsatz();

    const res = await post<{ anzahl: number }>('/api/planvorschlaege', {
      ids: [a, b],
      annehmen: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.anzahl).toBe(2);

    // Danach sind sie aus der Liste raus.
    const liste = await get<{ vorschlaege: Vorschlag[] }>('/api/planvorschlaege');
    const offen = liste.body.vorschlaege.map((v) => v.id);
    expect(offen).not.toContain(a);
    expect(offen).not.toContain(b);
  });

  it('lehnt OHNE Grund ab – wer sich gegenübersitzt, tippt keine Begründung', async () => {
    const id = await neuerEinsatz();
    const res = await post<{ anzahl: number }>('/api/planvorschlaege', {
      ids: [id],
      annehmen: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.anzahl).toBe(1);
  });

  it('nimmt einen Grund entgegen, wenn einer dasteht', async () => {
    const id = await neuerEinsatz();
    const res = await post<{ anzahl: number }>('/api/planvorschlaege', {
      ids: [id],
      annehmen: false,
      grund: 'Fidan wird auf Softic gebraucht',
    });
    expect(res.status).toBe(200);
  });

  it('meldet, wenn keiner der Vorschläge mehr offen ist', async () => {
    const id = await neuerEinsatz();
    await post('/api/planvorschlaege', { ids: [id], annehmen: true });
    // Zweiter Anlauf auf denselben - der ist kein Vorschlag mehr.
    const res = await post('/api/planvorschlaege', { ids: [id], annehmen: true });
    expect(res.status).toBe(404);
  });
});

describe('Doppelt vorgeschlagen', () => {
  /*
   * Zwei Bauleiter planen unabhängig voneinander drei Wochen voraus – dass
   * beide denselben Mann wollen, merkt sonst niemand vor dem Treffen.
   */
  it('nennt in der Liste, wer denselben Mann noch vorgeschlagen hat', async () => {
    const zweites = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Vorschlaege zweite ${TAG}`,
      name: 'Zweite Testbaustelle',
    });
    const zweiteId = zweites.body.project.id;

    const a = await neuerEinsatz();
    const b = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: zweiteId,
      resourceType: 'MITARBEITER',
      employeeId: mitarbeiterId,
      startDate: MO,
      force: true,
    });
    const zweiterEinsatz = b.body.assignment.id;
    aufraeumen.push(zweiterEinsatz);

    try {
      const liste = await get<{
        doppelt: { ressource: string; tage: string[]; beteiligte: { id: string }[] }[];
      }>('/api/planvorschlaege');

      const treffer = liste.body.doppelt.find((d) =>
        d.beteiligte.some((x) => x.id === a) && d.beteiligte.some((x) => x.id === zweiterEinsatz),
      );
      expect(treffer, 'Der doppelte Vorschlag wird nicht gemeldet').toBeDefined();
      expect(treffer!.tage).toContain(MO);
    } finally {
      await del(`/api/assignments/${zweiterEinsatz}`);
      await del(`/api/projects/${zweiteId}`);
    }
  });

  it('warnt schon beim Anlegen und sagt, von wem der andere Vorschlag ist', async () => {
    const zweites = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Vorschlaege dritte ${TAG}`,
      name: 'Dritte Testbaustelle',
    });
    const zweiteId = zweites.body.project.id;
    const a = await neuerEinsatz();

    try {
      // Ohne force: Genau dann kommt die Warnung, statt still angelegt zu werden.
      const res = await post<{ error: string; conflicts: { istVorschlag: boolean }[] }>(
        '/api/assignments',
        {
          projectId: zweiteId,
          resourceType: 'MITARBEITER',
          employeeId: mitarbeiterId,
          startDate: MO,
        },
      );
      expect(res.status).toBe(409);
      expect(res.body.conflicts[0].istVorschlag).toBe(true);
      // Der Name ist der Punkt: Man soll wissen, wen man anruft.
      expect(res.body.error).toMatch(/vorgeschlagen von /i);
      expect(res.body.error).toMatch(/nur einer/i);
    } finally {
      await del(`/api/assignments/${a}`);
      await del(`/api/projects/${zweiteId}`);
    }
  });
});
