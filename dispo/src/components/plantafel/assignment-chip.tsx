'use client';
/** Ein Einsatz als kompakte Karte in einer Plantafel-Zelle. */
import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { AlertTriangle, Check, Clock, ListChecks, MoreVertical, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssignmentDTO, ProjectSummaryDTO } from '@/lib/types';
import { ASSIGNMENT_KIND_LABEL, ASSIGNMENT_KIND_SHORT, ASSIGNMENT_STATUS_LABEL, RESOURCE_TYPE_LABEL, internFarbe, projektZeile } from '@/lib/labels';
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
   * Vorschlag direkt auf der Karte annehmen. Nur gesetzt, wenn der
   * Angemeldete freigeben darf - sonst waere es ein Knopf, der nichts tut.
   */
  onAnnehmen?: (a: AssignmentDTO) => void;
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
  /*
   * Ein Vorschlag ist noch keine Zusage. Er muss sich auf einen Blick von
   * allem anderen unterscheiden - blasser, grau umrandet, mit Wort dran.
   * Wer ihn fuer bare Muenze nimmt, plant an der Wirklichkeit vorbei.
   */
  const vorschlag = assignment.status === 'VORSCHLAG';
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
      /*
       * Die ganze Karte oeffnet den Einsatz, nicht nur die drei Punkte in
       * der Ecke. Die waren mit der Maus kaum zu treffen und lagen genau
       * dort, wo man zum Ziehen hinfasst.
       *
       * Das beisst sich nicht mit dem Schieben: Der Zeiger loest ein Ziehen
       * erst nach fuenf Pixeln Bewegung aus (activationConstraint in der
       * Plantafel). Ein Klick ohne Bewegung ist also eindeutig ein Klick.
       */
      role="button"
      tabIndex={0}
      onClick={() => actions.onEdit(assignment)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          actions.onEdit(assignment);
        }
      }}
      className={cn(
        'group relative w-full cursor-grab touch-none select-none rounded border-l-4 bg-card px-2 py-1.5 text-left shadow-sm ring-1 ring-border/60 transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'hover:shadow-md hover:ring-border',
        isDragging && 'opacity-40',
        abgesagt && 'opacity-50 line-through',
        vorschlag && 'border-dashed border-muted-foreground/60 bg-muted/50 opacity-90',
        vorschlag && actions.onAnnehmen && 'pb-8',
        vorlaeufig && 'border-dashed bg-card/60',
        bestaetigt && 'ring-ampel-gruen/50',
        unbesetzt && 'border-dashed bg-destructive/5',
        muted && 'bg-muted/40 text-muted-foreground',
        conflict && 'ring-2 ring-destructive',
      )}
      /*
       * Bei den festen Zeilen zaehlt ihre Farbe, nicht die der Person:
       * Krank ist rot, Urlaub lila, Lager und Besorgung blau. So sieht man
       * in der Ressourcenansicht auf einen Blick, wer ausfaellt.
       */
      style={{
        borderLeftColor: vorschlag
          ? 'hsl(var(--muted-foreground))'
          : (internFarbe(project?.internKey) ?? assignment.color),
      }}
    >
      {/*
        Nur an der letzten Karte eines Einsatzes: Ein mehrtaegiger Einsatz
        erscheint in mehreren Zellen, aber aufziehen laesst er sich nur an
        seinem Ende. Ein Griff mitten im Zeitraum waere ein Versprechen, das
        die Karte nicht halten kann.
      */}
      {/*
        Auch die Leitung legt Vorschlaege an - damit die Freitagsliste
        vollstaendig bleibt. Der Haken hier macht daraus einen Klick statt
        eines Umwegs ueber die Vorschlagsseite.
      */}
      {vorschlag && actions.onAnnehmen ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            actions.onAnnehmen!(assignment);
          }}
          title="Vorschlag annehmen"
          aria-label="Vorschlag annehmen"
          /*
           * Nicht erst beim Darueberfahren: Wer dreissig Vorschlaege
           * durchgeht, soll den Haken sehen, ohne ihn zu suchen. Und gross
           * genug, um ihn ohne Zielen zu treffen.
           */
          className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-md border border-ampel-gruen/40 bg-ampel-gruen/10 text-ampel-gruen shadow-sm transition hover:bg-ampel-gruen hover:text-white"
        >
          <Check className="size-4" />
        </button>
      ) : null}

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
            'min-w-0 flex-1 truncate font-semibold leading-tight',
            compact ? 'text-xs' : 'text-[0.8125rem]',
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
            className="flex size-5 shrink-0 items-center justify-center rounded bg-ampel-gruen text-xs font-bold leading-none text-white shadow-sm"
            title="Bestätigter Termin – mit dem Kunden abgestimmt"
          >
            T
          </span>
        ) : null}
        {vorschlag ? (
          <span
            className="shrink-0 rounded border border-dashed border-muted-foreground/70 bg-background/80 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-muted-foreground"
            title={
              assignment.angelegtVonName
                ? `Vorschlag von ${assignment.angelegtVonName} – die Leitung gibt ihn frei`
                : 'Vorschlag – die Leitung gibt ihn frei'
            }
          >
            Vorschlag{assignment.angelegtVon ? ` ${assignment.angelegtVon}` : ''}
          </span>
        ) : null}
        {vorlaeufig && !vorschlag ? (
          <span
            className="shrink-0 text-[0.6875rem] font-semibold text-muted-foreground"
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
        title="Einsatz bearbeiten – geht auch mit einem Klick auf die Karte"
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
