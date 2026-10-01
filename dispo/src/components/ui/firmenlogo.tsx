'use client';
/**
 * Das Firmenlogo.
 *
 * Liegt `public/logo.png` im Projekt, wird es genommen. Fehlt es – etwa weil
 * jemand die Datei beim Aufräumen entfernt –, steht der Schriftzug da. Ein
 * kaputtes Bildsymbol an der Stelle, an der das Logo sein sollte, sieht
 * schlimmer aus als gar kein Logo.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Das Rot aus dem Logo. Für Linien und Überschriften, die dazugehören. */
export const FIRMENROT = '#500000';

export function Firmenlogo({
  className,
  ersatzGroesse = 'text-sm',
}: {
  className?: string;
  /** Wie groß der Schriftzug wird, wenn die Bilddatei fehlt. */
  ersatzGroesse?: string;
}) {
  const [fehlt, setFehlt] = React.useState(false);

  /*
   * `onError` allein reicht nicht: Das Bild steht schon im ersten HTML und
   * kann fehlschlagen, bevor React ueberhaupt angeklinkt ist - dann bleibt
   * das kaputte Bildsymbol stehen. Deshalb beim Einhaengen noch einmal
   * nachsehen, ob das Bild wirklich etwas geworden ist.
   */
  const pruefen = React.useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth === 0) setFehlt(true);
  }, []);

  if (fehlt) {
    return (
      <span className={cn('font-black leading-none tracking-tight', ersatzGroesse)}>
        MR UMBAU
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="MR Umbau GmbH"
      ref={pruefen}
      className={cn('w-auto object-contain', className)}
      onError={() => setFehlt(true)}
    />
  );
}
