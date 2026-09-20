'use client';
/**
 * Steht jemand vor einem Handy?
 *
 * Das meiste lässt sich mit Tailwind-Klassen erschlagen (`md:hidden`), und
 * das ist dort auch der bessere Weg: kein JavaScript, kein Flackern. Diese
 * Abfrage ist für die Fälle, in denen nicht dasselbe kleiner dargestellt
 * wird, sondern etwas anderes passiert – die Plantafel etwa zeigt auf dem
 * Handy eine Tagesliste statt eines Rasters. Beides gleichzeitig zu bauen
 * und eines davon auszublenden, hieße bei dreißig Baustellen über einen
 * Monat, zwei Tafeln zu rechnen und eine wegzuwerfen.
 */
import * as React from 'react';

/** Unterhalb von 768 Pixeln: Handy. Dieselbe Grenze wie Tailwinds `md`. */
export const SCHMAL_ABFRAGE = '(max-width: 767px)';

function abonnieren(melde: () => void): () => void {
  const mq = window.matchMedia(SCHMAL_ABFRAGE);
  mq.addEventListener('change', melde);
  return () => mq.removeEventListener('change', melde);
}

export function useIstSchmal(): boolean {
  return React.useSyncExternalStore(
    abonnieren,
    () => window.matchMedia(SCHMAL_ABFRAGE).matches,
    /*
     * Auf dem Server gibt es kein Fenster. „Breit" ist die richtige Annahme
     * für den ersten Durchgang: React gleicht direkt nach dem Einhängen ab,
     * und ein kurz aufblitzendes Raster ist harmloser als eine Tagesliste,
     * die am Rechner erscheint und wieder verschwindet.
     */
    () => false,
  );
}
