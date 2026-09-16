import { describe, expect, it } from 'vitest';
import { detectWithRules, nextWeekdayFrom } from '@/server/integrations/change-detection';

describe('Regelbasierte Änderungserkennung', () => {
  it('erkennt das Beispiel aus der Spezifikation', () => {
    const changes = detectWithRules(
      'Herr Kufner kann am Dienstag nicht. Die Arbeiten sollen nach Möglichkeit am ' +
        'Donnerstag stattfinden.',
    );
    const termin = changes.find((c) => c.type === 'TERMIN_AENDERUNG');
    expect(termin).toBeDefined();
    expect(termin!.targetWeekday).toBe(4); // Donnerstag
    expect(termin!.reason).toBe('KUNDE');
    expect(termin!.confidence).toBeGreaterThan(0.5);
  });

  it('wählt bei „Donnerstag wäre uns lieber" den Wunschtag, nicht den abgesagten', () => {
    const changes = detectWithRules(
      'Bei uns passt der Dienstag leider doch nicht. Donnerstag wäre uns lieber.',
    );
    const termin = changes.find((c) => c.type === 'TERMIN_AENDERUNG');
    expect(termin!.targetWeekday).toBe(4);
  });

  it('erkennt eine Absage ohne neuen Termin', () => {
    const changes = detectWithRules('Wir müssen den Termin leider absagen.');
    const termin = changes.find((c) => c.type === 'TERMIN_AENDERUNG');
    expect(termin).toBeDefined();
    expect(termin!.targetWeekday).toBeUndefined();
  });

  it('erkennt Materialprobleme', () => {
    const changes = detectWithRules('Das Material kommt später, der Lieferant hat ein Problem.');
    expect(changes.some((c) => c.type === 'MATERIAL_AENDERUNG')).toBe(true);
  });

  it('erkennt Rückrufbitten und Reklamationen', () => {
    expect(detectWithRules('Bitte um Rückruf.').some((c) => c.type === 'RUECKRUF')).toBe(true);
    expect(
      detectWithRules('Es gibt eine Reklamation an der Fliesenarbeit.').some(
        (c) => c.title === 'Reklamation erkannt',
      ),
    ).toBe(true);
  });

  it('erfindet nichts bei belanglosen Gesprächen', () => {
    expect(detectWithRules('Guten Tag, ich wollte nur kurz Hallo sagen.')).toHaveLength(0);
  });

  it('findet den nächsten Wochentag nach einem Datum', () => {
    // 2026-09-15 ist ein Dienstag; Donnerstag derselben Woche ist der 17.
    expect(nextWeekdayFrom('2026-09-15', 4)).toBe('2026-09-17');
    // Ist der Zieltag schon vorbei, wird es die Folgewoche.
    expect(nextWeekdayFrom('2026-09-17', 2)).toBe('2026-09-22');
  });
});
