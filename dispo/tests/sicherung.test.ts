/**
 * Die nächtliche Sicherung.
 *
 * Zwei Dinge müssen stimmen, sonst ist sie schlimmer als keine: Es muss
 * etwas drinstehen, und es dürfen keine Zugangsdaten drinstehen – die Datei
 * landet in einem Ordner, in den Kollegen schauen können.
 */
import { describe, expect, it } from 'vitest';
import { get, post } from './helpers';
import { GEHEIM, TABELLEN, dateiname, wirktBefuellt, type Sicherung } from '@/server/sicherung';
import { boxZugang, ersteId, fehlendeBoxAngaben, konfliktId } from '@/server/box';

function leer(): Sicherung {
  const daten = Object.fromEntries(TABELLEN.map((t) => [t, []])) as unknown as Sicherung['daten'];
  return {
    stand: '2026-09-18T01:15:00.000Z',
    umgebung: 'test',
    migration: null,
    daten,
    anzahl: Object.fromEntries(TABELLEN.map((t) => [t, 0])) as unknown as Sicherung['anzahl'],
  };
}

describe('Dateiname', () => {
  it('nennt die Datei nach dem Tag, damit die Stände sortiert liegen', () => {
    expect(dateiname('2026-09-18T01:15:00.000Z')).toBe('dispo-sicherung-2026-09-18.json');
  });
});

describe('Leere Sicherungen werden nicht hochgeladen', () => {
  /*
   * Eine leere Datei, die jede Nacht die gestrige ersetzt, sieht aus wie
   * eine Sicherung – und ist der einzige Fall, in dem man es erst merkt,
   * wenn man sie braucht.
   */
  it('erkennt einen leeren Stand', () => {
    expect(wirktBefuellt(leer())).toBe(false);
  });

  it('lässt einen Stand mit Stammdaten durch', () => {
    const s = leer();
    s.anzahl.employees = 7;
    expect(wirktBefuellt(s)).toBe(true);
  });
});

describe('Einspielreihenfolge', () => {
  it('stellt jede Tabelle hinter das, worauf sie zeigt', () => {
    const platz = (name: string) => TABELLEN.indexOf(name as (typeof TABELLEN)[number]);
    expect(platz('projects')).toBeLessThan(platz('assignments'));
    expect(platz('siteManagers')).toBeLessThan(platz('projects'));
    expect(platz('employees')).toBeLessThan(platz('employeeTrades'));
    expect(platz('trades')).toBeLessThan(platz('employeeTrades'));
    expect(platz('users')).toBeLessThan(platz('assignments'));
  });
});

describe('Box-Zugang', () => {
  it('meldet genau, welche Angabe fehlt', () => {
    expect(fehlendeBoxAngaben({ BOX_CLIENT_ID: 'a', BOX_SUBJECT_ID: 'b' })).toEqual([
      'BOX_CLIENT_SECRET',
      'BOX_ORDNER_ID',
    ]);
  });

  it('gibt ohne vollständige Angaben keinen Zugang aus', () => {
    expect(boxZugang({ BOX_CLIENT_ID: 'a' })).toBeNull();
  });

  it('nimmt „enterprise“ an, wenn nichts anderes dasteht', () => {
    const zugang = boxZugang({
      BOX_CLIENT_ID: 'a',
      BOX_CLIENT_SECRET: 'b',
      BOX_SUBJECT_ID: 'c',
      BOX_ORDNER_ID: 'd',
    });
    expect(zugang?.subjectType).toBe('enterprise');
  });

  it('findet die bestehende Datei in Box’ Konfliktantwort', () => {
    const antwort = JSON.stringify({
      code: 'item_name_in_use',
      context_info: { conflicts: { id: '12345', type: 'file' } },
    });
    expect(konfliktId(antwort)).toBe('12345');
  });

  it('findet die Datei-ID einer geglückten Ablage', () => {
    expect(ersteId(JSON.stringify({ entries: [{ id: '999' }] }))).toBe('999');
  });

  it('bleibt ruhig, wenn Box etwas Unerwartetes schickt', () => {
    expect(konfliktId('<html>Gateway Timeout</html>')).toBeNull();
    expect(ersteId('')).toBeNull();
  });
});

describe('Was in der Datei steht', () => {
  it('nimmt weder Kennwörter noch Zugangsdaten mit', async () => {
    const res = await get<Sicherung>('/api/sicherung');
    expect(res.status).toBe(200);

    const nutzer = res.body.daten.users as Record<string, unknown>[];
    expect(nutzer.length).toBeGreaterThan(0);
    for (const u of nutzer) expect(u).not.toHaveProperty('passwordHash');

    const einstellungen = res.body.daten.settings as { key: string }[];
    // Der Ausweis des Zeitplans steht in denselben Einstellungen.
    for (const e of einstellungen) expect(GEHEIM.test(e.key)).toBe(false);
    expect(einstellungen.some((e) => e.key === 'cronToken')).toBe(false);
  });

  it('zählt, was drin ist – sonst merkt niemand, wenn nichts drin ist', async () => {
    const res = await get<Sicherung>('/api/sicherung');
    expect(res.body.anzahl.employees).toBe(res.body.daten.employees.length);
    expect(wirktBefuellt(res.body)).toBe(true);
  });
});

describe('Ohne Box', () => {
  /*
   * Lokal sind die Box-Zugangsdaten nicht gesetzt. Genau dieser Zustand
   * herrscht auch in Produktion, bis die App-Freigabe erteilt ist - und dann
   * muss dastehen, was fehlt, statt dass nichts passiert.
   */
  it('sagt beim Sichern, welche Angabe fehlt, statt stillschweigend nichts zu tun', async () => {
    const res = await post<{ error: string; fehlt: string[] }>('/api/sicherung', {});
    expect(res.status).toBe(503);
    expect(res.body.fehlt).toContain('BOX_CLIENT_SECRET');
    expect(res.body.error).toMatch(/Box ist noch nicht eingerichtet/);
  });
});
