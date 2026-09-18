'use client';
/** Ein Einsatz als kompakte Karte in einer Plantafel-Zelle. */
import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, Clock, ListChecks, MoreVertical, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssignmentDTO, ProjectSummaryDTO } from '@/lib/types';
import { ASSIGNMENT_KIND_LABEL, ASSIGNMENT_KIND_SHORT, ASSIGNMENT_STATUS_LABEL, RESOURCE_TYPE_LABEL, projektZeile } from '@/lib/labels';
import { formatDateShort, type IsoDate } from '@/lib/dates';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VerlaengernGriff } from './verlaengern';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

export interface ChipActions {
  /**
   * Einsatz bis zu diesem Tag aufziehen. Getrennt vom Verschieben, weil es
   * eine andere Absicht ist: „derselbe Mann, laenger" statt „woanders hin".
   */
  onVerlaengern: (a: AssignmentDTO, bisDatum: IsoDate) => void;
  onEdit: (a: AssignmentDTO) => void;
  onConfirm: (a: AssignmentDTO) => void;
  onAddNote: (a: AssignmentDTO) => void;
  onDelete: (a: AssignmentDTO) => void;
  onOpenProject: (projectId: string) => void;
  onHistory: (projectId: string) => void;
  onAddResource: (projectId: string, date: IsoDate) => void;
  onReportProblem: (projectId: string) => void;
}

interface Props {
  assignment: AssignmentDTO;
  /** Was steht auf dem Chip? In der Baustellenansicht die Ressource,
   *  in der Ressourcenansicht die Baustelle. */
  primaryLabel: string;
  secondaryLabel?: string | null;
  project?: ProjectSummaryDTO;
  date: IsoDate;
  conflict?: boolean;
  compact?: boolean;
  /** Optisch zurückgenommen (z. B. Bauleiter in der Baustellenansicht). */
  muted?: boolean;
  actions: ChipActions;
}

