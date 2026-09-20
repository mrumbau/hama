'use client';
/**
 * Die Plantafel auf dem Handy: ein Tag, untereinander.
 *
 * Das Raster aus Zeilen und Spalten ist für einen Bildschirm gebaut. Auf
 * einem Handy bleiben neben der Baustellenspalte rund hundert Pixel übrig –
 * ein Tag, und den muss man sich erst heranschieben. Kleiner skalieren hilft
 * nicht, das Format ist das Problem.
 *
 * Deshalb hier etwas anderes: ein Tag, die Baustellen untereinander, darunter
 * wer dort ist. Das ist die Frage, die jemand auf der Baustelle tatsächlich
 * hat – „wer ist heute wo" –, und nicht „wie sieht der September aus".
 *
 * Bewusst ohne Ziehen und Fallenlassen. Eine Kachel über mehrere Tage zu
 * schieben, die gar nicht gleichzeitig zu sehen sind, wäre ein Versprechen,
 * das der kleine Bildschirm nicht hält. Verschoben wird über den Einsatz
 * selbst, wo Datum und Dauer als Felder stehen.
 */
import * as React from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListChecks,
  MapPin,
  Palmtree,
  Plus,
  StickyNote,
  Thermometer,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssignmentDTO, BoardResponse, ProjectSummaryDTO, ResourceDTO } from '@/lib/types';
import { ASSIGNMENT_KIND_SHORT, internFarbe } from '@/lib/labels';
import { addDays, formatDayLong, isWeekend, todayIso, type IsoDate } from '@/lib/dates';
import { belegtUndLeer, einsaetzeAmTag, gruppiere } from '@/lib/tagesplan';
import { feiertagName } from '@/lib/feiertage';
import { AmpelDot } from '@/components/ui/ampel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import type { ChipActions } from './assignment-chip';
import type { BoardView } from './use-board';

export function Tagesliste({
  board,
  view,
  tag,
  actions,
  onTag,
  onQuickPlanProjekt,
  onQuickPlanRessource,
}: {
  board: BoardResponse;
  view: BoardView;
  tag: IsoDate;
  actions: ChipActions;
  onTag: (datum: IsoDate) => void;
  onQuickPlanProjekt: (projectId: string, datum: IsoDate) => void;
  onQuickPlanRessource: (resource: ResourceDTO, datum: IsoDate) => void;
}) {
  const desTages = React.useMemo(
    () => einsaetzeAmTag(board.assignments, tag),
    [board.assignments, tag],
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto pb-28" data-tour="tafel">
      <Tagesleiste tag={tag} onTag={onTag} anzahl={desTages.length} />
      {view === 'baustellen' ? (
        <NachBaustellen
          board={board}
          tag={tag}
          desTages={desTages}
          actions={actions}
          onQuickPlan={onQuickPlanProjekt}
        />
      ) : (
        <NachLeuten
          board={board}
          tag={tag}
          desTages={desTages}
          actions={actions}
          onQuickPlan={onQuickPlanRessource}
        />
      )}
    </div>
  );
}

/**
 * Welcher Tag – und einen weiter.
 *
 * Klebt oben fest: Wer durch zwanzig Baustellen scrollt, verliert sonst aus
 * dem Blick, welchen Tag er gerade ansieht. Genau dieser Irrtum kostet einen
 * Anruf.
 */
