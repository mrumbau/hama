'use client';
/**
 * Wie groß die Felder der Plantafel sind – und wer das entscheidet.
 *
 * Nicht wir. Der eine plant zwei Leute auf zehn Baustellen und will schmale
 * Zeilen, der andere schiebt acht Namen in eine Zelle und braucht Platz.
 * Deshalb sind Zeilenhöhe, Breite der Baustellenspalte und Breite der
 * Tagesspalten frei ziehbar.
 *
 * Gespeichert wird im Browser, nicht in der Datenbank: Das ist eine
 * Ansichtssache jedes Einzelnen, keine gemeinsame Einstellung. Geht der
 * Speicher verloren, stehen die Standardmaße wieder da – kein Datenverlust,
 * nur eine andere Ansicht.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BoardMasse {
  /** Breite der linken Spalte (Baustelle bzw. Ressource) in Pixeln. */
  spalte: number;
  /** Mindesthöhe einer Zeile in Pixeln. */
  zeile: number;
  /** Breite einer Tagesspalte in Pixeln. */
  tag: number;
}

/**
 * Bewusst großzügiger als die ursprünglichen Werte: In eine Zelle passen
 * mehrere Einsätze, und wenn die Namen abgeschnitten sind, hilft die
 * schönste Planung nichts.
 */
export const STANDARD_MASSE: BoardMasse = { spalte: 272, zeile: 56, tag: 128 };

const GRENZEN: Record<keyof BoardMasse, [number, number]> = {
  spalte: [150, 560],
  zeile: [36, 220],
  tag: [56, 340],
};

const SPEICHER = 'dispo.plantafel.masse';

function begrenzen(art: keyof BoardMasse, wert: number): number {
  const [min, max] = GRENZEN[art];
  return Math.min(max, Math.max(min, Math.round(wert)));
}

export function useBoardMasse() {
  const [masse, setMasse] = React.useState<BoardMasse>(STANDARD_MASSE);

  // Erst nach dem ersten Rendern lesen: Auf dem Server gibt es keinen
  // localStorage, und ein Unterschied zwischen Server und Browser führt zu
  // einem Hydration-Fehler.
  React.useEffect(() => {
    try {
      const roh = window.localStorage.getItem(SPEICHER);
      if (!roh) return;
      const gelesen = JSON.parse(roh) as Partial<BoardMasse>;
      setMasse({
        spalte: begrenzen('spalte', gelesen.spalte ?? STANDARD_MASSE.spalte),
        zeile: begrenzen('zeile', gelesen.zeile ?? STANDARD_MASSE.zeile),
        tag: begrenzen('tag', gelesen.tag ?? STANDARD_MASSE.tag),
      });
    } catch {
      // Privates Fenster, gesperrte Site-Daten – dann eben die Standardmaße.
    }
  }, []);

  const aendern = React.useCallback((art: keyof BoardMasse, wert: number) => {
    setMasse((vorher) => {
      const neu = { ...vorher, [art]: begrenzen(art, wert) };
      try {
        window.localStorage.setItem(SPEICHER, JSON.stringify(neu));
      } catch {
        // Nicht speichern zu können ist kein Grund, nicht zu ziehen.
      }
      return neu;
    });
  }, []);

  const zuruecksetzen = React.useCallback(() => {
    setMasse(STANDARD_MASSE);
    try {
      window.localStorage.removeItem(SPEICHER);
    } catch {
      /* siehe oben */
    }
  }, []);

  /** Als CSS-Variablen an den Tabellenrahmen. */
  const stil = React.useMemo(
    () =>
      ({
        '--board-spalte': `${masse.spalte}px`,
        '--board-zeile': `${masse.zeile}px`,
        '--board-tag': `${masse.tag}px`,
      }) as React.CSSProperties,
    [masse],
  );

  return { masse, aendern, zuruecksetzen, stil };
}

/**
 * Der Griff zum Ziehen.
 *
 * Liegt auf der Kante zwischen zwei Feldern und wird erst sichtbar, wenn man
 * in die Nähe kommt – sonst wäre die Kopfzeile voller Striche, die aussehen,
 * als gehörten sie zur Tabelle.
 */
export function MassZieher({
  art,
  wert,
  onAendern,
  className,
}: {
  art: keyof BoardMasse;
  wert: number;
  onAendern: (art: keyof BoardMasse, wert: number) => void;
  className?: string;
}) {
  const waagrecht = art === 'zeile';

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const anfang = waagrecht ? e.clientY : e.clientX;
    const anfangsWert = wert;

    const bewegen = (m: PointerEvent) => {
      const jetzt = waagrecht ? m.clientY : m.clientX;
      onAendern(art, anfangsWert + (jetzt - anfang));
    };
    const ende = () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', ende);
      document.body.style.userSelect = '';
    };

    // Ohne das markiert das Ziehen die halbe Tabelle als Text.
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', ende);
  };

  return (
    <div
      role="separator"
      aria-orientation={waagrecht ? 'horizontal' : 'vertical'}
      aria-label={
        art === 'spalte'
          ? 'Breite der linken Spalte ziehen'
          : art === 'tag'
            ? 'Breite der Tagesspalten ziehen'
            : 'Zeilenhöhe ziehen'
      }
      onPointerDown={start}
      onDoubleClick={() => onAendern(art, STANDARD_MASSE[art])}
      title="Ziehen zum Verstellen · Doppelklick setzt zurück"
      className={cn(
        'absolute z-50 bg-primary/0 transition-colors hover:bg-primary/40',
        waagrecht ? 'inset-x-0 bottom-0 h-1.5 cursor-row-resize' : 'inset-y-0 right-0 w-1.5 cursor-col-resize',
        className,
      )}
    />
  );
}