export function AssignmentChip({
  assignment,
  primaryLabel,
  secondaryLabel,
  project,
  date,
  conflict,
  compact,
  muted,
  actions,
}: Props) {
  // Ein mehrtägiger Einsatz erscheint in mehreren Tageszellen. Jede dieser
  // Karten braucht eine EIGENE Drag-ID – bei doppelten IDs verwechselt
  // dnd-kit die Elemente und ein Drop landet im Leeren.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${assignment.id}@${date}`,
    data: { assignment, fromDate: date },
  });

  const abgesagt = assignment.status === 'ABGESAGT';
  const unbesetzt = assignment.resourceType === 'UNBESETZT';
  // „Geplant" heisst bei MR Umbau: kurzfristig hingeschrieben, noch nicht
  // mit dem Kunden abgestimmt. Das muss man sehen, ohne hinzuklicken –
  // deshalb gestrichelt und blasser. „Bestätigt" ist der feste Termin.
  const vorlaeufig = assignment.status === 'GEPLANT' && !unbesetzt;
  const bestaetigt = assignment.status === 'BESTAETIGT';

  const chip = (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-dnd-dragging={isDragging}
      className={cn(
        'group relative w-full cursor-grab touch-none select-none rounded border-l-[3px] bg-card px-1.5 py-1 text-left shadow-sm ring-1 ring-border/60 transition',
        'hover:shadow-md hover:ring-border',
        isDragging && 'opacity-40',
        abgesagt && 'opacity-50 line-through',
        vorlaeufig && 'border-dashed bg-card/60',
        bestaetigt && 'ring-ampel-gruen/50',
        unbesetzt && 'border-dashed bg-destructive/5',
        muted && 'bg-muted/40 text-muted-foreground',
        conflict && 'ring-2 ring-destructive',
      )}
      style={{ borderLeftColor: assignment.color }}
    >
      {/*
        Nur an der letzten Karte eines Einsatzes: Ein mehrtaegiger Einsatz
        erscheint in mehreren Zellen, aber aufziehen laesst er sich nur an
        seinem Ende. Ein Griff mitten im Zeitraum waere ein Versprechen, das
        die Karte nicht halten kann.
      */}
      {!abgesagt && date === assignment.endDate ? (
        <VerlaengernGriff
          vonDatum={assignment.startDate}
          bisDatum={assignment.endDate}
          compact={compact}
          onFertig={(bis) => actions.onVerlaengern(assignment, bis)}
        />
      ) : null}

      <div className="flex items-center gap-1">
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium leading-tight',
            compact ? 'text-2xs' : 'text-xs',
          )}
        >
          {primaryLabel}
        </span>
        {assignment.tasks.length > 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground"
            title={`${assignment.tasks.length} Tätigkeit(en)`}
          >
            <ListChecks className="size-3" />
            {assignment.tasks.length}
          </span>
        ) : null}
        {conflict ? <AlertTriangle className="size-3 shrink-0 text-destructive" /> : null}
        {assignment.note ? <StickyNote className="size-3 shrink-0 text-muted-foreground" /> : null}
        {/*
          Das „T“ steht für Termin: bestätigt, mit dem Kunden abgestimmt,
          steht fest. Ein Buchstabe liest sich über die ganze Tafel hinweg
          schneller als ein Punkt, den man erst deuten muss.
        */}
        {bestaetigt ? (
          <span
            className="flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-ampel-gruen text-[9px] font-bold leading-none text-white"
            title="Bestätigter Termin"
          >
            T
          </span>
        ) : null}
        {vorlaeufig ? (
          <span
            className="shrink-0 text-2xs font-medium text-muted-foreground"
            title="Nur geplant – noch nicht bestätigt"
          >
            vorl.
          </span>
        ) : null}
      </div>
      {assignment.kind !== 'ARBEIT' ? (
        <span className="block truncate text-2xs font-medium text-primary">
          {ASSIGNMENT_KIND_SHORT[assignment.kind]}
        </span>
      ) : null}
      {secondaryLabel && !compact ? (
        <span className="block truncate text-2xs text-muted-foreground">{secondaryLabel}</span>
      ) : null}
      {assignment.startTime && !compact ? (
        <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
          <Clock className="size-2.5" />
          {assignment.startTime}
          {assignment.endTime ? `–${assignment.endTime}` : ''}
        </span>
      ) : null}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          actions.onEdit(assignment);
        }}
        className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-accent group-hover:block"
        aria-label="Einsatz bearbeiten"
      >
        <MoreVertical className="size-3" />
      </button>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>{chip}</TooltipTrigger>
            <TooltipContent side="top" align="start">
              <ChipTooltip assignment={assignment} project={project} conflict={conflict} />
            </TooltipContent>
          </Tooltip>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{assignment.resourceLabel}</ContextMenuLabel>
        <ContextMenuItem onSelect={() => actions.onEdit(assignment)}>Bearbeiten</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onEdit(assignment)}>Verschieben …</ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onAddResource(assignment.projectId, date)}>
          Mitarbeiter / SUB hinzufügen
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onAddNote(assignment)}>
          Notiz hinzufügen
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => actions.onConfirm(assignment)}
          disabled={assignment.status === 'BESTAETIGT'}
        >
          Als bestätigt markieren
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onOpenProject(assignment.projectId)}>
          Projekt öffnen
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onHistory(assignment.projectId)}>
          Historie anzeigen
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onReportProblem(assignment.projectId)}>
          Problem melden
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={() => actions.onDelete(assignment)}>
          Einsatz entfernen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ChipTooltip({
  assignment,
  project,
  conflict,
}: {
  assignment: AssignmentDTO;
  project?: ProjectSummaryDTO;
  conflict?: boolean;
}) {
  return (
    <div className="space-y-1">
      {project ? (
        <>
          <p className="font-semibold">
            {projektZeile(project)}
          </p>
          <p className="text-muted-foreground">
            {[project.street, [project.zip, project.city].filter(Boolean).join(' ')]
              .filter(Boolean)
              .join(', ') || 'Keine Adresse hinterlegt'}
          </p>
          {project.primarySiteManagerName ? (
            <p>
              <span className="text-muted-foreground">Bauleiter: </span>
              {project.primarySiteManagerName}
            </p>
          ) : null}
        </>
      ) : null}
      <p>
        <span className="text-muted-foreground">
          {RESOURCE_TYPE_LABEL[assignment.resourceType]}:{' '}
        </span>
        {assignment.resourceLabel}
      </p>
      <p>
        <span className="text-muted-foreground">Zeitraum: </span>
        {formatDateShort(assignment.startDate)}
        {assignment.endDate !== assignment.startDate
          ? ` – ${formatDateShort(assignment.endDate)}`
          : ''}
        {assignment.startTime
          ? ` · ${assignment.startTime}${assignment.endTime ? `–${assignment.endTime}` : ''}`
          : ''}
      </p>
      <p>
        <span className="text-muted-foreground">Art: </span>
        {ASSIGNMENT_KIND_LABEL[assignment.kind]}
      </p>
      <p>
        <span className="text-muted-foreground">Status: </span>
        {ASSIGNMENT_STATUS_LABEL[assignment.status]}
      </p>
      {assignment.tasks.length > 0 ? (
        <div className="border-t pt-1">
          <p className="font-medium">Tätigkeiten</p>
          <ul className="text-muted-foreground">
            {assignment.tasks.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {assignment.note ? (
        <p className="border-t pt-1 text-muted-foreground">{assignment.note}</p>
      ) : null}
      {conflict ? (
        <p className="border-t pt-1 font-medium text-destructive">
          Achtung: Doppelbelegung an diesem Tag.
        </p>
      ) : null}
      {project && project.trafficLightReasons.length > 0 ? (
        <ul className="border-t pt-1 text-muted-foreground">
          {project.trafficLightReasons.slice(0, 3).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
