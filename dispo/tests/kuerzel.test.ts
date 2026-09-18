/**
 * Das Kürzel auf dem Vorschlag.
 *
 * Wer „PC“ von Hand auf „PS“ ändert, will das auch auf der Plantafel sehen.
 * Aus Vor- und Nachname abgeleitete Initialen würden weiter „PC“ zeigen –
 * zwei Kürzel für denselben Menschen in derselben App.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { del, get, mondayOfNextWeek, post, TAG } from './helpers';

const prisma = new PrismaClient();
const MO = mondayOfNextWeek();

let projektId = '';
let mitarbeiterId = '';
let einsatzId = '';
let bauleiterId = '';
let benutzerId = '';

interface BoardAntwort {
  assignments: { id: string; angelegtVon: string | null }[];
}

async function kuerzelAufDerTafel(): Promise<string | null> {
  const res = await get<BoardAntwort>(`/api/board?datum=${MO}&zeitraum=woche`);
  expect(res.status).toBe(200);
  const gefunden = res.body.assignments.find((a) => a.id === einsatzId);
  expect(gefunden, 'Einsatz steht nicht auf der Tafel').toBeTruthy();
  return gefunden?.angelegtVon ?? null;
}

beforeAll(async () => {
  const projekt = await post<{ project: { id: string } }>('/api/projects', {
    customerName: `Kuerzel ${TAG}`,
    name: 'Testbaustelle',
  });
  projektId = projekt.body.project.id;

  const person = await post<{ employee: { id: string } }>('/api/employees', {
    firstName: 'Test',
    lastName: `Kuerzeltraeger ${TAG}`,
  });
  mitarbeiterId = person.body.employee.id;

  const bauleiter = await prisma.siteManager.create({
    data: { firstName: 'Philipp', lastName: 'Chama-Schmidt', shortCode: `P${TAG.slice(-4)}` },
  });
  bauleiterId = bauleiter.id;

  // Der angemeldete Testbenutzer bekommt diesen Bauleiter angehängt.
  const benutzer = await prisma.user.findUniqueOrThrow({
    where: { email: 'test-verwaltung@mrumbau.invalid' },
  });
  benutzerId = benutzer.id;
  await prisma.user.update({ where: { id: benutzerId }, data: { siteManagerId: bauleiterId } });

  const einsatz = await post<{ assignment: { id: string } }>('/api/assignments', {
    projectId: projektId,
    resourceType: 'MITARBEITER',
    employeeId: mitarbeiterId,
    startDate: MO,
    force: true,
  });
  einsatzId = einsatz.body.assignment.id;
});

afterAll(async () => {
  if (benutzerId) await prisma.user.update({ where: { id: benutzerId }, data: { siteManagerId: null } });
  if (einsatzId) await del(`/api/assignments/${einsatzId}`);
  if (bauleiterId) await prisma.siteManager.delete({ where: { id: bauleiterId } }).catch(() => {});
  if (mitarbeiterId) await del(`/api/employees/${mitarbeiterId}`);
  if (projektId) await del(`/api/projects/${projektId}`);
  await prisma.$disconnect();
});

describe('Vorschlagskürzel auf der Plantafel', () => {
  it('zeigt das gepflegte Kürzel, nicht die Initialen des Namens', async () => {
    const kuerzel = await prisma.siteManager
      .findUniqueOrThrow({ where: { id: bauleiterId } })
      .then((b) => b.shortCode);
    expect(await kuerzelAufDerTafel()).toBe(kuerzel);
  });

  it('zieht eine Änderung des Kürzels nach', async () => {
    const neu = `X${TAG.slice(-4)}`;
    await prisma.siteManager.update({ where: { id: bauleiterId }, data: { shortCode: neu } });
    expect(await kuerzelAufDerTafel()).toBe(neu);
  });
});
