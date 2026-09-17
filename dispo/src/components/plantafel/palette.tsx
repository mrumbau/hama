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
import { ChevronDown, ChevronUp, GripVertical, Search } from 'lucide-react';
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
  { type: 'MITARBEITER', titel: 'Mitarbeiter' },
  { type: 'BAULEITER', titel: 'Bauleiter' },
  { type: 'SUBUNTERNEHMER', titel: 'Subunternehmer' },
] as const;

export function Palette({
  view,
  board,
  belegtAm,
}: {
  view: BoardView;
  board: BoardResponse;
  /** Tag, auf den sich die Verfügbarkeitsanzeige bezieht. */
  belegtAm: IsoDate;
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
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {GRUPPEN.map((gruppe) => {
          const items = board.resources.filter(
            (r) => r.gruppe === gruppe.type && r.active && passt(`${r.label} ${r.subtitle ?? ''}`),
          );
          if (items.length === 0) return null;
          return (
            <div key={gruppe.type} className="min-w-0">
              <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {gruppe.titel}
              </p>
              <div className="flex flex-wrap gap-1">
                {items.map((r) => (
                  <ResourceChip key={r.key} resource={r} belegt={belegt.has(r.key)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="flex flex-wrap gap-1">
        {board.projects
          .filter((p) => passt(`${p.customerName} ${p.name} ${p.orderNumber ?? ''} ${p.city ?? ''}`))
          .map((p) => (
            <ProjectChip key={p.id} project={p} />
          ))}
      </div>
    );

  return (
    <div className="border-b bg-muted/30">
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

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={`${project.customerName} – ${project.name}`}
      className={cn(
        'flex cursor-grab touch-none items-center gap-1 rounded border bg-card px-1.5 py-1 text-2xs shadow-sm transition hover:shadow',
        isDragging && 'opacity-40',
      )}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground" />
      <AmpelDot light={project.trafficLight} className="size-2" />
      <span className="max-w-[12rem] truncate font-medium">{project.customerName}</span>
      {project.orderNumber ? (
        <Badge variant="outline" className="shrink-0">
          {project.orderNumber}
        </Badge>
      ) : null}
    </button>
  );
}