function Tagesleiste({
  tag,
  onTag,
  anzahl,
}: {
  tag: IsoDate;
  onTag: (d: IsoDate) => void;
  anzahl: number;
}) {
  const heute = todayIso();
  const feiertag = feiertagName(tag);
  const frei = feiertag || isWeekend(tag);

  return (
    <div className="sticky top-0 z-20 flex items-center gap-1 border-b bg-card px-2 py-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onTag(addDays(tag, -1))}
        aria-label="Vorheriger Tag"
      >
        <ChevronLeft />
      </Button>

      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className={cn('truncate text-sm font-semibold', frei && 'text-muted-foreground')}>
          {formatDayLong(tag)}
        </p>
        <p className="truncate text-2xs text-muted-foreground">
          {feiertag ? feiertag : tag === heute ? 'Heute' : null}
          {feiertag || tag === heute ? ' · ' : ''}
          {anzahl === 0 ? 'nichts geplant' : anzahl === 1 ? '1 Einsatz' : `${anzahl} Einsätze`}
        </p>
      </div>

      {tag !== heute ? (
        <Button variant="secondary" size="sm" onClick={() => onTag(heute)}>
          Heute
        </Button>
      ) : null}

      <Button
        variant="outline"
        size="icon"
        onClick={() => onTag(addDays(tag, 1))}
        aria-label="Nächster Tag"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ansicht A – nach Baustellen
// ---------------------------------------------------------------------------

function NachBaustellen({
  board,
  tag,
  desTages,
  actions,
  onQuickPlan,
}: {
  board: BoardResponse;
  tag: IsoDate;
  desTages: AssignmentDTO[];
  actions: ChipActions;
  onQuickPlan: (projectId: string, datum: IsoDate) => void;
}) {
  const jeProjekt = gruppiere(desTages, (a) => a.projectId);

  // Besorgungsfahrten sind keine Baustellenzeile – sie gehen immer FÜR eine.
  const projekte = board.projects.filter((p) => p.internKey !== 'BESORGUNG');
  const { belegt, leer } = belegtUndLeer(projekte, jeProjekt);

  if (projekte.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="Keine Baustellen in dieser Ansicht"
        description="Passen Sie den Zeitraum oder die Filter an."
        className="m-3"
      />
    );
  }

  return (
    <div className="space-y-2 p-2">
      {belegt.map((p) => (
        <BaustellenKarte
          key={p.id}
          projekt={p}
          tag={tag}
          board={board}
          eintraege={jeProjekt.get(p.id) ?? []}
          actions={actions}
          onQuickPlan={onQuickPlan}
        />
      ))}

      {leer.length > 0 ? (
        <Ausklapper
          titel={`${leer.length} Baustellen ohne Einsatz an diesem Tag`}
          /*
           * Ist an diesem Tag gar nichts geplant, waere ein zugeklappter
           * Kasten die einzige Antwort auf dem Bildschirm - und man muesste
           * raten, ob dahinter etwas steckt.
           */
          startOffen={belegt.length === 0}
        >
          <div className="space-y-2 pt-2">
            {leer.map((p) => (
              <BaustellenKarte
                key={p.id}
                projekt={p}
                tag={tag}
                board={board}
                eintraege={[]}
                actions={actions}
                onQuickPlan={onQuickPlan}
              />
            ))}
          </div>
        </Ausklapper>
      ) : null}
    </div>
  );
}

function BaustellenKarte({
  projekt,
  tag,
  board,
  eintraege,
  actions,
  onQuickPlan,
}: {
  projekt: ProjectSummaryDTO;
  tag: IsoDate;
  board: BoardResponse;
  eintraege: AssignmentDTO[];
  actions: ChipActions;
  onQuickPlan: (projectId: string, datum: IsoDate) => void;
}) {
  const intern = projekt.internKey;
  const farbe = internFarbe(intern);
  const InternSymbol =
    intern === 'LAGER'
      ? Warehouse
      : intern === 'BESORGUNG'
        ? Truck
        : intern === 'URLAUB'
          ? Palmtree
          : Thermometer;

  return (
    <section
      className="overflow-hidden rounded-lg border-l-[3px] bg-card shadow-sm ring-1 ring-border/60"
      style={{
        borderLeftColor: farbe ?? 'transparent',
        backgroundColor: farbe ? `${farbe}0d` : undefined,
      }}
    >
      <button
        onClick={() => actions.onOpenProject(projekt.id)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left active:bg-accent/60"
      >
        {intern ? (
          <span className="mt-0.5" style={{ color: farbe ?? undefined }}>
            <InternSymbol className="size-4" aria-hidden />
          </span>
        ) : (
          <span className="mt-1">
            <AmpelDot light={projekt.trafficLight} />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">
            {intern ? projekt.name : projekt.customerName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {intern
              ? (projekt.internalNotes ?? '')
              : `${projekt.name}${projekt.city ? ` · ${projekt.city}` : ''}`}
          </span>
          {!intern ? (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {projekt.primarySiteManagerName ? (
                <Badge
                  variant="outline"
                  style={
                    projekt.primarySiteManagerColor
                      ? {
                          borderColor: projekt.primarySiteManagerColor,
                          color: projekt.primarySiteManagerColor,
                        }
                      : undefined
                  }
                >
                  {projekt.primarySiteManagerName}
                </Badge>
              ) : (
                <Badge variant="rot">Kein Bauleiter</Badge>
              )}
              {projekt.orderNumber ? (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {projekt.orderNumber}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>

      <div className="space-y-1.5 px-2 pb-2">
        {eintraege.map((a) => (
          <EinsatzZeile
            key={a.id}
            einsatz={a}
            titel={a.resourceLabel}
            projekt={projekt}
            konflikt={Boolean(board.conflicts[`${a.resourceKey}|${tag}`])}
            actions={actions}
          />
        ))}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onQuickPlan(projekt.id, tag)}
        >
          <Plus /> {eintraege.length ? 'Noch jemanden einplanen' : 'Jemanden einplanen'}
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ansicht B – nach Leuten
// ---------------------------------------------------------------------------

const GRUPPEN_TITEL: Record<string, string> = {
  MITARBEITER: 'Mitarbeiter',
  BAULEITER: 'Bauleiter',
  SUBUNTERNEHMER: 'Subunternehmer',
};

function NachLeuten({
  board,
  tag,
  desTages,
  actions,
  onQuickPlan,
}: {
  board: BoardResponse;
  tag: IsoDate;
  desTages: AssignmentDTO[];
  actions: ChipActions;
  onQuickPlan: (resource: ResourceDTO, datum: IsoDate) => void;
}) {
  const jeRessource = gruppiere(desTages, (a) => a.resourceKey);
  const projekte = new Map(board.projects.map((p) => [p.id, p]));
  const reihenfolge = ['MITARBEITER', 'BAULEITER', 'SUBUNTERNEHMER'];

  const sichtbar = board.resources.filter((r) => r.active !== false);
  if (sichtbar.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Niemand in dieser Ansicht"
        description="Passen Sie die Filter an."
        className="m-3"
      />
    );
  }

  return (
    <div className="space-y-3 p-2">
      {reihenfolge.map((gruppe) => {
        const leute = sichtbar.filter((r) => r.gruppe === gruppe);
        if (!leute.length) return null;

        return (
          <section key={gruppe}>
            <h2 className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {GRUPPEN_TITEL[gruppe] ?? gruppe}
            </h2>
            <div className="space-y-2">
              {leute.map((r) => {
                const eintraege = jeRessource.get(r.key) ?? [];
                return (
                  <section
                    key={r.key}
                    className="overflow-hidden rounded-lg border-l-[3px] bg-card shadow-sm ring-1 ring-border/60"
                    style={{ borderLeftColor: r.color }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold leading-tight">
                          {r.label}
                        </span>
                        {r.subtitle ? (
                          <span className="block truncate text-2xs text-muted-foreground">
                            {r.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {/*
                        „Frei" ist die Auskunft, wegen der man diese Ansicht
                        überhaupt aufmacht: Wer kann heute noch irgendwo hin?
                      */}
                      {eintraege.length === 0 ? (
                        <Badge variant="gruen">frei</Badge>
                      ) : eintraege.length > 1 ? (
                        <Badge variant="gelb">{eintraege.length} Einsätze</Badge>
                      ) : null}
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => onQuickPlan(r, tag)}
                        aria-label={`${r.label} einplanen`}
                      >
                        <Plus />
                      </Button>
                    </div>

                    {eintraege.length ? (
                      <div className="space-y-1.5 px-2 pb-2">
                        {eintraege.map((a) => {
                          const p = projekte.get(a.projectId);
                          return (
                            <EinsatzZeile
                              key={a.id}
                              einsatz={a}
                              titel={
                                p
                                  ? p.internKey
                                    ? p.name
                                    : `${p.customerName} – ${p.name}`
                                  : 'Baustelle'
                              }
                              projekt={p}
                              konflikt={Boolean(board.conflicts[`${a.resourceKey}|${tag}`])}
                              actions={actions}
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ein Einsatz als Zeile
// ---------------------------------------------------------------------------

/**
 * Derselbe Inhalt wie die Kachel im Raster, nur in Zeilenform.
 *
 * Bewusst nicht dieselbe Komponente: Die Kachel ist zum Ziehen gebaut, sitzt
 * in einer Tabellenzelle und muss sich auf Daumenbreite zusammenfalten. Hier
 * ist Platz in der Breite und keiner in der Höhe – und angefasst wird mit dem
 * Finger, nicht mit einem Mauszeiger.
 */
function EinsatzZeile({
  einsatz,
  titel,
  projekt,
  konflikt,
  actions,
}: {
  einsatz: AssignmentDTO;
  titel: string;
  projekt?: ProjectSummaryDTO;
  konflikt: boolean;
  actions: ChipActions;
}) {
  const vorschlag = einsatz.status === 'VORSCHLAG';
  const bestaetigt = einsatz.status === 'BESTAETIGT';
  const abgesagt = einsatz.status === 'ABGESAGT';
  const vorlaeufig = einsatz.status === 'GEPLANT' && einsatz.resourceType !== 'UNBESETZT';

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border-l-[3px] bg-background/80 px-2 py-2 ring-1 ring-border/60',
        abgesagt && 'opacity-50 line-through',
        vorschlag && 'border-dashed bg-muted/50',
        konflikt && 'ring-2 ring-destructive',
      )}
      style={{
        borderLeftColor: vorschlag
          ? 'hsl(var(--muted-foreground))'
          : (internFarbe(projekt?.internKey) ?? einsatz.color),
      }}
    >
      {/*
        Die ganze Zeile öffnet den Einsatz. Auf dem Handy trifft niemand ein
        Dreipunktmenü in der Ecke – und dort liegt auch der Daumen.
      */}
      <button
        onClick={() => actions.onEdit(einsatz)}
        className="min-w-0 flex-1 text-left"
        aria-label={`${titel} öffnen`}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">{titel}</span>
          {bestaetigt ? (
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded bg-ampel-gruen text-xs font-bold leading-none text-white"
              title="Bestätigter Termin"
            >
              T
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
          {einsatz.kind !== 'ARBEIT' ? (
            <span className="font-medium text-primary">{ASSIGNMENT_KIND_SHORT[einsatz.kind]}</span>
          ) : null}
          {einsatz.startTime ? (
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" />
              {einsatz.startTime}
              {einsatz.endTime ? `–${einsatz.endTime}` : ''}
            </span>
          ) : null}
          {einsatz.startDate !== einsatz.endDate ? (
            <span className="flex items-center gap-0.5">
              <CalendarDays className="size-3" />
              mehrtägig
            </span>
          ) : null}
          {einsatz.tasks.length ? (
            <span className="flex items-center gap-0.5">
              <ListChecks className="size-3" />
              {einsatz.tasks.length}
            </span>
          ) : null}
          {vorschlag ? (
            <span className="rounded border border-dashed border-muted-foreground/70 px-1 py-0.5 font-semibold">
              Vorschlag{einsatz.angelegtVon ? ` ${einsatz.angelegtVon}` : ''}
            </span>
          ) : null}
          {vorlaeufig && !vorschlag ? <span className="font-semibold">vorl.</span> : null}
        </span>

        {einsatz.note ? (
          <span className="mt-0.5 flex items-start gap-1 text-2xs text-muted-foreground">
            <StickyNote className="mt-px size-3 shrink-0" />
            <span className="min-w-0 flex-1">{einsatz.note}</span>
          </span>
        ) : null}
      </button>

      {vorschlag && actions.onAnnehmen ? (
        <button
          type="button"
          onClick={() => actions.onAnnehmen!(einsatz)}
          aria-label="Vorschlag annehmen"
          title="Vorschlag annehmen"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-ampel-gruen/40 bg-ampel-gruen/10 text-ampel-gruen active:bg-ampel-gruen active:text-white"
        >
          <Check className="size-5" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Ausklapper({
  titel,
  children,
  startOffen = false,
}: {
  titel: string;
  children: React.ReactNode;
  startOffen?: boolean;
}) {
  const [offen, setOffen] = React.useState(startOffen);
  return (
    <div className="pt-1">
      <Button variant="ghost" size="sm" className="w-full" onClick={() => setOffen((o) => !o)}>
        {offen ? 'Weniger zeigen' : titel}
      </Button>
      {offen ? children : null}
    </div>
  );
}

