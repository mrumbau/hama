/**
 * Lager und Besorgungsfahrten.
 *
 * Zwei feste Zeilen der Plantafel, die es in „Das Programm" nicht gibt.
 * Sie müssen immer da sein – deshalb wird hier vor allem festgenagelt, was
 * mit ihnen NICHT passieren darf.
 */
import { describe, expect, it } from 'vitest';
import { del, get, patch } from './helpers';

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
  it('stehen beide auf der Tafel', async () => {
    expect((await festerEintrag('LAGER')).name).toBe('Lager');
    expect((await festerEintrag('BESORGUNG')).name).toBe('Besorgungsfahrten');
  });

  it('stehen oben, nicht zwischen den Baustellen', async () => {
    const board = await get<{ projects: Projekt[] }>('/api/board');
    const ersteZwei = board.body.projects.slice(0, 2).map((p) => p.internKey);
    expect(ersteZwei).toContain('LAGER');
    expect(ersteZwei).toContain('BESORGUNG');
  });

  it('überleben jeden Filter – sonst fehlte die Zeile, in die man plant', async () => {
    // „Nur aktuelle Terminierung" blendet alles ohne Bauzeit weg. Lager und
    // Besorgungsfahrten haben nie eine.
    const board = await get<{ projects: Projekt[] }>('/api/board?aktuell=1&ampel=ROT');
    const feste = board.body.projects.filter((p) => p.internKey);
    expect(feste).toHaveLength(2);
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
