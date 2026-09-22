/**
 * Der rote Rahmen auf der Plantafel.
 *
 * Die Regel, wann sich zwei Einsätze überschneiden, steht in
 * `konflikte.test.ts`. Hier geht es um etwas anderes: ob die Tafel sie auch
 * wirklich benutzt. Genau dort saß der Fehler – die Regel war richtig, aber
 * das Brett rechnete mit einer eigenen, strengeren Kopie und malte einen
 * roten Rahmen um zwei Einsätze, die sich gar nicht in die Quere kamen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { del, get, mondayOfNextWeek, post, TAG } from './helpers';

const TAGESDATUM = mondayOfNextWeek();

let frueheBaustelle = '';
let spaeteBaustelle = '';
let mitarbeiterId = '';
const aufraeumen: string[] = [];

interface BoardAntwort {
  conflicts: Record<string, string[]>;
  assignments: { id: string; resourceKey: string }[];
}

async function einsatz(
  projectId: string,
  startTime: string | null,
  endTime: string | null,
): Promise<string> {
  const res = await post<{ assignment: { id: string } }>('/api/assignments', {
    projectId,
    resourceType: 'MITARBEITER',
    employeeId: mitarbeiterId,
    startDate: TAGESDATUM,
    startTime,
    endTime,
    force: true,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  aufraeumen.push(res.body.assignment.id);
  return res.body.assignment.id;
}

/**
 * Steht an diesem Tag ein Konflikt für unseren Mann auf der Tafel?
 *
 * Der Schlüssel wird aus der Mitarbeiter-ID gebaut, nicht aus der Antwort
 * beim Anlegen – die enthält kein `resourceKey`. Genau daran ist der erste
 * Anlauf dieses Tests gescheitert: Er fragte nach `undefined|…` und bekam
 * immer „kein Konflikt", egal was auf der Tafel stand.
 */
async function konfliktAufDerTafel(): Promise<string[] | undefined> {
  const res = await get<BoardAntwort>(`/api/board?datum=${TAGESDATUM}&zeitraum=tag`);
  expect(res.status).toBe(200);
  // Gegenprobe, dass wir überhaupt am richtigen Tag suchen.
  expect(res.body.assignments.length).toBeGreaterThan(0);
  return res.body.conflicts[`MITARBEITER:${mitarbeiterId}|${TAGESDATUM}`];
}

beforeAll(async () => {
  const eins = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Frueh ${TAG}`,
    name: 'Vormittagsbaustelle',
  });
  frueheBaustelle = eins.body.project.id;

  const zwei = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Spaet ${TAG}`,
    name: 'Nachmittagsbaustelle',
  });
  spaeteBaustelle = zwei.body.project.id;

  const person = await post<{ employee: { id: string } }>('/api/employees', {
    firstName: 'Zeit',
    lastName: `Pruefer ${TAG}`,
  });
  mitarbeiterId = person.body.employee.id;
});

afterAll(async () => {
  for (const id of aufraeumen) await del(`/api/assignments/${id}`);
  if (mitarbeiterId) await del(`/api/employees/${mitarbeiterId}`);
  if (frueheBaustelle) await del(`/api/projects/${frueheBaustelle}`);
  if (spaeteBaustelle) await del(`/api/projects/${spaeteBaustelle}`);
});

describe('Zwei Baustellen am selben Tag', () => {
  it('malt keinen roten Rahmen bei 7–9 Uhr und „ab 11 Uhr"', async () => {
    // Der gemeldete Fall, eins zu eins.
    await einsatz(frueheBaustelle, '07:00', '09:00');
    await einsatz(spaeteBaustelle, '11:00', null);

    expect(await konfliktAufDerTafel()).toBeUndefined();
  });

  it('meldet weiterhin, wenn die Zeiten sich wirklich überschneiden', async () => {
    // Die Regel wird gelockert, nicht abgeschafft: 8–14 und 13–17 kollidieren.
    for (const id of aufraeumen.splice(0)) await del(`/api/assignments/${id}`);

    await einsatz(frueheBaustelle, '08:00', '14:00');
    await einsatz(spaeteBaustelle, '13:00', '17:00');

    const betroffen = await konfliktAufDerTafel();
    expect(betroffen).toBeDefined();
    expect(betroffen).toHaveLength(2);
  });

  it('meldet, wenn bei beiden gar keine Uhrzeit steht', async () => {
    for (const id of aufraeumen.splice(0)) await del(`/api/assignments/${id}`);

    await einsatz(frueheBaustelle, null, null);
    await einsatz(spaeteBaustelle, null, null);

    expect(await konfliktAufDerTafel()).toBeDefined();
  });
});
