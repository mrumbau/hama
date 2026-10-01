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
  besetzung: 'ok' | 'firmaFehlt' | 'niemand';
  wer: string[];
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

describe('Übersicht aller Bauzeitenpläne', () => {
  interface Uebersicht {
    baustellen: {
      id: string;
      customerName: string;
      raster: 'WOCHE' | 'TAG';
      phasen: { titel: string; farbe: string; startDate: string }[];
    }[];
  }

  const uebersicht = () => get<Uebersicht>('/api/bauzeitenplaene');

  it('führt die Baustelle mit ihren Zeilen auf', async () => {
    await leeren();
    await zeile('Abbruch');
    await zeile('Estrich', 2);

    const { status, body } = await uebersicht();
    expect(status).toBe(200);

    const meine = body.baustellen.find((b) => b.id === projektId);
    expect(meine, 'Die Testbaustelle fehlt in der Übersicht').toBeTruthy();
    expect(meine!.phasen.map((p) => p.titel)).toEqual(['Abbruch', 'Estrich']);
    expect(meine!.raster).toBe('WOCHE');

    // Die Farbe kommt aus derselben Rechnung wie im Einzelplan - sonst hat
    // dasselbe Gewerk auf zwei Seiten zwei Farben.
    const einzeln = (await plan()).body.phasen;
    for (const p of meine!.phasen) {
      const gleich = einzeln.find((e) => e.titel === p.titel);
      expect(gleich, `${p.titel} fehlt im Einzelplan`).toBeTruthy();
      expect(p.farbe).toBe((gleich as unknown as { farbe: string }).farbe);
    }
  });

  it('lässt abgeschlossene Baustellen draußen', async () => {
    const res = await patch(`/api/projects/${projektId}`, { status: 'ERLEDIGT' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    try {
      const { body } = await uebersicht();
      expect(body.baustellen.some((b) => b.id === projektId)).toBe(false);
    } finally {
      await patch(`/api/projects/${projektId}`, { status: 'IN_AUSFUEHRUNG' });
    }
  });

  it('nennt keine Lager- und Besorgungszeilen', async () => {
    const { body } = await uebersicht();
    // Diese Zeilen haben keinen Bauablauf. Stünden sie hier, wäre die erste
    // Zeile der Übersicht dauerhaft „Lager" mit leerer Achse.
    for (const b of body.baustellen) {
      expect(b.customerName).not.toBe('Lager');
      expect(b.customerName).not.toBe('Besorgungsfahrt');
    }
  });
});

describe('Steht jemand auf der Plantafel?', () => {
  /** Alle Einsätze dieser Baustelle wieder wegräumen. */
  async function einsaetzeWeg() {
    const res = await get<{ id: string }[]>(
      `/api/assignments?projekt=${projektId}&von=2020-01-01&bis=2099-12-31`,
    );
    for (const a of res.body) await del(`/api/assignments/${a.id}`);
  }

  async function erstePhase(): Promise<Phase> {
    const { body } = await plan();
    return body.phasen[0];
  }

  it('meldet „niemand", solange die Tafel leer ist', async () => {
    await leeren();
    await einsaetzeWeg();
    await zeile('Abbruch');
    const p = await erstePhase();
    expect(p.besetzung).toBe('niemand');
    expect(p.wer).toEqual([]);
  });

  it('ist zufrieden, sobald im Zeitraum jemand steht', async () => {
    await leeren();
    await einsaetzeWeg();
    await zeile('Abbruch');
    const p = await erstePhase();

    const res = await post(`/api/assignments`, {
      projectId: projektId,
      resourceType: 'UNBESETZT',
      placeholderLabel: 'Platzhalter',
      startDate: p.startDate,
      endDate: p.endDate,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const nachher = await erstePhase();
    expect(nachher.besetzung).toBe('ok');
    expect(nachher.wer).toContain('Platzhalter');
    await einsaetzeWeg();
  });

  it('lässt einen Einsatz daneben nicht zählen', async () => {
    await leeren();
    await einsaetzeWeg();
    await zeile('Abbruch');
    const p = await erstePhase();

    // Ein Einsatz, der einen Tag nach dem Gewerk anfängt und aufhört.
    const danach = (iso: string, tage: number) => {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + tage);
      return d.toISOString().slice(0, 10);
    };
    await post(`/api/assignments`, {
      projectId: projektId,
      resourceType: 'UNBESETZT',
      placeholderLabel: 'Danach',
      startDate: danach(p.endDate, 1),
      endDate: danach(p.endDate, 3),
    });

    expect((await erstePhase()).besetzung).toBe('niemand');
    await einsaetzeWeg();
  });

  it('warnt, wenn die hinterlegte Firma nicht die eingeplante ist', async () => {
    await leeren();
    await einsaetzeWeg();
    const id = await zeile('Sanitär');

    const sub = await post<{ subcontractor: { id: string } }>('/api/subcontractors', {
      companyName: `Firma ${TAG}`,
    });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);

    await patch(`/api/projects/${projektId}/bauzeitenplan`, {
      was: 'zeile',
      phaseId: id,
      subcontractorId: sub.body.subcontractor.id,
    });

    const p = await erstePhase();
    // Jemand anderes steht im Zeitraum auf der Tafel.
    await post(`/api/assignments`, {
      projectId: projektId,
      resourceType: 'UNBESETZT',
      placeholderLabel: 'Jemand anderes',
      startDate: p.startDate,
      endDate: p.endDate,
    });

    const nachher = await erstePhase();
    expect(nachher.besetzung).toBe('firmaFehlt');
    expect(nachher.wer).toContain('Jemand anderes');

    // Und mit der richtigen Firma ist Ruhe.
    await post(`/api/assignments`, {
      projectId: projektId,
      resourceType: 'SUBUNTERNEHMER',
      subcontractorId: sub.body.subcontractor.id,
      startDate: p.startDate,
      endDate: p.endDate,
      force: true,
    });
    expect((await erstePhase()).besetzung).toBe('ok');

    await einsaetzeWeg();
  });

  it('zählt einen abgesagten Einsatz nicht', async () => {
    await leeren();
    await einsaetzeWeg();
    await zeile('Abbruch');
    const p = await erstePhase();

    const res = await post<{ assignment: { id: string } }>(`/api/assignments`, {
      projectId: projektId,
      resourceType: 'UNBESETZT',
      placeholderLabel: 'Fällt aus',
      startDate: p.startDate,
      endDate: p.endDate,
    });
    expect((await erstePhase()).besetzung).toBe('ok');

    await patch(`/api/assignments/${res.body.assignment.id}`, { status: 'ABGESAGT' });
    // Ein abgesagter Einsatz ist das Gegenteil einer Besetzung.
    expect((await erstePhase()).besetzung).toBe('niemand');

    await einsaetzeWeg();
  });
});

describe('Gewerk in eine bestimmte Woche legen', () => {
  /*
   * Darauf sitzt die Gewerkleiste auf: Beim Ablegen schickt sie das Datum der
   * Spalte, über der der Zeiger war. Stimmt das Einrasten nicht, landet das
   * Gewerk eine Woche daneben - und zwar unauffaellig.
   */
  it('rastet auf den Montag der getroffenen Woche ein', async () => {
    await leeren();
    // Ein Mittwoch.
    const mittwoch = '2026-11-18';
    const res = await post<{ phasen: { id: string }[] }>(
      `/api/projects/${projektId}/bauzeitenplan`,
      { tradeId: gewerkId, startDate: mittwoch, dauer: 1 },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const { body } = await plan();
    expect(body.phasen).toHaveLength(1);
    // Montag der Woche vom 18.11.2026 ist der 16.11., Sonntag der 22.11.
    expect(body.phasen[0].startDate).toBe('2026-11-16');
    expect(body.phasen[0].endDate).toBe('2026-11-22');
  });

  it('haengt sich nicht hinten an, wenn ein Datum mitkommt', async () => {
    await leeren();
    await zeile('Erstens', 2);
    const { body: vorher } = await plan();
    const spaeter = vorher.phasen[0].endDate;

    // Bewusst vor die vorhandene Zeile gelegt.
    await post(`/api/projects/${projektId}/bauzeitenplan`, {
      tradeId: gewerkId,
      label: 'Davor',
      startDate: '2026-01-07',
      dauer: 1,
    });

    const { body } = await plan();
    const davor = body.phasen.find((p) => p.titel === 'Davor');
    expect(davor, 'Die davor gelegte Zeile fehlt').toBeTruthy();
    expect(davor!.startDate < spaeter).toBe(true);
    expect(davor!.startDate).toBe('2026-01-05');
  });
});

describe('Firmen zum Gewerk', () => {
  /*
   * Der Infodialog im Bauzeitenplan zeigt bei Elektro nur Elektrofirmen. Er
   * filtert auf `tradeIds` aus der Firmenliste - kommt die Zuordnung dort
   * nicht an, steht die gerade angelegte Firma nicht in ihrer eigenen Liste,
   * und das sieht aus wie ein verlorener Datensatz.
   */
  interface Firma {
    id: string;
    companyName: string;
    tradeIds: string[];
  }

  it('nennt das Gewerk, mit dem die Firma angelegt wurde', async () => {
    const name = `Mit Gewerk ${TAG}`;
    const res = await post<{ subcontractor: { id: string } }>('/api/subcontractors', {
      companyName: name,
      tradeIds: [gewerkId],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const liste = await get<Firma[]>('/api/subcontractors');
    const meine = liste.body.find((f) => f.id === res.body.subcontractor.id);
    expect(meine, 'Die angelegte Firma fehlt in der Liste').toBeTruthy();
    expect(meine!.tradeIds).toContain(gewerkId);
  });

  it('nennt kein Gewerk, wenn keines mitkam', async () => {
    const res = await post<{ subcontractor: { id: string } }>('/api/subcontractors', {
      companyName: `Ohne Gewerk ${TAG}`,
    });
    expect(res.status).toBe(201);

    const liste = await get<Firma[]>('/api/subcontractors');
    const meine = liste.body.find((f) => f.id === res.body.subcontractor.id);
    // Sonst taucht sie bei jedem Gewerk auf und der Filter waere wirkungslos.
    expect(meine!.tradeIds).toEqual([]);
  });
});

describe('Was der Review gefunden hat, bleibt repariert', () => {
  const route = () => `/api/projects/${projektId}/bauzeitenplan`;

  it('weist ein Ende vor dem gespeicherten Beginn ab - auch wenn nur das Ende kommt', async () => {
    await leeren();
    const id = await zeile('Abbruch', 2);
    const vorher = (await plan()).body.phasen[0];

    // Genau das schickt das Ziehen der rechten Kante: nur das Ende.
    const res = await patch(route(), {
      was: 'zeile',
      phaseId: id,
      endDate: '2020-01-05',
    });
    expect(res.status).toBe(422);

    const nachher = (await plan()).body.phasen[0];
    expect(nachher.endDate).toBe(vorher.endDate);
  });

  it('weist einen Beginn nach dem gespeicherten Ende ab', async () => {
    await leeren();
    const id = await zeile('Abbruch');
    const res = await patch(route(), { was: 'zeile', phaseId: id, startDate: '2099-01-04' });
    expect(res.status).toBe(422);
  });

  it('laesst eine Zeile nicht namenlos werden', async () => {
    await leeren();
    const id = await zeile('Abbruch');
    const res = await patch(route(), { was: 'zeile', phaseId: id, tradeId: null, label: null });
    expect(res.status).toBe(422);
    expect((await plan()).body.phasen[0].titel).toBe('Abbruch');
  });

  it('liefert die eigene Bezeichnung getrennt vom Titel', async () => {
    await leeren();
    await zeile('Rohinstallation');
    const mitLabel = (await plan()).body.phasen[0] as unknown as { label: string | null };
    expect(mitLabel.label).toBe('Rohinstallation');

    // Ohne eigene Bezeichnung ist label leer, auch wenn der Titel das Gewerk ist.
    await leeren();
    await post(route(), { tradeId: gewerkId, dauer: 1 });
    const ohne = (await plan()).body.phasen[0] as unknown as { label: string | null; titel: string };
    expect(ohne.label).toBeNull();
    expect(ohne.titel.length).toBeGreaterThan(0);
  });

  it('kennt den 31. Februar nicht', async () => {
    await leeren();
    const res = await post(route(), { tradeId: gewerkId, startDate: '2026-02-31', dauer: 1 });
    // Vorher rutschte das stillschweigend auf den 3. Maerz.
    expect([400, 422]).toContain(res.status);
    expect((await plan()).body.phasen).toHaveLength(0);
  });

  it('meldet ein unbekanntes Gewerk sauber statt mit Datenbankfehler', async () => {
    await leeren();
    const res = await post<{ error?: string }>(route(), { tradeId: 'gibtsnicht', dauer: 1 });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/Foreign key|constraint|prisma/i);
  });

  it('meldet eine unbekannte Baustelle mit 404', async () => {
    const res = await get('/api/projects/gibtsnicht/bauzeitenplan');
    expect(res.status).toBe(404);
  });
});
