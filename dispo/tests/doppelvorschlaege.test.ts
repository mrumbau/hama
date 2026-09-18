/**
 * Zwei Vorschläge für denselben Mann am selben Tag.
 *
 * Der Hinweis muss stimmen, sonst ist er schlimmer als keiner: Wer dreimal
 * grundlos gewarnt wird, liest beim vierten Mal nicht mehr hin.
 */
import { describe, expect, it } from 'vitest';
import {
  betroffeneIds,
  findeDoppelvorschlaege,
  type VorschlagZeile,
} from '@/server/doppelvorschlaege';

function zeile(teil: Partial<VorschlagZeile> = {}): VorschlagZeile {
  return {
    id: 'v1',
    employeeId: 'e1',
    ressource: 'Luigi Curatolo',
    projectId: 'p1',
    projektTitel: 'Müller – Bad',
    startDate: '2026-09-21',
    endDate: '2026-09-21',
    vorgeschlagenVon: 'Philipp Chama-Schmidt',
    ...teil,
  };
}

describe('Doppelte Vorschläge finden', () => {
  it('meldet denselben Mann am selben Tag auf zwei Baustellen', () => {
    const treffer = findeDoppelvorschlaege([
      zeile(),
      zeile({ id: 'v2', projectId: 'p2', projektTitel: 'Huber – Küche', vorgeschlagenVon: 'Gerhard Pettkat' }),
    ]);

    expect(treffer).toHaveLength(1);
    expect(treffer[0].ressource).toBe('Luigi Curatolo');
    expect(treffer[0].tage).toEqual(['2026-09-21']);
    expect(treffer[0].beteiligte.map((b) => b.vorgeschlagenVon)).toEqual([
      'Philipp Chama-Schmidt',
      'Gerhard Pettkat',
    ]);
  });

  it('nennt alle Tage, an denen sich zwei Zeiträume überschneiden', () => {
    const treffer = findeDoppelvorschlaege([
      zeile({ startDate: '2026-09-21', endDate: '2026-09-25' }),
      zeile({ id: 'v2', projectId: 'p2', startDate: '2026-09-23', endDate: '2026-09-28' }),
    ]);

    expect(treffer[0].tage).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
  });

  it('schweigt bei zwei Einsätzen auf derselben Baustelle', () => {
    // Zweimal dieselbe Baustelle ist kein Streit um die Person.
    expect(findeDoppelvorschlaege([zeile(), zeile({ id: 'v2' })])).toEqual([]);
  });

  it('schweigt, wenn die Zeiträume sich nicht berühren', () => {
    const treffer = findeDoppelvorschlaege([
      zeile({ startDate: '2026-09-21', endDate: '2026-09-22' }),
      zeile({ id: 'v2', projectId: 'p2', startDate: '2026-09-23', endDate: '2026-09-24' }),
    ]);
    expect(treffer).toEqual([]);
  });

  it('lässt Bauleiter und Subunternehmer in Ruhe', () => {
    // Ein Bauleiter betreut mehrere Baustellen, ein SUB schickt mehrere
    // Kolonnen. Beides ist Alltag – ein Hinweis darauf wäre nur Lärm.
    const treffer = findeDoppelvorschlaege([
      zeile({ employeeId: null, ressource: 'Elektro Maier GmbH' }),
      zeile({ id: 'v2', employeeId: null, projectId: 'p2', ressource: 'Elektro Maier GmbH' }),
    ]);
    expect(treffer).toEqual([]);
  });

  it('fasst drei Vorschläge für dieselbe Person zu einem Hinweis zusammen', () => {
    const treffer = findeDoppelvorschlaege([
      zeile(),
      zeile({ id: 'v2', projectId: 'p2', vorgeschlagenVon: 'Gerhard Pettkat' }),
      zeile({ id: 'v3', projectId: 'p3', vorgeschlagenVon: 'Marlon Tschon' }),
    ]);

    expect(treffer).toHaveLength(1);
    expect(treffer[0].beteiligte).toHaveLength(3);
  });

  it('trennt zwei verschiedene Personen', () => {
    const treffer = findeDoppelvorschlaege([
      zeile(),
      zeile({ id: 'v2', projectId: 'p2' }),
      zeile({ id: 'v3', employeeId: 'e2', ressource: 'Fidan Bugari' }),
      zeile({ id: 'v4', employeeId: 'e2', ressource: 'Fidan Bugari', projectId: 'p3' }),
    ]);

    expect(treffer.map((t) => t.ressource)).toEqual(['Fidan Bugari', 'Luigi Curatolo']);
  });

  it('nennt die betroffenen Vorschläge für die Markierung in der Liste', () => {
    const treffer = findeDoppelvorschlaege([
      zeile(),
      zeile({ id: 'v2', projectId: 'p2' }),
      zeile({ id: 'v3', employeeId: 'e3', projectId: 'p9', ressource: 'Allein' }),
    ]);

    const ids = betroffeneIds(treffer);
    expect([...ids].sort()).toEqual(['v1', 'v2']);
    expect(ids.has('v3')).toBe(false);
  });
});
