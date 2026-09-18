/**
 * Die geführte Tour.
 *
 * Die Schritte zeigen auf echte Elemente der App. Wird eines davon
 * umbenannt oder entfernt, zeigt die Tour ins Leere – und niemand merkt es,
 * weil sie trotzdem läuft. Deshalb hier geprüft, dass jede Auswahl im Code
 * auch wirklich vorkommt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR } from '@/components/tour/schritte';

const SRC = join(process.cwd(), 'src');

/** Alle Quelldateien als ein Text – einmal, nicht je Test. */
function quelltext(): string {
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  const dateien = execSync(`find ${SRC} -name '*.tsx' -o -name '*.ts'`, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return dateien.map((f) => readFileSync(f, 'utf8')).join('\n');
}

const ALLES = quelltext();

describe('Tourschritte', () => {
  it('hat Schritte', () => {
    expect(TOUR.length).toBeGreaterThan(5);
  });

  it('nennt zu jedem Schritt eine Seite, einen Titel und einen Text', () => {
    for (const s of TOUR) {
      expect(s.pfad.startsWith('/'), `Pfad von „${s.titel}"`).toBe(true);
      expect(s.titel.length, `Titel von „${s.titel}"`).toBeGreaterThan(2);
      expect(s.text.length, `Text von „${s.titel}"`).toBeGreaterThan(20);
    }
  });

  it('zeigt nur auf Elemente, die es im Code gibt', () => {
    for (const s of TOUR) {
      if (!s.ziel) continue;
      // Aus [data-tour="ablage"] wird data-tour="ablage".
      const marke = s.ziel.replace(/^\[|\]$/g, '');
      expect(ALLES.includes(marke), `${s.ziel} (Schritt „${s.titel}") fehlt im Code`).toBe(true);
    }
  });

  it('führt nur auf Seiten, die es gibt', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    for (const s of TOUR) {
      const seite = join(SRC, 'app', s.pfad, 'page.tsx');
      expect(existsSync(seite), `Seite ${s.pfad} fehlt`).toBe(true);
    }
  });

  it('endet auf der Anleitung – von dort wurde sie gestartet', () => {
    expect(TOUR[TOUR.length - 1].pfad).toBe('/anleitung');
  });
});
