'use client';
/**
 * Die geführte Tour.
 *
 * Ein Scheinwerfer auf ein echtes Element der App, daneben ein Kästchen mit
 * der Erklärung. Kein fremdes Paket: Was hier nötig ist – Element finden,
 * Loch in die Abdunklung schneiden, Kästchen daneben setzen – sind
 * fünfzig Zeilen, und die Tour soll unsere Sprache sprechen, nicht die
 * einer Bibliothek.
 *
 * Über mehrere Seiten hinweg: Zeigt ein Schritt auf eine andere Seite,
 * wechselt die Tour dorthin und wartet, bis das Element da ist.
 */
import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TOUR } from './schritte';

interface TourStand {
  laeuft: boolean;
  schritt: number;
  starten: () => void;
  beenden: () => void;
}

const TourKontext = React.createContext<TourStand | null>(null);

export function useTour(): TourStand {
  const stand = React.useContext(TourKontext);
  if (!stand) throw new Error('useTour braucht den TourProvider.');
  return stand;
}

interface Rahmen {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Wo steht das Element gerade? Null, wenn es (noch) nicht da ist. */
function miss(auswahl: string | undefined): Rahmen | null {
  if (!auswahl) return null;
  const el = document.querySelector(auswahl);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pfad = usePathname();
  const [laeuft, setLaeuft] = React.useState(false);
  const [schritt, setSchritt] = React.useState(0);
  const [rahmen, setRahmen] = React.useState<Rahmen | null>(null);

  const aktuell = TOUR[schritt];

  const beenden = React.useCallback(() => {
    setLaeuft(false);
    setSchritt(0);
    setRahmen(null);
  }, []);

  const starten = React.useCallback(() => {
    setSchritt(0);
    setLaeuft(true);
  }, []);

  // Auf die richtige Seite wechseln, bevor gemessen wird.
  React.useEffect(() => {
    if (!laeuft || !aktuell) return;
    if (pfad !== aktuell.pfad) router.push(aktuell.pfad);
  }, [laeuft, aktuell, pfad, router]);

  /*
   * Das Element suchen, bis es da ist. Nach einem Seitenwechsel dauert das
   * einen Moment, und bei einer Tabelle, die noch laedt, laenger. Nach zwei
   * Sekunden geben wir auf und zeigen den Schritt in der Mitte - lieber
   * ohne Pfeil erklaeren als gar nicht.
   */
  React.useEffect(() => {
    if (!laeuft || !aktuell) return;
    let abgebrochen = false;
    const bis = Date.now() + 2000;

    const suchen = () => {
      if (abgebrochen) return;
      const gefunden = miss(aktuell.ziel);
      if (gefunden) {
        setRahmen(gefunden);
        document.querySelector(aktuell.ziel!)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (Date.now() < bis) requestAnimationFrame(suchen);
      else setRahmen(null);
    };

    setRahmen(null);
    suchen();
    return () => {
      abgebrochen = true;
    };
  }, [laeuft, aktuell, pfad]);

  // Mitwandern, wenn jemand scrollt oder das Fenster ändert.
  React.useEffect(() => {
    if (!laeuft || !aktuell?.ziel) return;
    const neu = () => setRahmen(miss(aktuell.ziel));
    window.addEventListener('scroll', neu, true);
    window.addEventListener('resize', neu);
    return () => {
      window.removeEventListener('scroll', neu, true);
      window.removeEventListener('resize', neu);
    };
  }, [laeuft, aktuell]);

  // Mit Escape raus, mit den Pfeiltasten weiter – wie in jeder Diaschau.
  React.useEffect(() => {
    if (!laeuft) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beenden();
      if (e.key === 'ArrowRight') setSchritt((s) => Math.min(TOUR.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setSchritt((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [laeuft, beenden]);

  const stand = React.useMemo<TourStand>(
    () => ({ laeuft, schritt, starten, beenden }),
    [laeuft, schritt, starten, beenden],
  );

  return (
    <TourKontext.Provider value={stand}>
      {children}
      {laeuft && aktuell ? (
        <TourAnzeige
          schritt={schritt}
          rahmen={rahmen}
          onZurueck={() => setSchritt((s) => Math.max(0, s - 1))}
          onWeiter={() => (schritt === TOUR.length - 1 ? beenden() : setSchritt((s) => s + 1))}
          onBeenden={beenden}
        />
      ) : null}
    </TourKontext.Provider>
  );
}

function TourAnzeige({
  schritt,
  rahmen,
  onZurueck,
  onWeiter,
  onBeenden,
}: {
  schritt: number;
  rahmen: Rahmen | null;
  onZurueck: () => void;
  onWeiter: () => void;
  onBeenden: () => void;
}) {
  const s = TOUR[schritt];
  const letzter = schritt === TOUR.length - 1;
  const luft = 8;

  /*
   * Das Kaestchen unter das Element, wenn darunter Platz ist, sonst
   * darueber. Ohne Element in die Mitte. Breiter als 22rem wird es nicht -
   * lange Zeilen liest niemand.
   */
  const kasten: React.CSSProperties = rahmen
    ? (() => {
        const untenPlatz = window.innerHeight - (rahmen.top + rahmen.height);
        const nachUnten = untenPlatz > 220;
        return {
          top: nachUnten ? rahmen.top + rahmen.height + luft : undefined,
          bottom: nachUnten ? undefined : window.innerHeight - rahmen.top + luft,
          left: Math.max(12, Math.min(rahmen.left, window.innerWidth - 372)),
        };
      })()
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {/*
        Die Abdunklung mit einem Loch: ein Kasten ohne Fuellung, dessen
        Schatten nach aussen die ganze Seite verdunkelt. Billiger und
        ruhiger als vier einzelne Flaechen um das Element herum.
      */}
      {rahmen ? (
        <div
          className="absolute rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            top: rahmen.top - 4,
            left: rahmen.left - 4,
            width: rahmen.width + 8,
            height: rahmen.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      <div
        role="dialog"
        aria-label={`Tour, Schritt ${schritt + 1} von ${TOUR.length}`}
        className="pointer-events-auto absolute w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-lg border bg-card p-3 shadow-xl"
        style={kasten}
      >
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-semibold">{s.titel}</h3>
          <button
            type="button"
            onClick={onBeenden}
            aria-label="Tour beenden"
            className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.text}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-2xs tabular-nums text-muted-foreground">
            {schritt + 1} / {TOUR.length}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" onClick={onZurueck} disabled={schritt === 0}>
              <ChevronLeft /> Zurück
            </Button>
            <Button size="sm" onClick={onWeiter}>
              {letzter ? 'Fertig' : 'Weiter'}
              {letzter ? null : <ChevronRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
