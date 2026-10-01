'use client';
/**
 * Der Bauzeitenplan einer Baustelle.
 *
 * Zeilen sind Gewerke, Spalten sind Kalenderwochen (oder Tage). Zieht man
 * einen Balken nach rechts, wandert alles mit, was gleichzeitig oder später
 * beginnt – der Plan behält seine Form. Genau dafür gibt es ihn: Verschiebt
 * sich der Sanitärer um eine Woche, verschiebt sich der ganze Rest.
 *
 * Während des Ziehens wandern die betroffenen Balken sichtbar mit. Ohne das
 * müsste man die Regel erklären; so sieht man sie.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarRange,
  CalendarPlus,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useIch } from '@/lib/ich';
import { useIstSchmal } from '@/lib/schmal';
import { BOARD_KEYS, useTrades } from '@/lib/queries';
import { formatDateShort, todayIso, type IsoDate } from '@/lib/dates';
import {
  balken,
  dauerText,
  spalten as fensterFuer,
  spaltenTitel,
  type Raster,
} from '@/lib/bauzeitenplan';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface PhaseDTO {
  id: string;
  tradeId: string | null;
  titel: string;
  gewerk: string | null;
  farbe: string;
  subcontractorId: string | null;
  firma: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string | null;
  sortOrder: number;
  besetzung: 'ok' | 'firmaFehlt' | 'niemand';
  /** Wer im Zeitraum auf der Tafel steht – für den Mauszeiger. */
  wer: string[];
}

interface PlanDTO {
  projectId: string;
  raster: Raster;
  phasen: PhaseDTO[];
}

/** Breite einer Spalte in Pixeln. Wochen dürfen schmaler sein als Tage. */
const SPALTE: Record<Raster, number> = { WOCHE: 72, TAG: 48 };
/**
 * Die Namensspalte. Auf dem Handy schmaler – dort sind von 390 Pixeln sonst
 * nur noch zwei Wochen zu sehen, und ein Bauzeitenplan, bei dem man zwei
 * Wochen am Stück sieht, beantwortet keine Frage.
 */
const NAMENSSPALTE = { breit: 190, schmal: 128 };

