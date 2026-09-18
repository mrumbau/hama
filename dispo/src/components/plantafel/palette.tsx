'use client';
/**
 * Ablageleiste über der Plantafel.
 *
 * Bisher ließen sich nur vorhandene Einsätze verschieben. Hier stehen die
 * Bausteine, aus denen ein NEUER Einsatz entsteht:
 *
 *   Baustellenansicht  → Mitarbeiter, Bauleiter und SUBs zum Hineinziehen
 *   Ressourcenansicht  → Baustellen zum Hineinziehen
 *
 * Wer lieber klickt, kann weiterhin auf das Plus in der Zelle gehen – die
 * Leiste ist eine Abkürzung, kein neuer Pflichtweg.
 */
import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronUp, GripVertical, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { internFarbe, projektTitel, projektZeile } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { BoardResponse, ProjectSummaryDTO, ResourceDTO } from '@/lib/types';
import type { IsoDate } from '@/lib/dates';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AmpelDot } from '@/components/ui/ampel';
import type { BoardView } from './use-board';

export interface PaletteResourceItem {
  art: 'ressource';
  resource: ResourceDTO;
}
export interface PaletteProjectItem {
  art: 'projekt';
  project: ProjectSummaryDTO;
}
export type PaletteItem = PaletteResourceItem | PaletteProjectItem;

const GRUPPEN = [
  { type: 'MITARBEITER', titel: 'Mitarbeiter', standardOffen: true },
  { type: 'BAULEITER', titel: 'Bauleiter', standardOffen: true },
  { type: 'SUBUNTERNEHMER', titel: 'Subunternehmer', standardOffen: false },
] as const;

export function Palette({
  view,
  board,
  belegtAm,
  onAktualisieren,
}: {
  view: BoardView;
  board: BoardResponse;
  /** Tag, auf den sich die Verfügbarkeitsanzeige bezieht. */
  belegtAm: IsoDate;
  /** Neu laden, nachdem ein Subunternehmer zur Auswahl hinzugekommen ist. */
  onAktualisieren: () => void;
}) {
  const [offen, setOffen] = React.useState(true);
  const [suche, setSuche] = React.useState('');

  // Wer ist an diesem Tag schon verplant? Damit man nicht erst zieht und
  // dann die Konfliktwarnung liest.
  const belegt = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of board.assignments) {
      if (a.status === 'ABGESAGT') continue;
      if (belegtAm >= a.startDate && belegtAm <= a.endDate) set.add(a.resourceKey);
    }
    return set;
  }, [board.assignments, belegtAm]);

  const passt = (text: string) => !suche || text.toLowerCase().includes(suche.toLowerCase());

  const inhalt =
    view === 'baustellen' ? (
      <div className="flex flex-wrap items-start gap-2">
        {GRUPPEN.map((gruppe) => {
          const alle = board.resources.filter(
            (r) => r.gruppe === gruppe.type && r.active && passt(`${r.label} ${r.subtitle ?? ''}`),
          );
          // Subunternehmer: nur die üblichen. Von dreissig braucht man
          // täglich eine Handvoll – der Rest kommt über „Hinzufügen" dazu
          // und bleibt dann auch da.
          const items =
            gruppe.type === 'SUBUNTERNEHMER' && !suche ? alle.filter((r) => r.bevorzugt) : alle;
          return (
            <Gruppenkachel
              key={gruppe.type}
              titel={gruppe.titel}
              anzahl={items.length}
              zusatz={
                gruppe.type === 'SUBUNTERNEHMER' ? (
                  <SubHinzufuegen
                    alle={alle.filter((r) => !r.bevorzugt)}
                    onFertig={onAktualisieren}
                  />
                ) : null
              }
              // Mitarbeiter stehen immer offen – das sind die paar Leute, die
              // man täglich verteilt. Subunternehmer sind Dutzende und würden
              // die Leiste zuschütten, deshalb zugeklappt mit Suche.
              standardOffen={gruppe.standardOffen}
              gesucht={Boolean(suche)}
            >
              {items.map((r) => (
                <ResourceChip key={r.key} resource={r} belegt={belegt.has(r.key)} />
              ))}
            </Gruppenkachel>
          );
        })}
      </div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {board.projects
          .filter((p) =>
            passt(`${p.customerName} ${p.name} ${p.orderNumber ?? ''} ${p.city ?? ''}`),
          )
          .map((p) => (
            <ProjectChip key={p.id} project={p} />
          ))}
      </div>
    );

  return (
    <div className="border-b bg-muted/30" data-tour="ablage">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setOffen((v) => !v)}
          className="text-muted-foreground"
        >
          {offen ? <ChevronUp /> : <ChevronDown />}
          {view === 'baustellen' ? 'Personal einplanen' : 'Baustellen einplanen'}
        </Button>
        <span className="hidden text-2xs text-muted-foreground sm:block">
          In eine Tageszelle ziehen
        </span>
        {offen ? (
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suchen …"
              className="h-7 w-40 pl-6 text-xs"
            />
          </div>
        ) : null}
      </div>
      {offen ? <div className="max-h-36 overflow-auto px-3 pb-2">{inhalt}</div> : null}
    </div>
  );
}

