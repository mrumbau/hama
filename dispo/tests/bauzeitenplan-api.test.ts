/**
 * Der Bauzeitenplan gegen die laufende App.
 *
 * Die Regel selbst steht in `bauzeitenplan.test.ts`. Hier geht es darum, dass
 * die App sie auch benutzt – und dass ein Verschieben entweder ganz oder gar
 * nicht passiert. Ein halb verschobener Plan, in dem Gewerke einander
 * überholt haben, sähe aus wie eine absichtliche Planung.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { del, get, patch, post, TAG } from './helpers';

interface Phase {
  id: string;
  titel: string;
  startDate: string;
  endDate: string;
  firma: string | null;
}
interface Plan {
  raster: 'WOCHE' | 'TAG';
  phasen: Phase[];
}

let projektId = '';
let gewerkId = '';

const plan = () => get<Plan>(`/api/projects/${projektId}/bauzeitenplan`);

async function zeile(label: string, dauer = 1): Promise<string> {
  const res = await post<{ phasen: { id: string }[] }>(
    `/api/projects/${projektId}/bauzeitenplan`,
    { tradeId: gewerkId, label, dauer },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.phasen[0].id;
}

/** Den Plan leeren, damit jeder Test bei null anfängt. */
async function leeren() {
  const vorhanden = await plan();
  for (const p of vorhanden.body.phasen) {
    await del(`/api/projects/${projektId}/bauzeitenplan?zeile=${p.id}`);
  }
}

