/**
 * Lager und Besorgungsfahrten.
 *
 * Zwei feste Zeilen der Plantafel, die es in „Das Programm" nicht gibt.
 * Sie müssen immer da sein – deshalb wird hier vor allem festgenagelt, was
 * mit ihnen NICHT passieren darf.
 */
import { describe, expect, it } from 'vitest';
import { addDays, del, get, mondayOfNextWeek, patch, post, TAG } from './helpers';

interface Projekt {
  id: string;
  internKey: string | null;
  name: string;
  status: string;
}

async function festerEintrag(schluessel: string): Promise<Projekt> {
  const board = await get<{ projects: Projekt[] }>('/api/board');
  const treffer = board.body.projects.find((p) => p.internKey === schluessel);
  expect(treffer, `${schluessel} muss auf der Tafel stehen`).toBeDefined();
  return treffer!;
}

describe('Feste Einträge auf der Plantafel', () => {
  it('stehen alle vier auf der Tafel', async () => {
    expect((await festerEintrag('LAGER')).name).toBe('Lager');
    expect((await festerEintrag('BESORGUNG')).name).toBe('Besorgungsfahrten');
    // Abwesenheit ist kein eigenes Datenmodell: Wer im Urlaub ist, ist
    // belegt - genau wie auf einer Baustelle.
    expect((await festerEintrag('URLAUB')).name).toBe('Urlaub');
    expect((await festerEintrag('KRANK')).name).toBe('Krank / Abwesend');
  });

  it('stehen ganz unten, nicht zwischen den Baustellen', async () => {
    // Sie sind keine Baustellen und sollen die Baustellen nicht nach unten
    // druecken. In der Ressourcenansicht landen sie damit ganz rechts.
    const board = await get<{ projects: Projekt[] }>('/api/board');
    const letzte = board.body.projects.slice(-4).map((p) => p.internKey);
    expect(letzte.filter(Boolean)).toHaveLength(4);
  });

  it('überleben jeden Filter – sonst fehlte die Zeile, in die man plant', async () => {
    // „Nur aktuelle Terminierung" blendet alles ohne Bauzeit weg. Lager und
    // Besorgungsfahrten haben nie eine.
    const board = await get<{ projects: Projekt[] }>('/api/board?aktuell=1&ampel=ROT');
    const feste = board.body.projects.filter((p) => p.internKey);
    expect(feste).toHaveLength(4);
  });

  it('lassen sich nicht löschen', async () => {
    const lager = await festerEintrag('LAGER');
    const res = await del<{ error?: string; message?: string }>(`/api/projects/${lager.id}`);
    expect(res.status).toBe(409);

    // Und sind danach immer noch da.
    expect((await festerEintrag('LAGER')).id).toBe(lager.id);
  });

  it('lassen sich nicht umbenennen oder umwidmen', async () => {
    const lager = await festerEintrag('LAGER');
    expect((await patch(`/api/projects/${lager.id}`, { name: 'Halle 2' })).status).toBe(409);
    expect((await patch(`/api/projects/${lager.id}`, { status: 'ERLEDIGT' })).status).toBe(409);
    expect((await patch(`/api/projects/${lager.id}`, { customerName: 'Wer auch immer' })).status).toBe(
      409,
    );

    expect((await festerEintrag('LAGER')).name).toBe('Lager');
  });

  it('nehmen Notizen an – dafür sind die Besorgungsfahrten da', async () => {
    const fahrten = await festerEintrag('BESORGUNG');
    const res = await patch<{ message: string }>(`/api/projects/${fahrten.id}`, {
      internalNotes: 'Fliesenkleber für Softic, 12 Sack',
    });
    expect(res.status).toBe(200);

    const geladen = await get<{ project: { internalNotes: string | null } }>(
      `/api/projects/${fahrten.id}`,
    );
    expect(geladen.body.project.internalNotes).toMatch(/Fliesenkleber/);
  });
});

/**
 * Abwesenheit ist ein Einsatz wie jeder andere.
 *
 * Wer im Urlaub ist, ist belegt – und die App soll ihn beim Doppelbelegen
 * genauso anmeckern wie bei zwei Baustellen. Genau deshalb ist Urlaub eine
 * Zeile auf der Tafel und keine eigene Tabelle.
 */
describe('Abwesenheiten', () => {
  it('lässt sich einplanen und über mehrere Tage aufziehen', async () => {
    const urlaub = await festerEintrag('URLAUB');
    const person = await post<{ employee: { id: string } }>('/api/employees', {
      firstName: 'Test',
      lastName: `Urlauber ${TAG}`,
    });
    const mitarbeiterId = person.body.employee.id;
    const MO = mondayOfNextWeek();
    const FR = addDays(MO, 4);

    const einsatz = await post<{ assignment: { id: string } }>('/api/assignments', {
      projectId: urlaub.id,
      resourceType: 'MITARBEITER',
      employeeId: mitarbeiterId,
      startDate: MO,
      endDate: FR,
    });
    expect(einsatz.status).toBe(201);

    // Und jetzt ist die Person belegt: Ein zweiter Einsatz in derselben
    // Woche muss als Konflikt auffallen.
    const board = await get<{ conflicts: Record<string, string[]> }>(
      `/api/board?datum=${MO}&zeitraum=woche`,
    );
    expect(board.status).toBe(200);

    await del(`/api/assignments/${einsatz.body.assignment.id}`);
    await del(`/api/employees/${mitarbeiterId}`);
  });
});

/**
 * Die festen Zeilen sind keine Projekte und haben in der Projektliste
 * nichts verloren – dort sucht man Baustellen aus „Das Programm".
 */
describe('Nicht in der Projektliste', () => {
  it('taucht keine der vier festen Zeilen bei den Projekten auf', async () => {
    const res = await get<{ projects: { internKey: string | null }[] }>(
      '/api/projects?abgeschlossen=1',
    );
    expect(res.body.projects.filter((p) => p.internKey)).toHaveLength(0);
  });

  it('steht aber weiterhin auf der Plantafel', async () => {
    const board = await get<{ projects: { internKey: string | null }[] }>('/api/board');
    expect(board.body.projects.filter((p) => p.internKey)).toHaveLength(4);
  });
});