function ResourceChip({ resource, belegt }: { resource: ResourceDTO; belegt: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-resource:${resource.key}`,
    data: { paletteItem: { art: 'ressource', resource } satisfies PaletteResourceItem },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={
        belegt
          ? `${resource.label} ist an diesem Tag bereits verplant`
          : `${resource.label} – in eine Tageszelle ziehen`
      }
      className={cn(
        'flex cursor-grab touch-none items-center gap-1 rounded border bg-card px-1.5 py-1 text-2xs shadow-sm transition',
        'hover:shadow',
        isDragging && 'opacity-40',
        belegt && 'opacity-60',
      )}
      style={{ borderLeftColor: resource.color, borderLeftWidth: 3 }}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground" />
      <span className="max-w-[10rem] truncate font-medium">{resource.label}</span>
      {belegt ? (
        <span className="shrink-0 text-muted-foreground">belegt</span>
      ) : (
        <span className="shrink-0 text-ampel-gruen">frei</span>
      )}
    </button>
  );
}

function ProjectChip({ project }: { project: ProjectSummaryDTO }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-project:${project.id}`,
    data: { paletteItem: { art: 'projekt', project } satisfies PaletteProjectItem },
  });

  const farbe = internFarbe(project.internKey);

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={projektZeile(project)}
      className={cn(
        'flex cursor-grab touch-none items-center gap-1 rounded border bg-card px-1.5 py-1 text-2xs shadow-sm transition hover:shadow',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground" />
      {/*
        Lager, Besorgungsfahrten, Urlaub und Krank tragen ihre eigene Farbe
        statt einer Ampel. Ein grauer Punkt sagt dort nichts - es gibt keinen
        Termin, der reissen koennte.
      */}
      {farbe ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: farbe }}
          aria-hidden
        />
      ) : (
        <AmpelDot light={project.trafficLight} className="size-2" />
      )}
      <span className="max-w-[12rem] truncate font-medium">{projektTitel(project)}</span>
      {project.orderNumber ? (
        <Badge variant="outline" className="shrink-0">
          {project.orderNumber}
        </Badge>
      ) : null}
    </button>
  );
}

/**
 * Eine aufklappbare Gruppe in der Ablageleiste.
 *
 * Bei drei Mitarbeitern ist eine Kachel überflüssig, bei dreißig
 * Subunternehmern ist sie der Unterschied zwischen Übersicht und Tapete.
 * Deshalb entscheidet die Gruppe selbst, ob sie offen startet – und sobald
 * jemand sucht, gehen alle auf, sonst sucht man in einer zugeklappten Liste.
 */
function Gruppenkachel({
  titel,
  anzahl,
  standardOffen,
  gesucht,
  zusatz,
  children,
}: {
  titel: string;
  anzahl: number;
  standardOffen: boolean;
  gesucht: boolean;
  zusatz?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [offen, setOffen] = React.useState(standardOffen);
  const zeigen = offen || gesucht;

  if (anzahl === 0 && gesucht && !zusatz) return null;

  return (
    <div className={cn('min-w-0 rounded-md border bg-card', zeigen && 'flex-1 basis-64')}>
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
        aria-expanded={zeigen}
      >
        {zeigen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        {titel}
        <Badge variant="grau" className="ml-auto">
          {anzahl}
        </Badge>
      </button>
      {zeigen ? (
        <div className="border-t p-1.5">
          <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
            {anzahl === 0 ? (
              <span className="text-2xs text-muted-foreground">Niemand verfügbar.</span>
            ) : (
              children
            )}
          </div>
          {zusatz ? <div className="mt-1">{zusatz}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Einen weiteren Subunternehmer in die Ablageleiste holen.
 *
 * Wer dazugewählt wird, bekommt den Stern – er bleibt also da und muss nicht
 * jedes Mal neu gesucht werden. Genau so wächst die Leiste über ein paar
 * Wochen zu der Handvoll Betriebe zusammen, mit denen tatsächlich gearbeitet
 * wird, statt alle vierunddreißig aus dem ERP zu zeigen.
 */
function SubHinzufuegen({ alle, onFertig }: { alle: ResourceDTO[]; onFertig: () => void }) {
  const [offen, setOffen] = React.useState(false);
  const [suche, setSuche] = React.useState('');
  const [laeuft, setLaeuft] = React.useState<string | null>(null);

  const treffer = alle.filter(
    (r) => !suche || `${r.label} ${r.subtitle ?? ''}`.toLowerCase().includes(suche.toLowerCase()),
  );

  const hinzufuegen = async (r: ResourceDTO) => {
    setLaeuft(r.id);
    try {
      await api.patch(`/api/subcontractors/${r.id}`, { preferred: true });
      onFertig();
      setSuche('');
      setOffen(false);
    } finally {
      setLaeuft(null);
    }
  };

  if (alle.length === 0) return null;

  if (!offen) {
    return (
      <Button variant="ghost" size="xs" className="w-full" onClick={() => setOffen(true)}>
        <Plus /> Subunternehmer hinzufügen ({alle.length})
      </Button>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        autoFocus
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        placeholder="Betrieb oder Gewerk suchen …"
        className="h-7 text-xs"
      />
      <div className="max-h-32 space-y-0.5 overflow-auto">
        {treffer.length === 0 ? (
          <p className="px-1 py-0.5 text-2xs text-muted-foreground">Nichts gefunden.</p>
        ) : (
          treffer.slice(0, 40).map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={laeuft === r.id}
              onClick={() => hinzufuegen(r)}
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-2xs transition hover:bg-accent disabled:opacity-50"
            >
              <Plus className="size-2.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="shrink-0 truncate text-muted-foreground">{r.subtitle}</span>
            </button>
          ))
        )}
      </div>
      <Button variant="ghost" size="xs" className="w-full" onClick={() => setOffen(false)}>
        Schließen
      </Button>
    </div>
  );
}
