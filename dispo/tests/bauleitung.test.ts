/**
 * Wer „Bauleitung" trägt, ist Bauleiter.
 *
 * Die Regel gab es schon, sie griff aber nur beim Ändern eines Mitarbeiters.
 * Wer die Fähigkeit beim Anlegen oder über „Das Programm" bekam, blieb ohne
 * Bauleiter-Datensatz und war am Projekt nicht auswählbar. Diese Tests
 * nageln beide Wege fest.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { del, get, patch, post, TAG } from './helpers';

interface Gewerk {
  id: string;
  name: string;
}
interface Bauleiter {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
}

const NACHNAME = `Bauleitung ${TAG}`;
let bauleitungId = '';
let sonstigesId = '';
const angelegteMitarbeiter: string[] = [];

async function legeAn(vorname: string, tradeIds: string[]) {
  const res = await post<{ employee: { id: string }; message: string }>('/api/employees', {
    firstName: vorname,
    lastName: NACHNAME,
    tradeIds,
  });
  expect(res.status).toBe(201);
  angelegteMitarbeiter.push(res.body.employee.id);
  return res;
}

async function bauleiter(vorname: string): Promise<Bauleiter | undefined> {
  const alle = await get<Bauleiter[]>('/api/site-managers');
  return alle.body.find((m) => m.firstName === vorname && m.lastName === NACHNAME);
}

beforeAll(async () => {
  const gewerke = await get<Gewerk[]>('/api/trades');
  bauleitungId = gewerke.body.find((t) => t.name.toLowerCase() === 'bauleitung')?.id ?? '';
  sonstigesId = gewerke.body.find((t) => t.name.toLowerCase() !== 'bauleitung')?.id ?? '';
  expect(bauleitungId, 'Das Gewerk „Bauleitung" muss es geben').not.toBe('');
});

afterAll(async () => {
  for (const id of angelegteMitarbeiter) await del(`/api/employees/${id}`);
});

describe('Fähigkeit „Bauleitung“', () => {
  it('macht schon beim Anlegen einen Bauleiter daraus', async () => {
    const res = await legeAn('Neu', [bauleitungId]);
    expect(res.body.message).toMatch(/Bauleiter/);
    expect(await bauleiter('Neu')).toMatchObject({ active: true });
  });

  it('macht beim nachträglichen Ankreuzen einen Bauleiter daraus', async () => {
    await legeAn('Spaeter', [sonstigesId]);
    expect(await bauleiter('Spaeter')).toBeUndefined();

    const id = angelegteMitarbeiter[angelegteMitarbeiter.length - 1];
    const res = await patch<{ message: string }>(`/api/employees/${id}`, {
      tradeIds: [sonstigesId, bauleitungId],
    });
    expect(res.status).toBe(200);
    expect(await bauleiter('Spaeter')).toMatchObject({ active: true });
  });

  it('lässt ohne die Fähigkeit keinen Bauleiter entstehen', async () => {
    await legeAn('Ohne', [sonstigesId]);
    expect(await bauleiter('Ohne')).toBeUndefined();
  });

  it('legt beim Abwählen still, statt zu löschen – Projekte hängen daran', async () => {
    await legeAn('Wieder', [bauleitungId]);
    const id = angelegteMitarbeiter[angelegteMitarbeiter.length - 1];
    expect(await bauleiter('Wieder')).toMatchObject({ active: true });

    await patch(`/api/employees/${id}`, { tradeIds: [] });
    // Nicht verschwunden, nur inaktiv: sonst reissen bestehende Projekte ab.
    expect(await bauleiter('Wieder')).toMatchObject({ active: false });

    await patch(`/api/employees/${id}`, { tradeIds: [bauleitungId] });
    expect(await bauleiter('Wieder')).toMatchObject({ active: true });
  });

  it('erzeugt aus einer Person nie zwei Bauleiter', async () => {
    const id = angelegteMitarbeiter[0];
    await patch(`/api/employees/${id}`, { tradeIds: [bauleitungId, sonstigesId] });
    await patch(`/api/employees/${id}`, { tradeIds: [bauleitungId] });

    const alle = await get<Bauleiter[]>('/api/site-managers');
    const treffer = alle.body.filter((m) => m.firstName === 'Neu' && m.lastName === NACHNAME);
    expect(treffer).toHaveLength(1);
  });
});
