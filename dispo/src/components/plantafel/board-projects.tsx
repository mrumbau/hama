'use client';
/** Ansicht A – Zeilen sind Baustellen, Spalten sind Tage. */
import * as React from 'react';
import { MapPin, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssignmentDTO, BoardResponse, ProjectSummaryDTO } from '@/lib/types';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { type IsoDate } from '@/lib/dates';
import { AmpelDot } from '@/components/ui/ampel';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/misc';
import { AssignmentChip, type ChipActions } from './assignment-chip';
import { BoardCell } from './board-cell';
import { BoardHeader } from './board-header';

export function BoardProjects({
  board,
  actions,
  onOpenProject,
  onQuickPlan,
}: {
  board: BoardResponse;
  actions: ChipActions;
  onOpenProject: (id: string) => void;
  onQuickPlan: (projectId: string, date: IsoDate) => void;
}) {
  const dense = board.days.length > 16;

  // Einsätze pro Projekt und Tag vorbereiten – einmal, nicht pro Zelle.
  const byProjectDay = React.useMemo(() => {
    const map = new Map<string, AssignmentDTO[]>();
    for (const a of board.assignments) {
      for (const day of board.days) {
        if (day < a.startDate || day > a.endDate) continue;
        const key = `${a.projectId}|${day}`;
        const list = map.get(key);
        if (list) list.push(a);
        else map.set(key, [a]);
      }
    }
    return map;
  }, [board.assignments, board.days]);

  if (board.projects.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="Keine Baustellen in dieser Ansicht"
        description="Passen Sie den Zeitraum oder die Filter an, oder legen Sie ein Projekt an."
        className="m-4"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <BoardHeader
          days={board.days}
          firstColumnLabel="Baustelle"
          firstColumnWidth="w-[11rem] min-w-[11rem] sm:w-[17rem] sm:min-w-[17rem]"
          dense={dense}
        />
        <tbody>
          {board.projects.map((project) => (
            <tr key={project.id} className="group/row">
              <ProjectRowHeader project={project} onOpen={() => onOpenProject(project.id)} />
              {board.days.map((day) => {
                const items = byProjectDay.get(`${project.id}|${day}`) ?? [];
                return (
                  <BoardCell
                    key={day}
                    id={`project:${project.id}:${day}`}
                    date={day}
                    dense={dense}
                    onQuickAdd={() => onQuickPlan(project.id, day)}
                  >
                    {items.map((a) => (
                      <AssignmentChip
                        key={a.id}
                        assignment={a}
                        primaryLabel={dense ? a.resourceShort : a.resourceLabel}
                        secondaryLabel={null}
                        project={project}
                        date={day}
                        compact={dense}
                        // Bauleiter sind ohnehin in der Zeilenüberschrift
                        // sichtbar – hier zurückgenommen, damit Mitarbeiter
                        // und SUBs ins Auge springen.
                        muted={a.resourceType === 'BAULEITER'}
                        conflict={Boolean(board.conflicts[`${a.resourceKey}|${day}`])}
                        actions={actions}
                      />
                    ))}
                  </BoardCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRowHeader({
  project,
  onOpen,
}: {
  project: ProjectSummaryDTO;
  onOpen: () => void;
}) {
  return (
    <th scope="row" className="board-sticky-col border-b border-r p-0 text-left align-top">
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition hover:bg-accent/60"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mt-1">
              <AmpelDot light={project.trafficLight} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" align="start">
            <p className="mb-1 font-semibold">Ampel: {project.trafficLight}</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {project.trafficLightReasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-xs font-semibold leading-tight">
              {project.customerName}
            </span>
            {project.orderNumber ? (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {project.orderNumber}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-2xs text-muted-foreground">
            {project.name}
            {project.city ? ` · ${project.city}` : ''}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            {project.primarySiteManagerName ? (
              <Badge
                variant="outline"
                className="max-w-[9rem]"
                style={
                  project.primarySiteManagerColor
                    ? {
                        borderColor: project.primarySiteManagerColor,
                        color: project.primarySiteManagerColor,
                      }
                    : undefined
                }
              >
                <span className="truncate">{project.primarySiteManagerName}</span>
              </Badge>
            ) : (
              <Badge variant="rot">Kein Bauleiter</Badge>
            )}
            <span
              className={cn(
                'truncate text-2xs',
                project.status === 'IN_AUSFUEHRUNG'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {PROJECT_STATUS_LABEL[project.status]}
            </span>
          </span>
        </span>
      </button>
    </th>
  );
}