export function BauzeitenplanTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: ich } = useIch();
  const darfAendern = Boolean(ich?.rechte?.bauzeitenplan);
  const schmal = useIstSchmal();

  const { data, isLoading } = useQuery({
    queryKey: ['bauzeitenplan', projectId],
    queryFn: () => api.get<PlanDTO>(`/api/projects/${projectId}/bauzeitenplan`),
  });

  const [neueZeile, setNeueZeile] = React.useState(false);
  const [bearbeiten, setBearbeiten] = React.useState<PhaseDTO | null>(null);
  /**
   * Welche Zeile soll weg? Mit Rueckfrage, weil ein Bauzeitenplan kein
   * Rueckgaengig hat: Eine geloeschte Zeile ist samt Zeitraum, Firma und Notiz
   * weg, und niemand weiss hinterher, was dort stand.
   */
  const [weg, setWeg] = React.useState<PhaseDTO | null>(null);
  /** Welche Zeile soll auf die Plantafel? */
  const [aufDieTafel, setAufDieTafel] = React.useState<PhaseDTO | null>(null);
  /** Was gerade am Finger hängt: Zeile, Art und um wie viele Spalten. */
  const [zug, setZug] = React.useState<{
    id: string;
    spalten: number;
    art: 'verschieben' | 'dauer';
    nurDiese: boolean;
  } | null>(null);

  const aktualisieren = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['bauzeitenplan', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
  }, [queryClient, projectId]);

  const aendern = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<{ message: string }>(`/api/projects/${projectId}/bauzeitenplan`, body),
    onSuccess: (res) => {
      aktualisieren();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const loeschen = useMutation({
    mutationFn: (phaseId: string) =>
      api.delete<{ message: string }>(
        `/api/projects/${projectId}/bauzeitenplan?zeile=${phaseId}`,
      ),
    onSuccess: (res) => {
      setWeg(null);
      aktualisieren();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const raster = data?.raster ?? 'WOCHE';
  const phasen = React.useMemo(() => data?.phasen ?? [], [data]);
  const fenster = React.useMemo(
    () => fensterFuer(phasen, raster, todayIso()),
    [phasen, raster],
  );

  /** Welche Zeilen wandern beim aktuellen Zug mit? */
  const wandertMit = React.useCallback(
    (p: PhaseDTO): boolean => {
      if (!zug || zug.art !== 'verschieben') return false;
      if (zug.nurDiese) return p.id === zug.id;
      const angefasst = phasen.find((x) => x.id === zug.id);
      return Boolean(angefasst && p.startDate >= angefasst.startDate);
    },
    [zug, phasen],
  );

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Bauzeitenplan wird geladen …</p>;
  }

  const breite = SPALTE[raster];

  return (
    <div className="space-y-3">
      {/* --- Leiste --- */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={raster}
          onValueChange={(v) => aendern.mutate({ was: 'raster', raster: v })}
        >
          <TabsList>
            <TabsTrigger value="WOCHE" disabled={!darfAendern}>
              Wochen
            </TabsTrigger>
            <TabsTrigger value="TAG" disabled={!darfAendern}>
              Tage
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {darfAendern ? (
          <Button size="sm" onClick={() => setNeueZeile(true)}>
            <Plus /> Gewerk
          </Button>
        ) : null}

        <Button size="sm" variant="outline" asChild className="ml-auto">
          <a href={`/bauzeitenplan/${projectId}`} target="_blank" rel="noreferrer">
            <Printer /> Drucken / PDF
          </a>
        </Button>
      </div>

      {phasen.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Noch kein Bauzeitenplan"
          description={
            darfAendern
              ? 'Mit „+ Gewerk“ die erste Zeile anlegen – Abbruch, Rohinstallation, Estrich, was auch immer ansteht.'
              : 'Für diese Baustelle wurde noch kein Bauzeitenplan angelegt.'
          }
          action={
            darfAendern ? (
              <Button size="sm" onClick={() => setNeueZeile(true)}>
                <Plus /> Erstes Gewerk
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div
            className="min-w-max"
            style={{
              ['--spalte' as string]: `${breite}px`,
              ['--name' as string]: `${schmal ? NAMENSSPALTE.schmal : NAMENSSPALTE.breit}px`,
            }}
          >
            {/* Kopfzeile */}
            <div
              className="grid border-b bg-muted/50"
              style={{
                gridTemplateColumns: `var(--name) repeat(${fenster.spalten.length}, var(--spalte))`,
              }}
            >
              <div className="border-r px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Gewerk
              </div>
              {fenster.spalten.map((s) => (
                <div
                  key={s}
                  className="border-r px-1 py-1.5 text-center text-2xs font-medium tabular-nums text-muted-foreground last:border-r-0"
                >
                  {spaltenTitel(s, raster)}
                </div>
              ))}
            </div>

            {/* Zeilen */}
            {phasen.map((p) => {
              const lage = balken(p, fenster, raster);
              const versatz = wandertMit(p) ? zug!.spalten : 0;
              const extra = zug?.art === 'dauer' && zug.id === p.id ? zug.spalten : 0;

              return (
                <ContextMenu key={p.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      className="group grid border-b last:border-b-0 hover:bg-accent/30"
                      style={{
                        gridTemplateColumns: `var(--name) repeat(${fenster.spalten.length}, var(--spalte))`,
                      }}
                    >
                  <div className="flex min-w-0 items-center border-r">
                    <button
                      onClick={() => darfAendern && setBearbeiten(p)}
                      className="min-w-0 flex-1 px-2 py-2 text-left"
                      title={darfAendern ? 'Zeile bearbeiten' : undefined}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: p.farbe }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {p.titel}
                        </span>
                        {/*
                          Eine Notiz, die nur im Dialog steht, liest niemand.
                          Das Zettelsymbol sagt, dass da etwas steht, und der
                          Mauszeiger verraet was.
                        */}
                        {p.note ? (
                          <span
                            className="shrink-0 text-muted-foreground"
                            title={p.note}
                            aria-label={`Notiz: ${p.note}`}
                          >
                            <StickyNote className="size-3" />
                          </span>
                        ) : null}
                        {/*
                          Der Balken steht im Plan - und auf der Plantafel
                          steht niemand. Das faellt sonst erst am Montag auf.
                        */}
                        {p.besetzung !== 'ok' ? (
                          <span
                            className={cn(
                              'shrink-0',
                              p.besetzung === 'niemand' ? 'text-destructive' : 'text-amber-600',
                            )}
                            title={besetzungText(p)}
                            aria-label={besetzungText(p)}
                          >
                            <AlertTriangle className="size-3" />
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                        {untertitel(p)}
                      </span>
                    </button>

                    {/*
                      Bis hierhin war Bearbeiten und Loeschen nur ueber einen
                      Klick auf den Namen zu erreichen, und nichts sagte das.
                      Am Zeigegeraet erscheinen die Knoepfe beim Darueberfahren,
                      am Finger stehen sie immer da - dort gibt es kein
                      Darueberfahren.
                    */}
                    {darfAendern ? (
                      <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">
                        <button
                          onClick={() => setBearbeiten(p)}
                          title={`${p.titel} bearbeiten`}
                          aria-label={`${p.titel} bearbeiten`}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:p-1.5"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {/*
                          Der Muelleimer nur an der Maus. Am Finger sind die
                          Symbole dauerhaft sichtbar, und zwei davon fressen von
                          128 Pixeln Namensspalte 45 - dann steht neben dem
                          Farbpunkt noch „Rohinstall…". Auf dem Handy fuehrt der
                          Stift in den Dialog, und dort steht „Entfernen".
                        */}
                        <button
                          onClick={() => setWeg(p)}
                          title={`${p.titel} entfernen`}
                          aria-label={`${p.titel} entfernen`}
                          className="hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive [@media(pointer:fine)]:inline-flex"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Hintergrundraster */}
                  {fenster.spalten.map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        'h-full border-r last:border-r-0',
                        i % 2 === 1 && 'bg-muted/30',
                      )}
                      style={{ gridRow: 1, gridColumn: i + 2 }}
                    />
                  ))}

                  {/* Der Balken */}
                  <div
                    className="relative py-1.5"
                    style={{
                      gridRow: 1,
                      gridColumn: `${lage.ab + 2} / span ${Math.max(1, lage.breite + extra)}`,
                      transform: versatz ? `translateX(calc(${versatz} * var(--spalte)))` : undefined,
                      zIndex: zug?.id === p.id ? 20 : 10,
                    }}
                  >
                    <Balken
                      phase={p}
                      raster={raster}
                      beweglich={darfAendern}
                      breitGenug={lage.breite + extra >= 3}
                      ziehtGerade={zug?.id === p.id}
                      onZug={setZug}
                      onFertig={(art, spaltenZahl, nurDiese) => {
                        setZug(null);
                        if (!spaltenZahl) return;
                        if (art === 'verschieben') {
                          aendern.mutate({
                            was: 'verschieben',
                            phaseId: p.id,
                            spalten: spaltenZahl,
                            modus: nurDiese ? 'nurDiese' : 'abHier',
                          });
                        } else {
                          aendern.mutate({
                            was: 'zeile',
                            phaseId: p.id,
                            endDate: tageSpaeter(p.endDate, spaltenZahl, raster),
                          });
                        }
                      }}
                    />
                      </div>
                    </div>
                  </ContextMenuTrigger>

                  {/*
                    Dasselbe wie die Knoepfe, nur fuer die, die rechtsklicken -
                    auf der Plantafel ist das der gewohnte Weg, also hier auch.
                  */}
                  <ContextMenuContent>
                    <ContextMenuLabel>{p.titel}</ContextMenuLabel>
                    <ContextMenuSeparator />
                    {darfAendern ? (
                      <>
                        <ContextMenuItem onSelect={() => setBearbeiten(p)}>
                          <Pencil className="size-3.5" /> Bearbeiten
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => setAufDieTafel(p)}>
                          <CalendarPlus className="size-3.5" /> Auf die Plantafel eintragen
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => setWeg(p)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-3.5" /> Aus dem Plan entfernen
                        </ContextMenuItem>
                      </>
                    ) : (
                      <ContextMenuItem disabled>Nur Bauleitung und Leitung</ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </div>
      )}

      {phasen.length > 0 && darfAendern ? (
        <p className="text-2xs text-muted-foreground">
          {schmal ? (
            <>
              Balken schieben verschiebt alles ab dort – der Plan behält seine Form.{' '}
              <Pencil className="inline size-3 align-[-2px]" aria-hidden /> an der Zeile öffnet
              Zeitraum, Firma und Notiz – dort steht auch „Entfernen“.
            </>
          ) : (
            <>
              Balken ziehen verschiebt alles ab dort – der Plan behält seine Form. Mit gedrückter{' '}
              <kbd className="rounded border px-1">Alt</kbd>-Taste wandert nur diese eine Zeile. An
              der rechten Kante wird der Balken länger oder kürzer. Zum Ändern oder Entfernen eines
              Gewerks die Zeile anfahren – <Pencil className="inline size-3 align-[-2px]" aria-hidden />{' '}
              und <Trash2 className="inline size-3 align-[-2px]" aria-hidden /> erscheinen links;
              Rechtsklick führt zum selben Menü.
            </>
          )}
        </p>
      ) : null}

      <GewerkeDialog
        offen={neueZeile}
        projectId={projectId}
        raster={raster}
        onClose={() => setNeueZeile(false)}
        onFertig={aktualisieren}
      />

      <Dialog open={Boolean(weg)} onOpenChange={(o) => !o && setWeg(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>{weg?.titel} aus dem Plan nehmen?</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Die Zeile verschwindet mit Zeitraum, Firma und Notiz. Rückgängig gibt es nicht –
            wieder hinzufügen schon.
          </p>
          {weg ? (
            <dl className="mt-3 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">Zeitraum</dt>
                <dd className="tabular-nums">
                  {formatDateShort(weg.startDate)} – {formatDateShort(weg.endDate)}
                </dd>
              </div>
              {weg.firma ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Firma</dt>
                  <dd>{weg.firma}</dd>
                </div>
              ) : null}
              {weg.note ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Notiz</dt>
                  <dd>{weg.note}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeg(null)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={loeschen.isPending}
              onClick={() => weg && loeschen.mutate(weg.id)}
            >
              <Trash2 /> Entfernen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AufDieTafelDialog
        phase={aufDieTafel}
        projectId={projectId}
        onClose={() => setAufDieTafel(null)}
        onFertig={aktualisieren}
      />

      <ZeileBearbeitenDialog
        phase={bearbeiten}
        projectId={projectId}
        raster={raster}
        onClose={() => setBearbeiten(null)}
        onFertig={aktualisieren}
        onWeg={(p) => {
          setBearbeiten(null);
          setWeg(p);
        }}
      />
    </div>
  );
}

/**
 * Ein Balken, der sich ziehen lässt.
 *
 * Bewusst auf Zeigerereignissen statt auf einer Bibliothek: Es gibt genau
 * zwei Gesten – seitwärts schieben und an der rechten Kante länger ziehen –
 * und beide müssen am Finger genauso funktionieren wie an der Maus.
 */
function Balken({
  phase,
  raster,
  beweglich,
  breitGenug,
  ziehtGerade,
  onZug,
  onFertig,
}: {
  phase: PhaseDTO;
  raster: Raster;
  beweglich: boolean;
  /** Ab drei Spalten passt der Name mit auf den Balken, vorher nur die Dauer. */
  breitGenug: boolean;
  ziehtGerade: boolean;
  onZug: (
    z: { id: string; spalten: number; art: 'verschieben' | 'dauer'; nurDiese: boolean } | null,
  ) => void;
  onFertig: (art: 'verschieben' | 'dauer', spalten: number, nurDiese: boolean) => void;
}) {
  const start = React.useRef<{ x: number; art: 'verschieben' | 'dauer'; alt: boolean } | null>(
    null,
  );
  const letzte = React.useRef(0);

  const beginnen = (e: React.PointerEvent, art: 'verschieben' | 'dauer') => {
    if (!beweglich) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, art, alt: e.altKey };
    letzte.current = 0;
  };

  const bewegen = (e: React.PointerEvent) => {
    if (!start.current) return;
    const schritte = Math.round((e.clientX - start.current.x) / SPALTE[raster]);
    if (schritte === letzte.current) return;
    letzte.current = schritte;
    onZug({ id: phase.id, spalten: schritte, art: start.current.art, nurDiese: start.current.alt });
  };

  const beenden = () => {
    if (!start.current) return;
    const { art, alt } = start.current;
    start.current = null;
    onFertig(art, letzte.current, alt);
    letzte.current = 0;
  };

  return (
    <div
      onPointerDown={(e) => beginnen(e, 'verschieben')}
      onPointerMove={bewegen}
      onPointerUp={beenden}
      onPointerCancel={beenden}
      className={cn(
        'group relative flex h-8 select-none items-center gap-1 rounded-md px-2 text-xs font-medium text-white shadow-sm ring-1 ring-black/10',
        beweglich && 'cursor-grab touch-none active:cursor-grabbing',
        ziehtGerade && 'ring-2 ring-foreground',
      )}
      style={{ backgroundColor: phase.farbe }}
      title={`${phase.titel} · ${formatDateShort(phase.startDate)} – ${formatDateShort(phase.endDate)}`}
    >
      {/*
        Auf einem Balken von einer Spalte Breite ist fuer einen Namen kein
        Platz - und er steht ohnehin links in der Zeile. Dort zaehlt nur die
        Dauer; erst ab zwei Spalten kommt der Name dazu.
      */}
      {breitGenug ? (
        <>
          {beweglich ? <GripVertical className="size-3 shrink-0 opacity-70" aria-hidden /> : null}
          <span className="min-w-0 flex-1 truncate">{phase.titel}</span>
        </>
      ) : null}
      <span
        className={cn(
          'shrink-0 text-2xs opacity-90',
          breitGenug ? undefined : 'mx-auto font-semibold',
        )}
      >
        {dauerText(phase, raster)}
      </span>

      {beweglich ? (
        <span
          onPointerDown={(e) => beginnen(e, 'dauer')}
          onPointerMove={bewegen}
          onPointerUp={beenden}
          onPointerCancel={beenden}
          title="Länger oder kürzer ziehen"
          className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none rounded-r-md bg-black/10 opacity-0 transition group-hover:opacity-100"
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialoge
// ---------------------------------------------------------------------------

/**
 * Gewerke aussuchen.
 *
 * Ein Formular pro Gewerk waeren zehn Formulare fuer einen Plan. Hier hakt
 * man an, was auf dieser Baustelle vorkommt, und bekommt die Zeilen in der
 * Reihenfolge, in der man sie angehakt hat - das ist meistens schon die
 * Reihenfolge des Bauablaufs. Zurechtschieben kommt danach.
 *
 * Die Zahl am angehakten Gewerk ist nicht Zierde: Sie sagt, an welcher Stelle
 * die Zeile landet. Ohne sie waere die Reihenfolge ein Zufall, den man erst
 * nach dem Hinzufuegen sieht.
 */
function GewerkeDialog({
  offen,
  projectId,
  raster,
  onClose,
  onFertig,
}: {
  offen: boolean;
  projectId: string;
  raster: Raster;
  onClose: () => void;
  onFertig: () => void;
}) {
  const { toast } = useToast();
  const { data: gewerke } = useTrades();
  /** Angehakte Gewerke in der Reihenfolge des Anhakens. */
  const [gewaehlt, setGewaehlt] = React.useState<string[]>([]);
  const [suche, setSuche] = React.useState('');
  const [dauer, setDauer] = React.useState(1);
  const [eigene, setEigene] = React.useState('');

  React.useEffect(() => {
    if (offen) {
      setGewaehlt([]);
      setSuche('');
      setDauer(1);
      setEigene('');
    }
  }, [offen]);

  const liste = React.useMemo(() => {
    const alle = gewerke ?? [];
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return alle;
    return alle.filter((g) => g.name.toLowerCase().includes(begriff));
  }, [gewerke, suche]);

  const umschalten = (id: string) =>
    setGewaehlt((vorher) =>
      vorher.includes(id) ? vorher.filter((x) => x !== id) : [...vorher, id],
    );

  const anlegen = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>(`/api/projects/${projectId}/bauzeitenplan`, {
        zeilen: gewaehlt.length
          ? gewaehlt.map((tradeId) => ({
              tradeId,
              dauer,
              // Eine eigene Bezeichnung passt nur, wenn es um ein Gewerk geht.
              label: gewaehlt.length === 1 ? eigene.trim() || null : null,
            }))
          : [{ label: eigene.trim(), dauer }],
      }),
    onSuccess: (res) => {
      onFertig();
      onClose();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const kannAnlegen = gewaehlt.length > 0 || eigene.trim().length > 0;
  const einheit = raster === 'WOCHE' ? 'Wochen' : 'Tage';

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogTitle>Gewerke hinzufügen</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Nur die, die auf dieser Baustelle wirklich vorkommen. Mehrere auf einmal sind der
          Normalfall – sie reihen sich in der Reihenfolge auf, in der Sie sie anhaken.
        </p>

        <div className="mt-3 shrink-0">
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Gewerk suchen …"
          />
        </div>

        {/* Die Liste scrollt, der Rest des Dialogs bleibt stehen. */}
        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
          {liste.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {suche.trim()
                ? `Kein Gewerk mit „${suche.trim()}“. Unten als eigene Bezeichnung eintragen.`
                : 'Noch keine Gewerke angelegt – unter Einstellungen › Gewerke.'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {liste.map((g) => {
                const stelle = gewaehlt.indexOf(g.id);
                const an = stelle >= 0;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => umschalten(g.id)}
                      aria-pressed={an}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                        'min-h-9 [@media(pointer:coarse)]:min-h-11',
                        an ? 'bg-primary/10 font-medium' : 'hover:bg-accent',
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: g.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      {an ? (
                        <Badge variant="default" className="shrink-0 tabular-nums">
                          {stelle + 1}
                        </Badge>
                      ) : (
                        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 shrink-0 space-y-3 border-t pt-3">
          <Field label={`Dauer je Gewerk (${einheit})`}>
            <Input
              type="number"
              min={1}
              max={260}
              value={dauer}
              onChange={(e) => setDauer(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>

          {gewaehlt.length <= 1 ? (
            <Field
              label="Eigene Bezeichnung"
              hint={
                gewaehlt.length === 1
                  ? 'Optional. Dasselbe Gewerk kommt oft zweimal vor – „Sanitär Rohinstallation“ und „Sanitär Endmontage“.'
                  : 'Für eine Zeile, die zu keinem Gewerk gehört – etwa „Baustelle einrichten“.'
              }
            >
              <Input
                value={eigene}
                onChange={(e) => setEigene(e.target.value)}
                placeholder="z. B. Rohinstallation"
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="sm" disabled={anlegen.isPending || !kannAnlegen} onClick={() => anlegen.mutate()}>
            <Plus />
            {gewaehlt.length > 1 ? `${gewaehlt.length} Gewerke hinzufügen` : 'Hinzufügen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ZeileBearbeitenDialog({
  phase,
  projectId,
  raster,
  onClose,
  onFertig,
  onWeg,
}: {
  phase: PhaseDTO | null;
  projectId: string;
  raster: Raster;
  onClose: () => void;
  onFertig: () => void;
  /** Loeschen laeuft ueber die Rueckfrage im Reiter - eine Stelle, ein Text. */
  onWeg: (phase: PhaseDTO) => void;
}) {
  const { toast } = useToast();
  const { data: gewerke } = useTrades();
  const { data: subs } = useQuery({
    queryKey: ['subcontractors-kurz'],
    queryFn: () => api.get<{ id: string; companyName: string }[]>('/api/subcontractors'),
  });

  const [form, setForm] = React.useState({
    tradeId: '',
    label: '',
    subcontractorId: '',
    startDate: '',
    endDate: '',
    note: '',
  });

  React.useEffect(() => {
    if (!phase) return;
    setForm({
      tradeId: phase.tradeId ?? '',
      label: phase.titel === phase.gewerk ? '' : phase.titel,
      subcontractorId: phase.subcontractorId ?? '',
      startDate: phase.startDate,
      endDate: phase.endDate,
      note: phase.note ?? '',
    });
  }, [phase]);

  const speichern = useMutation({
    mutationFn: () =>
      api.patch<{ message: string }>(`/api/projects/${projectId}/bauzeitenplan`, {
        was: 'zeile',
        phaseId: phase!.id,
        tradeId: form.tradeId || null,
        label: form.label.trim() || null,
        subcontractorId: form.subcontractorId || null,
        startDate: form.startDate,
        endDate: form.endDate,
        note: form.note.trim() || null,
      }),
    onSuccess: (res) => {
      onFertig();
      onClose();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  return (
    <Dialog open={Boolean(phase)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{phase?.titel}</DialogTitle>

        <div className="mt-3 space-y-3">
          <Field label="Gewerk">
            <Select
              value={form.tradeId}
              onChange={(e) => setForm({ ...form, tradeId: e.target.value })}
            >
              <option value="">– ohne –</option>
              {(gewerke ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Eigene Bezeichnung">
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="z. B. Rohinstallation"
            />
          </Field>

          <Field label="Firma" hint="Wer es macht, sobald es feststeht.">
            <Select
              value={form.subcontractorId}
              onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })}
            >
              <option value="">– noch offen –</option>
              {(subs ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.companyName}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Von">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field label="Bis">
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-2xs text-muted-foreground">
            {raster === 'WOCHE'
              ? 'Im Wochenraster rastet der Zeitraum auf Montag bis Sonntag ein.'
              : 'Tagesraster – die Daten bleiben, wie sie dastehen.'}
            {' '}Ein Datum hier ändert nur diese Zeile, es rückt nichts nach.
          </p>

          <Field label="Notiz">
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="z. B. Material steht auf der Baustelle"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => phase && onWeg(phase)}
          >
            <Trash2 /> Entfernen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Abbrechen
            </Button>
            <Button size="sm" disabled={speichern.isPending} onClick={() => speichern.mutate()}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Warum leuchtet das Warnzeichen?
 *
 * Zwei verschiedene Probleme, und das zweite ist das gemeinere: Beim ersten
 * ist offensichtlich nichts geplant, beim zweiten sieht der Plan vollständig
 * aus und am Montag steht die falsche Mannschaft auf der Baustelle.
 */
function besetzungText(p: PhaseDTO): string {
  if (p.besetzung === 'niemand') {
    return `Für ${p.titel} steht im Zeitraum niemand auf der Plantafel.`;
  }
  const da = p.wer.length ? p.wer.join(', ') : 'jemand';
  return `${p.firma ?? 'Die hinterlegte Firma'} steht nicht auf der Plantafel – eingeplant ist ${da}.`;
}

/**
 * Eine Planzeile auf die Plantafel schreiben.
 *
 * Der Bauzeitenplan sagt, wann ein Gewerk dran ist; die Plantafel sagt, wer
 * kommt. Das doppelt eintragen zu müssen ist die häufigste Art, wie beide
 * auseinanderlaufen.
 *
 * Mit Rückfrage, nicht stillschweigend: Der Einsatz steht danach auf der Tafel
 * und belegt dort jemanden. Ein Einsatz deckt den ganzen Zeitraum ab - die
 * Plantafel kann das, es braucht keine fünfzehn Tageseinträge.
 *
 * Ist keine Firma hinterlegt, wird ein unbesetzter Platzhalter daraus. Das ist
 * ehrlicher als nichts einzutragen: "hier fehlt jemand" steht dann an der
 * richtigen Woche und nicht in jemandes Kopf.
 */
function AufDieTafelDialog({
  phase,
  projectId,
  onClose,
  onFertig,
}: {
  phase: PhaseDTO | null;
  projectId: string;
  onClose: () => void;
  onFertig: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eintragen = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>('/api/assignments', {
        projectId,
        ...(phase!.subcontractorId
          ? { resourceType: 'SUBUNTERNEHMER', subcontractorId: phase!.subcontractorId }
          : { resourceType: 'UNBESETZT', placeholderLabel: phase!.titel.slice(0, 120) }),
        startDate: phase!.startDate,
        endDate: phase!.endDate,
        note: phase!.note || null,
      }),
    onSuccess: (res) => {
      // Die Tafel, die Warnungen und der Plan selbst zeigen das Ergebnis.
      for (const key of BOARD_KEYS) queryClient.invalidateQueries({ queryKey: key });
      onFertig();
      onClose();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const tage = phase
    ? Math.round(
        (new Date(`${phase.endDate}T12:00:00`).getTime() -
          new Date(`${phase.startDate}T12:00:00`).getTime()) /
          86_400_000,
      ) + 1
    : 0;

  return (
    <Dialog open={Boolean(phase)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Auf die Plantafel eintragen</DialogTitle>

        {phase ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {phase.subcontractorId ? (
                <>
                  <span className="font-medium text-foreground">{phase.firma}</span> wird für{' '}
                  {phase.titel} eingeplant.
                </>
              ) : (
                <>
                  Für {phase.titel} ist noch keine Firma hinterlegt. Es wird ein unbesetzter
                  Platzhalter „{phase.titel}“ eingetragen – damit steht „hier fehlt jemand“ an der
                  richtigen Woche.
                </>
              )}
            </p>

            <dl className="mt-3 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">Zeitraum</dt>
                <dd className="tabular-nums">
                  {formatDateShort(phase.startDate)} – {formatDateShort(phase.endDate)} ({tage}{' '}
                  {tage === 1 ? 'Tag' : 'Tage'})
                </dd>
              </div>
              {phase.wer.length ? (
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted-foreground">Schon da</dt>
                  <dd>{phase.wer.join(', ')}</dd>
                </div>
              ) : null}
            </dl>

            <p className="mt-2 text-2xs text-muted-foreground">
              Ein Einsatz über den ganzen Zeitraum, kein Eintrag je Tag. Verschieben, kürzen und
              Zeiten setzen geht danach auf der Plantafel wie bei jedem anderen Einsatz.
            </p>
          </>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="sm" disabled={eintragen.isPending} onClick={() => eintragen.mutate()}>
            <CalendarPlus /> Eintragen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Die zweite Zeile unter dem Gewerknamen.
 *
 * Vorher stand dort entweder die Firma oder der Zeitraum - nie beides, und
 * welches, entschied ein Zufall der Daten. Der Zeitraum gehoert immer dahin:
 * Beim Ablesen eines Plans ist „wann“ die erste Frage, und Balken abzaehlen
 * ist keine Antwort.
 */
function untertitel(p: PhaseDTO): string {
  const zeitraum = `${formatDateShort(p.startDate)}–${formatDateShort(p.endDate)}`;
  const wer = p.firma ?? (p.gewerk && p.gewerk !== p.titel ? p.gewerk : null);
  return wer ? `${wer} · ${zeitraum}` : zeitraum;
}

/** Enddatum um N Spalten verschieben – für das Ziehen an der rechten Kante. */
function tageSpaeter(iso: IsoDate, spalten: number, raster: Raster): IsoDate {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + spalten * (raster === 'WOCHE' ? 7 : 1));
  return d.toISOString().slice(0, 10) as IsoDate;
}

