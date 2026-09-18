'use client';
/**
 * Einen Einsatz über mehrere Tage aufziehen.
 *
 * Bisher musste man denselben Monteur in jeden Tag einzeln ziehen. Wer eine
 * Woche plant, macht das fünfmal – pro Person. Hier wird stattdessen die
 * rechte Kante des Einsatzes gepackt und über die Woche gezogen.
 *
 * Bewusst getrennt vom Verschieben, und das muss man sehen:
 *
 *   Karte anfassen  → verschieben (Hand, greifbar überall)
 *   Kante anfassen  → verlängern  (Doppelpfeil, nur am rechten Rand)
 *
 * Deshalb ein eigener Griff mit eigenem Mauszeiger, statt derselben Geste
 * eine zweite Bedeutung zu geben. Zwei Bedeutungen auf einer Geste sind die
 * sicherste Art, beide unzuverlässig zu machen.
 *
 * dnd-kit ist hier nicht im Spiel: Das ist kein Ziehen und Fallenlassen,
 * sondern ein Aufziehen. Der Tag unter dem Zeiger wird über `data-day` am
 * Zellenelement gefunden.
 */
import * as React from 'react';
import { GripVertical } from 'lucide-react';
import type { IsoDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** Welcher Tag liegt unter diesem Punkt? Null, wenn keiner. */
export function tagUnterPunkt(x: number, y: number): IsoDate | null {
  const element = document.elementFromPoint(x, y);
  const zelle = element?.closest<HTMLElement>('[data-day]');
  return (zelle?.dataset.day as IsoDate | undefined) ?? null;
}

export function VerlaengernGriff({
  vonDatum,
  bisDatum,
  onFertig,
  compact,
}: {
  /** Beginn des Einsatzes – weiter zurück wird nicht verlängert. */
  vonDatum: IsoDate;
  bisDatum: IsoDate;
  onFertig: (bis: IsoDate) => void;
  compact?: boolean;
}) {
  const [ziel, setZiel] = React.useState<IsoDate | null>(null);

  const start = (e: React.PointerEvent<HTMLSpanElement>) => {
    // Sonst startet dnd-kit gleichzeitig ein Verschieben.
    e.preventDefault();
    e.stopPropagation();

    let letzter: IsoDate | null = null;

    const bewegen = (m: PointerEvent) => {
      const tag = tagUnterPunkt(m.clientX, m.clientY);
      // Rückwärts über den Beginn hinaus ergibt keinen Einsatz.
      if (!tag || tag < vonDatum) return;
      letzter = tag;
      setZiel(tag);
    };

    const ende = () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', ende);
      document.body.style.userSelect = '';
      setZiel(null);
      if (letzter && letzter !== bisDatum) onFertig(letzter);
    };

    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', ende);
  };

  return (
    <>
      <span
        role="separator"
        aria-label="Einsatz über mehrere Tage aufziehen"
        title="Ziehen: Einsatz über mehrere Tage · Karte ziehen: verschieben"
        onPointerDown={start}
        className={cn(
          'absolute inset-y-0 right-0 flex cursor-col-resize items-center justify-center rounded-r',
          'opacity-0 transition-opacity group-hover:opacity-100',
          // Während des Ziehens sichtbar lassen, auch wenn der Zeiger die
          // Karte längst verlassen hat.
          ziel && 'opacity-100',
          'bg-primary/10 hover:bg-primary/25',
          compact ? 'w-2' : 'w-2.5',
        )}
      >
        <GripVertical className={compact ? 'size-2' : 'size-2.5'} aria-hidden />
      </span>

      {/* Während des Aufziehens steht am Chip, bis wohin es geht. */}
      {ziel ? (
        <span className="pointer-events-none absolute -top-5 right-0 z-50 whitespace-nowrap rounded bg-primary px-1 py-0.5 text-2xs font-medium text-primary-foreground shadow">
          bis {ziel.slice(8, 10)}.{ziel.slice(5, 7)}.
        </span>
      ) : null}
    </>
  );
}
