'use client';
/** Ansicht A – Zeilen sind Baustellen, Spalten sind Tage. */
import * as React from 'react';
import { MapPin, Plus, Truck, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBoardMasse } from './masse';
import type { AssignmentDTO, BoardResponse, ProjectSummaryDTO } from '@/lib/types';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { type IsoDate } from '@/lib/dates';
import { AmpelDot, AmpelErklaerung } from '@/components/ui/ampel';
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
  // Zeilenhoehe und Spaltenbreiten gehoeren dem Benutzer, nicht uns.
  const { masse, aendern, stil } = useBoardMasse();
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
    // pb-32: Luft unter der letzten Zeile. Ohne sie klebt sie am
    // Fensterrand und man sieht nicht, dass die Liste zu Ende ist.
    <div className="min-h-0 flex-1 overflow-auto pb-32" style={stil}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <BoardHeader
          days={board.days}
          firstColumnLabel="Baustelle"
          masse={masse}
          onMass={aendern}
          dense={dense}
        />
        <tbody>
          {board.projects.map((project) => (
            <tr key={project.id} className="group/row">
              <ProjectRowHeader project={project} onOpen={() => onOpenProject(project.id)} />
              {board.days.map((day) => {
                const items = nachUhrzeit(byProjectDay.get(`${project.id}|${day}`) ?? []);
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

function ProjectRowHeader({ project, onOpen }: { project: ProjectSummaryDTO; onOpen: () => void }) {
  /*
   * Lager und Besorgungsfahrten sind keine Baustellen. Eine Ampel waere
   * dort sinnlos - es gibt keinen Kunden, keinen Termin und nichts, was rot
   * werden koennte. Stattdessen ein Symbol, damit die Zeile auf den ersten
   * Blick als „intern" zu erkennen ist.
   */
  const intern = project.internKey;
  const InternSymbol = intern === 'LAGER' ? Warehouse : Truck;

  return (
    <th
      scope="row"
      className={`board-sticky-col border-b border-r p-0 text-left align-top${
        intern ? ' bg-muted/40' : ''
      }`}
      style={{ width: 'var(--board-spalte)', minWidth: 'var(--board-spalte)' }}
    >
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition hover:bg-accent/60"
      >
        {intern ? (
          <span className="mt-0.5 text-muted-foreground">
            <InternSymbol className="size-3.5" aria-hidden />
          </span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-1">
                <AmpelDot light={project.trafficLight} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" align="start">
              <AmpelErklaerung light={project.trafficLight} reasons={project.trafficLightReasons} />
            </TooltipContent>
          </Tooltip>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-xs font-semibold leading-tight">
              {intern ? project.name : project.customerName}
            </span>
            {project.orderNumber ? (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {project.orderNumber}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-2xs text-muted-foreground">
            {intern
              ? intern === 'LAGER'
                ? 'Interner Arbeitsort'
                : (project.internalNotes ?? 'Was besorgt werden soll – Notiz hinterlegen')
              : `${project.name}${project.city ? ` · ${project.city}` : ''}`}
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

/**
 * Einsätze eines Tages in die Reihenfolge bringen, in der sie stattfinden.
 *
 * Wer vormittags auf der einen und nachmittags auf der anderen Baustelle ist,
 * soll das auch so lesen können. Einsätze ohne Uhrzeit gelten als ganztägig
 * und stehen oben.
 */
function nachUhrzeit(items: AssignmentDTO[]): AssignmentDTO[] {
  const minuten = (zeit: string | null) => {
    if (!zeit) return -1;
    const t = /^(\d{1,2}):(\d{2})/.exec(zeit.trim());
    return t ? Number(t[1]) * 60 + Number(t[2]) : -1;
  };
  return [...items].sort((a, b) => minuten(a.startTime) - minuten(b.startTime));
}
