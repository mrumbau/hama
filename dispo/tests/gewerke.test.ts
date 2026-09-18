/**
 * Gewerke löschen.
 *
 * Löschen ist der einzige Weg, auf dem hier Daten wirklich verschwinden –
 * deshalb muss vor allem festgenagelt sein, wann es NICHT passiert.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { del, get, patch, post, TAG } from './helpers';

interface Gewerk {
  id: string;
  name: string;
}

const aufraeumen: string[] = [];

afterAll(async () => {
  for (const id of aufraeumen) await del(`/api/trades/${id}`);
});

async function anlegen(name: string) {
  const res = await post<{ trade: Gewerk }>('/api/trades', { name });
  expect(res.status).toBe(201);
  aufraeumen.push(res.body.trade.id);
  return res.body.trade;
}

describe('Gewerke löschen', () => {
  it('entfernt ein unbenutztes Gewerk', async () => {
    const gewerk = await anlegen(`Estrich ${TAG}`);

    const res = await del<{ message: string }>(`/api/trades/${gewerk.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/gelöscht/);

    const alle = await get<Gewerk[]>('/api/trades');
    expect(alle.body.map((t) => t.id)).not.toContain(gewerk.id);
  });

  it('weigert sich, solange jemand das Gewerk trägt – und sagt, wer', async () => {
    const gewerk = await anlegen(`Pflaster ${TAG}`);
    const person = await post<{ employee: { id: string } }>('/api/employees', {
      firstName: 'Test',
      lastName: `Pflasterer ${TAG}`,
      tradeIds: [gewerk.id],
    });

    const res = await del<{ message: string }>(`/api/trades/${gewerk.id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/1 Mitarbeitern/);

    // Erst wenn es dort weg ist, geht es.
    await patch(`/api/employees/${person.body.employee.id}`, { tradeIds: [] });
    expect((await del(`/api/trades/${gewerk.id}`)).status).toBe(200);

    await del(`/api/employees/${person.body.employee.id}`);
  });

  it('schützt die Gewerke, die die App selbst auswertet', async () => {
    const alle = await get<Gewerk[]>('/api/trades');
    for (const name of ['bauleitung', 'büro']) {
      const treffer = alle.body.find((t) => t.name.toLowerCase() === name);
      if (!treffer) continue;
      const res = await del<{ message: string }>(`/api/trades/${treffer.id}`);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/einsortiert/);
    }
  });

  it('meldet ein Gewerk, das es nicht gibt, statt still zu scheitern', async () => {
    expect((await del('/api/trades/gibtesnicht')).status).toBe(404);
  });
});
