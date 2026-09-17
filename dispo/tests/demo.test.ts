/**
 * Demo-Daten entfernen.
 *
 * Die heikle Eigenschaft dieser Funktion ist nicht, dass sie löscht –
 * sondern dass sie NUR löscht, was als Demo markiert ist. Ein echter
 * Auftrag, der hier mitgeht, ist nicht wiederherstellbar.
 */
import { describe, expect, it } from 'vitest';
import { get, post, del, TAG } from './helpers';

describe('Demo-Daten entfernen', () => {
  it('lässt echte Daten unangetastet', async () => {
    // Ein echtes Projekt, wie es aus „Das Programm" käme: ohne isDemo.
    const echt = await post<{ project: { id: string } }>('/api/projects', {
      customerName: `Echt ${TAG}`,
      name: `Baustelle ${TAG}`,
    });
    expect(echt.status).toBe(201);

    const res = await del<{ message: string; gesamt: number }>('/api/demo');
    expect(res.status).toBe(200);

    // Das Projekt steht noch.
    const nachher = await get<{ projects: { id: string }[] }>('/api/projects?abgeschlossen=1');
    expect(nachher.body.projects.some((p) => p.id === echt.body.project.id)).toBe(true);

    await del(`/api/projects/${echt.body.project.id}`);
  });

  it('meldet danach, dass nichts mehr da ist', async () => {
    await del('/api/demo');
    const res = await get<{ offen: number }>('/api/demo');
    expect(res.body.offen).toBe(0);
  });

  it('ist wiederholbar, ohne zu scheitern', async () => {
    const eins = await del<{ gesamt: number }>('/api/demo');
    const zwei = await del<{ gesamt: number; message: string }>('/api/demo');
    expect(eins.status).toBe(200);
    expect(zwei.status).toBe(200);
    expect(zwei.body.gesamt).toBe(0);
    expect(zwei.body.message).toMatch(/keine Demo-Daten/i);
  });
});
