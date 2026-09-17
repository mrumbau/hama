'use client';
/**
 * Ansicht B – Zeilen sind Ressourcen (Bauleiter, Mitarbeiter, SUBs),
 * Spalten sind Tage. Doppelbelegungen springen hier sofort ins Auge.
 */
import * as React from 'react';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AssignmentDTO, BoardResponse, ResourceDTO } from '@/lib/types';
import { type IsoDate } from '@/lib/dates';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { AssignmentChip, type ChipActions } from './assignment-chip';
import { BoardCell } from './board-cell';
import { BoardHeader } from './board-header';

const GROUP_LABEL = {
  BAULEITER: 'Bauleiter',
  MITARBEITER: 'Eigene Mitarbeiter',
  SUBUNTERNEHMER: 'Subunternehmer',
} as const;

const GROUP_ORDER = ['BAULEITER', 'MITARBEITER', 'SUBUNTERNEHMER'] as const;

export function BoardResources({
  board,
  actions,
  onQuickPlan,
  showInactive,
}: {
  board: BoardResponse;
  actions: ChipActions;
  onQuickPlan: (resource: ResourceDTO, date: IsoDate) => void;
  showInactive: boolean;
}) {
  const dense = board.days.length > 16;

  const byResourceDay = React.useMemo(() => {
    const map = new Map<string, AssignmentDTO[]>();
    for (const a of board.assignments) {
      for (const day of board.days) {
        if (day < a.startDate || day > a.endDate) continue;
        const key = `${a.resourceKey}|${day}`;
        const list = map.get(key);
        if (list) list.push(a);
        else map.set(key, [a]);
      }
    }
    return map;
  }, [board.assignments, board.days]);

  const projectById = React.useMemo(
    () => new Map(board.projects.map((p) => [p.id, p])),
    [board.projects],
  );

  const resources = board.resources.filter((r) => showInactive || r.active);
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: resources.filter((r) => r.gruppe === type),
  })).filter((g) => g.items.length > 0);

  // Unbesetzte Einsätze bekommen eine eigene Sammelzeile – sonst wären sie
  // in der Ressourcenansicht unsichtbar.
  const unbesetzt = board.assignments.filter((a) => a.resourceType === 'UNBESETZT');

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Keine Ressourcen vorhanden"
        description="Legen Sie Mitarbeiter, Bauleiter oder Subunternehmer an."
        className="m-4"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <BoardHeader
          days={board.days}
          firstColumnLabel="Ressource"
          firstColumnWidth="w-[10rem] min-w-[10rem] sm:w-[15rem] sm:min-w-[15rem]"
          dense={dense}
        />
        <tbody>
          {grouped.map((group) => (
            <React.Fragment key={group.type}>
              <tr>
                <th
                  colSpan={board.days.length + 1}
                  className="board-sticky-col border-b bg-muted/60 px-2 py-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {GROUP_LABEL[group.type]} ({group.items.length})
                </th>
              </tr>
              {group.items.map((resource) => (
                <tr key={resource.key}>
                  <ResourceRowHeader resource={resource} />
                  {board.days.map((day) => {
                    const items = byResourceDay.get(`${resource.key}|${day}`) ?? [];
                    const conflict = Boolean(board.conflicts[`${resource.key}|${day}`]);
                    return (
                      <BoardCell
                        key={day}
                        id={`resource:${resource.key}:${day}`}
                        date={day}
                        dense={dense}
                        onQuickAdd={() => onQuickPlan(resource, day)}
                        className={conflict ? 'bg-destructive/10' : undefined}
                      >
                        {items.length === 0 ? (
                          <span className="select-none px-0.5 text-2xs text-muted-foreground/60">
                            frei
                          </span>
                        ) : (
                          items.map((a) => {
                            const project = projectById.get(a.projectId);
                            return (
                              <AssignmentChip
                                key={a.id}
                                assignment={a}
                                primaryLabel={
                                  project
                                    ? dense
                                      ? project.customerName.split(' ').slice(-1)[0]
                                      : project.customerName
                                    : 'Baustelle'
                                }
                                secondaryLabel={project?.city ?? null}
                                project={project}
                                date={day}
                                compact={dense}
                                conflict={conflict}
                                actions={actions}
                              />
                            );
                          })
                        )}
                      </BoardCell>
                    );
                  })}
                </tr>
              ))}
            </React.Fragment>
          ))}

          {unbesetzt.length > 0 ? (
            <>
              <tr>
                <th
                  colSpan={board.days.length + 1}
                  className="board-sticky-col border-b bg-destructive/10 px-2 py-1 text-left text-2xs font-semibold uppercase tracking-wide text-destructive"
                >
                  Unbesetzte Einsätze ({unbesetzt.length})
                </th>
              </tr>
              <tr>
                <th
                  scope="row"
                  className="board-sticky-col border-b border-r px-2 py-1.5 text-left align-top"
                >
                  <span className="text-xs font-medium">Offen</span>
                  <span className="block text-2xs text-muted-foreground">
                    Noch niemand zugewiesen
                  </span>
                </th>
                {board.days.map((day) => {
                  const items = unbesetzt.filter((a) => day >= a.startDate && day <= a.endDate);
                  return (
                    <BoardCell key={day} id={`unassigned:${day}`} date={day} dense={dense}>
                      {items.map((a) => {
                        const project = projectById.get(a.projectId);
                        return (
                          <AssignmentChip
                            key={a.id}
                            assignment={a}
                            primaryLabel={a.placeholderLabel ?? 'Unbesetzt'}
                            secondaryLabel={project?.customerName ?? null}
                            project={project}
                            date={day}
                            compact={dense}
                            actions={actions}
                          />
                        );
                      })}
                    </BoardCell>
                  );
                })}
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ResourceRowHeader({ resource }: { resource: ResourceDTO }) {
  return (
    <th scope="row" className="board-sticky-col border-b border-r px-2 py-1.5 text-left align-top">
      <span className="flex items-start gap-1.5">
        <span
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: resource.color }}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-xs font-medium leading-tight',
              !resource.active && 'text-muted-foreground line-through',
            )}
          >
            {resource.label}
          </span>
          {resource.subtitle ? (
            <span className="block truncate text-2xs text-muted-foreground">
              {resource.subtitle}
            </span>
          ) : null}
        </span>
        {!resource.active ? <Badge variant="grau">inaktiv</Badge> : null}
      </span>
    </th>
  );
}
