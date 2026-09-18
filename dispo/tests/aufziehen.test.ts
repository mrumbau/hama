/**
 * Einen Einsatz über mehrere Tage aufziehen.
 *
 * Bisher musste man denselben Monteur in jeden Tag einzeln ziehen. Wer eine
 * Woche plant, macht das fünfmal – pro Person. Hier wird stattdessen die
 * rechte Kante gepackt und über die Woche gezogen.
 *
 * Aufziehen ist ausdrücklich etwas anderes als Verschieben: Der Beginn
 * bleibt stehen, nur das Ende wandert. Genau das wird hier festgenagelt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, del, get, mondayOfNextWeek, patch, post, TAG } from './helpers';

const MO = mondayOfNextWeek();
const MI = addDays(MO, 2);
const FR = addDays(MO, 4);

let projektId = '';
let mitarbeiterId = '';
let einsatzId = '';

beforeAll(async () => {
  const projekt = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Aufziehen ${TAG}`,
    name: 'Testbaustelle',
  });
  projektId = projekt.body.project.id;

  const person = await post<{ employee: { id: string } }>('/api/employees', {
    firstName: 'Test',
    lastName: `Aufzieher ${TAG}`,
  });
  mitarbeiterId = person.body.employee.id;

  const einsatz = await post<{ assignment: { id: string } }>('/api/assignments', {
    projectId: projektId,
    resourceType: 'MITARBEITER',
    employeeId: mitarbeiterId,
    startDate: MO,
  });
  expect(einsatz.status).toBe(201);
  einsatzId = einsatz.body.assignment.id;
});

afterAll(async () => {
  if (einsatzId) await del(`/api/assignments/${einsatzId}`);
  if (mitarbeiterId) await del(`/api/employees/${mitarbeiterId}`);
  if (projektId) await del(`/api/projects/${projektId}`);
});

async function einsatz() {
  const res = await get<{ assignments: { id: string; startDate: string; endDate: string }[] }>(
    `/api/board?datum=${MO}&zeitraum=woche&abgeschlossen=1`,
  );
  return res.body.assignments.find((a) => a.id === einsatzId);
}

describe('Einsatz aufziehen', () => {
  it('beginnt als Eintagseinsatz', async () => {
    expect(await einsatz()).toMatchObject({ startDate: MO, endDate: MO });
  });

  it('zieht bis Freitag auf, ohne den Beginn zu verschieben', async () => {
    const res = await patch<{ message: string }>(`/api/assignments/${einsatzId}`, {
      endDate: FR,
      force: true,
    });
    expect(res.status).toBe(200);
    expect(await einsatz()).toMatchObject({ startDate: MO, endDate: FR });
  });

  it('steht danach in jeder Tageszelle der Woche', async () => {
    const res = await get<{ assignments: { id: string; startDate: string; endDate: string }[] }>(
      `/api/board?datum=${MO}&zeitraum=woche&abgeschlossen=1`,
    );
    const a = res.body.assignments.find((x) => x.id === einsatzId)!;
    // Die Tafel verteilt einen Einsatz ueber alle Tage zwischen Beginn und
    // Ende - deshalb genuegt der Zeitraum, es braucht keine fuenf Einsaetze.
    expect(a.startDate <= MI && MI <= a.endDate).toBe(true);
  });

  it('lässt sich wieder zusammenziehen', async () => {
    await patch(`/api/assignments/${einsatzId}`, { endDate: MI, force: true });
    expect(await einsatz()).toMatchObject({ startDate: MO, endDate: MI });
  });

  it('weist ein Ende vor dem Beginn ab, statt den Einsatz umzudrehen', async () => {
    const res = await patch<{ error?: string }>(`/api/assignments/${einsatzId}`, {
      endDate: addDays(MO, -3),
      force: true,
    });
    expect(res.status).toBe(422);
    // Und der Einsatz steht unveraendert da.
    expect(await einsatz()).toMatchObject({ startDate: MO, endDate: MI });
  });
});
