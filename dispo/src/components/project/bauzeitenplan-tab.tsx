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
import { CalendarRange, GripVertical, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useIch } from '@/lib/ich';
import { useIstSchmal } from '@/lib/schmal';
import { useTrades } from '@/lib/queries';
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
                <div
                  key={p.id}
                  className="grid border-b last:border-b-0 hover:bg-accent/30"
                  style={{
                    gridTemplateColumns: `var(--name) repeat(${fenster.spalten.length}, var(--spalte))`,
                  }}
                >
                  <button
                    onClick={() => darfAendern && setBearbeiten(p)}
                    className="min-w-0 border-r px-2 py-2 text-left"
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
                    </span>
                    <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                      {p.firma ??
                        (p.gewerk && p.gewerk !== p.titel
                          ? p.gewerk
                          : `${formatDateShort(p.startDate)}–${formatDateShort(p.endDate)}`)}
                    </span>
                  </button>

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
              );
            })}
          </div>
        </div>
      )}

      {phasen.length > 0 && darfAendern ? (
        <p className="text-2xs text-muted-foreground">
          {schmal ? (
            <>
              Balken schieben verschiebt alles ab dort – der Plan behält seine Form. Auf den Namen
              links tippen, um Zeitraum, Firma und Notiz zu ändern.
            </>
          ) : (
            <>
              Balken ziehen verschiebt alles ab dort – der Plan behält seine Form. Mit gedrückter{' '}
              <kbd className="rounded border px-1">Alt</kbd>-Taste wandert nur diese eine Zeile. An
              der rechten Kante wird der Balken länger oder kürzer.
            </>
          )}
        </p>
      ) : null}

      <NeueZeileDialog
        offen={neueZeile}
        projectId={projectId}
        onClose={() => setNeueZeile(false)}
        onFertig={aktualisieren}
      />
      <ZeileBearbeitenDialog
        phase={bearbeiten}
        projectId={projectId}
        raster={raster}
        onClose={() => setBearbeiten(null)}
        onFertig={aktualisieren}
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

function NeueZeileDialog({
  offen,
  projectId,
  onClose,
  onFertig,
}: {
  offen: boolean;
  projectId: string;
  onClose: () => void;
  onFertig: () => void;
}) {
  const { toast } = useToast();
  const { data: gewerke } = useTrades();
  const [tradeId, setTradeId] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [dauer, setDauer] = React.useState(1);

  React.useEffect(() => {
    if (offen) {
      setTradeId('');
      setLabel('');
      setDauer(1);
    }
  }, [offen]);

  const anlegen = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>(`/api/projects/${projectId}/bauzeitenplan`, {
        tradeId: tradeId || null,
        label: label.trim() || null,
        dauer,
      }),
    onSuccess: (res) => {
      onFertig();
      onClose();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>Gewerk hinzufügen</DialogTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Es müssen nicht alle Gewerke in den Plan – nur die, die auf dieser Baustelle wirklich
          vorkommen.
        </p>

        <div className="mt-3 space-y-3">
          <Field label="Gewerk">
            <Select value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
              <option value="">– wählen –</option>
              {(gewerke ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Eigene Bezeichnung"
            hint="Optional. Dasselbe Gewerk kommt oft zweimal vor – „Sanitär Rohinstallation“ und „Sanitär Endmontage“."
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. Rohinstallation"
            />
          </Field>

          <Field label="Dauer">
            <Input
              type="number"
              min={1}
              max={260}
              value={dauer}
              onChange={(e) => setDauer(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            disabled={anlegen.isPending || (!tradeId && !label.trim())}
            onClick={() => anlegen.mutate()}
          >
            <Plus /> Hinzufügen
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
}: {
  phase: PhaseDTO | null;
  projectId: string;
  raster: Raster;
  onClose: () => void;
  onFertig: () => void;
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

  const loeschen = useMutation({
    mutationFn: () =>
      api.delete<{ message: string }>(
        `/api/projects/${projectId}/bauzeitenplan?zeile=${phase!.id}`,
      ),
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
            disabled={loeschen.isPending}
            onClick={() => loeschen.mutate()}
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

/** Enddatum um N Spalten verschieben – für das Ziehen an der rechten Kante. */
function tageSpaeter(iso: IsoDate, spalten: number, raster: Raster): IsoDate {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + spalten * (raster === 'WOCHE' ? 7 : 1));
  return d.toISOString().slice(0, 10) as IsoDate;
}

export { Badge };