beforeAll(async () => {
  const projekt = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Bauzeit ${TAG}`,
    name: 'Testbaustelle',
  });
  projektId = projekt.body.project.id;

  const gewerke = await get<{ id: string; name: string }[]>('/api/trades');
  gewerkId = gewerke.body[0]?.id ?? '';
  expect(gewerkId, 'Ohne Gewerke lässt sich nichts anlegen').toBeTruthy();
});

afterAll(async () => {
  await leeren();
  if (projektId) await del(`/api/projects/${projektId}`);
});

describe('Zeilen anlegen', () => {
  it('hängt jede neue Zeile hinter die vorige', async () => {
    await leeren();
    await zeile('Abbruch');
    await zeile('Rohinstallation', 2);

    const { body } = await plan();
    expect(body.phasen).toHaveLength(2);
    // Die zweite beginnt nach der ersten – ohne dass jemand ein Datum tippt.
    expect(body.phasen[1].startDate > body.phasen[0].endDate).toBe(true);
  });

  it('rastet im Wochenraster auf Montag bis Sonntag ein', async () => {
    await leeren();
    await zeile('Estrich');
    const { body } = await plan();
    const beginn = new Date(`${body.phasen[0].startDate}T12:00:00`);
    const ende = new Date(`${body.phasen[0].endDate}T12:00:00`);
    expect(beginn.getDay(), 'Beginn ist kein Montag').toBe(1);
    expect(ende.getDay(), 'Ende ist kein Sonntag').toBe(0);
  });

  it('weist eine Zeile ohne Gewerk und ohne Bezeichnung ab', async () => {
    const res = await post(`/api/projects/${projektId}/bauzeitenplan`, { dauer: 1 });
    expect(res.status).toBe(422);
  });
});

describe('Mehrere Gewerke auf einmal', () => {
  it('reiht sie in der Reihenfolge auf, in der sie kommen', async () => {
    await leeren();
    const res = await post<{ phasen: { id: string }[]; message: string }>(
      `/api/projects/${projektId}/bauzeitenplan`,
      {
        zeilen: [
          { tradeId: gewerkId, label: 'Erstens', dauer: 1 },
          { tradeId: gewerkId, label: 'Zweitens', dauer: 2 },
          { tradeId: gewerkId, label: 'Drittens', dauer: 1 },
        ],
      },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.phasen).toHaveLength(3);
    expect(res.body.message).toContain('3 Gewerke');

    const { body } = await plan();
    const titel = body.phasen.map((p) => p.titel);
    expect(titel).toEqual(['Erstens', 'Zweitens', 'Drittens']);

    // Keine zwei starten am selben Tag - sonst waere die Sammelanlage ein
    // Stapel uebereinanderliegender Balken.
    for (let i = 1; i < body.phasen.length; i++) {
      expect(
        body.phasen[i].startDate > body.phasen[i - 1].endDate,
        `${titel[i]} beginnt nicht nach ${titel[i - 1]}`,
      ).toBe(true);
    }

    // „Zweitens" hat zwei Wochen, also sechs Tage zwischen Beginn und Ende.
    const zweitens = body.phasen[1];
    const tage =
      (new Date(zweitens.endDate).getTime() - new Date(zweitens.startDate).getTime()) /
      86_400_000;
    expect(tage).toBe(13);
  });

  it('legt gar nichts an, wenn eine Zeile unbrauchbar ist', async () => {
    await leeren();
    const res = await post(`/api/projects/${projektId}/bauzeitenplan`, {
      zeilen: [
        { tradeId: gewerkId, label: 'Geht', dauer: 1 },
        { dauer: 1 },
      ],
    });
    expect(res.status).toBe(422);

    // Die brauchbare Zeile darf nicht allein stehengeblieben sein.
    const { body } = await plan();
    expect(body.phasen).toHaveLength(0);
  });
});

describe('Gewerk wieder herausnehmen', () => {
  it('entfernt genau die eine Zeile', async () => {
    await leeren();
    await zeile('Bleibt');
    const weg = await zeile('Verschwindet');

    const res = await del<{ message: string }>(
      `/api/projects/${projektId}/bauzeitenplan?zeile=${weg}`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.message).toContain('Verschwindet');

    const { body } = await plan();
    expect(body.phasen.map((p) => p.titel)).toEqual(['Bleibt']);
  });

  it('meldet eine Zeile, die es nicht gibt', async () => {
    const res = await del(`/api/projects/${projektId}/bauzeitenplan?zeile=gibtsnicht`);
    expect(res.status).toBe(404);
  });
});

describe('Eine Woche nach rechts', () => {
  it('nimmt alles mit, was später beginnt', async () => {
    await leeren();
    await zeile('Abbruch');
    const zweite = await zeile('Rohinstallation');
    await zeile('Estrich');

    const vorher = (await plan()).body.phasen;
    const res = await patch<{ anzahl: number }>(
      `/api/projects/${projektId}/bauzeitenplan`,
      { was: 'verschieben', phaseId: zweite, spalten: 1 },
    );
    expect(res.status).toBe(200);
    expect(res.body.anzahl).toBe(2);

    const nachher = (await plan()).body.phasen;
    const start = (liste: Phase[], titel: string) =>
      liste.find((p) => p.titel === titel)!.startDate;

    // Abbruch bleibt stehen, die beiden dahinter wandern um sieben Tage.
    expect(start(nachher, 'Abbruch')).toBe(start(vorher, 'Abbruch'));
    for (const titel of ['Rohinstallation', 'Estrich']) {
      const diff =
        new Date(start(nachher, titel)).getTime() - new Date(start(vorher, titel)).getTime();
      expect(diff).toBe(7 * 86_400_000);
    }
  });

  it('verschiebt auf Wunsch nur die eine Zeile', async () => {
    await leeren();
    const erste = await zeile('Abbruch');
    await zeile('Rohinstallation');

    const vorher = (await plan()).body.phasen;
    const res = await patch<{ anzahl: number }>(
      `/api/projects/${projektId}/bauzeitenplan`,
      { was: 'verschieben', phaseId: erste, spalten: 2, modus: 'nurDiese' },
    );
    expect(res.body.anzahl).toBe(1);

    const nachher = (await plan()).body.phasen;
    const roh = (liste: Phase[]) => liste.find((p) => p.titel === 'Rohinstallation')!.startDate;
    expect(roh(nachher)).toBe(roh(vorher));
  });

  it('meldet, wenn es die Zeile nicht gibt', async () => {
    const res = await patch(`/api/projects/${projektId}/bauzeitenplan`, {
      was: 'verschieben',
      phaseId: 'gibtsnicht',
      spalten: 1,
    });
    expect(res.status).toBe(404);
  });
});

describe('Raster umschalten', () => {
  it('rechnet danach in Tagen', async () => {
    await leeren();
    const id = await zeile('Fliesen');

    await patch(`/api/projects/${projektId}/bauzeitenplan`, { was: 'raster', raster: 'TAG' });
    const umgestellt = await plan();
    expect(umgestellt.body.raster).toBe('TAG');

    // Eine Spalte ist jetzt ein Tag, nicht sieben.
    const vorher = umgestellt.body.phasen[0].startDate;
    await patch(`/api/projects/${projektId}/bauzeitenplan`, {
      was: 'verschieben',
      phaseId: id,
      spalten: 1,
    });
    const nachher = (await plan()).body.phasen[0].startDate;
    expect(new Date(nachher).getTime() - new Date(vorher).getTime()).toBe(86_400_000);

    await patch(`/api/projects/${projektId}/bauzeitenplan`, { was: 'raster', raster: 'WOCHE' });
  });
});

describe('Zeile ändern', () => {
  it('weist ein Ende vor dem Beginn ab', async () => {
    await leeren();
    const id = await zeile('Malerarbeiten');
    const res = await patch(`/api/projects/${projektId}/bauzeitenplan`, {
      was: 'zeile',
      phaseId: id,
      startDate: '2026-11-09',
      endDate: '2026-11-02',
    });
    expect(res.status).toBe(422);
  });
});
