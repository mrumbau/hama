'use client';
/**
 * Ansicht B – Zeilen sind Ressourcen (Bauleiter, Mitarbeiter, SUBs),
 * Spalten sind Tage. Doppelbelegungen springen hier sofort ins Auge.
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, Plus, Users, X } from 'lucide-react';
import { projektTitel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { useBoardMasse } from './masse';
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
  onSubAufTafel,
  onSubVonTafel,
}: {
  board: BoardResponse;
  actions: ChipActions;
  onQuickPlan: (resource: ResourceDTO, date: IsoDate) => void;
  showInactive: boolean;
  /** Subunternehmer auf die Tafel holen bzw. wieder herunternehmen. */
  onSubAufTafel: (subcontractorId: string) => void;
  onSubVonTafel: (resource: ResourceDTO) => void;
}) {
  // Zeilenhoehe und Spaltenbreiten gehoeren dem Benutzer, nicht uns.
  const { masse, aendern, stil } = useBoardMasse();
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

  // Zugeklappte Gruppen merken wir uns nur fuer diese Sitzung – das ist eine
  // Arbeitshaltung, keine Einstellung, die in die URL gehoert.
  //
  // Bauleiter starten zu: sie betreuen mehrere Baustellen gleichzeitig und
  // werden selten am Tag verschoben. Wer sie braucht, klappt sie auf.
  const [zugeklappt, setZugeklappt] = React.useState<string[]>(['BAULEITER']);
  const umschalten = (type: string) =>
    setZugeklappt((v) => (v.includes(type) ? v.filter((x) => x !== type) : [...v, type]));

  // Subunternehmer, die an diesen Tagen tatsächlich arbeiten, gehören auf
  // die Tafel – auch ohne Stern. Sonst verschwände eine eingeplante Firma
  // aus der Übersicht, und genau die will man sehen.
  const verplanteSubs = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of board.assignments) {
      if (a.status !== 'ABGESAGT' && a.subcontractorId)
        set.add(`SUBUNTERNEHMER:${a.subcontractorId}`);
    }
    return set;
  }, [board.assignments]);

  const resources = board.resources
    .filter((r) => showInactive || r.active)
    // Von 34 Subunternehmern arbeitet man mit einer Handvoll. Gezeigt werden
    // die mit Stern; der Rest kommt über „Subunternehmer hinzufügen" dazu.
    .filter((r) => r.gruppe !== 'SUBUNTERNEHMER' || r.bevorzugt || verplanteSubs.has(r.key));

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
    // pb-32: Luft unter der letzten Zeile. Ohne sie klebt sie am
    // Fensterrand und man sieht nicht, dass die Liste zu Ende ist.
    <div className="min-h-0 flex-1 overflow-auto pb-32" style={stil}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <BoardHeader
          days={board.days}
          firstColumnLabel="Ressource"
          masse={masse}
          onMass={aendern}
          dense={dense}
        />
        <tbody>
          {grouped.map((group) => (
            <React.Fragment key={group.type}>
              <tr>
                <th
                  colSpan={board.days.length + 1}
                  className="board-sticky-col border-b bg-muted/60 p-0 text-left"
                >
                  {/*
                    Die Gruppe laesst sich zuklappen. Wer gerade nur die
                    eigenen Leute verteilt, braucht dreissig
                    Subunternehmerzeilen nicht im Weg.
                  */}
                  <button
                    type="button"
                    onClick={() => umschalten(group.type)}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
                    aria-expanded={!zugeklappt.includes(group.type)}
                  >
                    {zugeklappt.includes(group.type) ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    {GROUP_LABEL[group.type]} ({group.items.length})
                  </button>
                </th>
              </tr>
              {(zugeklappt.includes(group.type) ? [] : group.items).map((resource) => (
                <tr key={resource.key}>
                  <ResourceRowHeader
                    resource={resource}
                    verplant={verplanteSubs.has(resource.key)}
                    onVonTafel={
                      resource.gruppe === 'SUBUNTERNEHMER' ? onSubVonTafel : undefined
                    }
                  />
                  {board.days.map((day) => {
                    const items = nachUhrzeit(byResourceDay.get(`${resource.key}|${day}`) ?? []);
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
                                      ? projektTitel(project).split(' ').slice(-1)[0]
                                      : projektTitel(project)
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

              {/*
                Von dreissig Subunternehmern arbeitet man mit einer Handvoll.
                Statt vorher ueberall Sterne zu setzen, stellt man sich die
                Tafel hier zusammen - und nimmt mit dem x wieder herunter,
                was man nicht braucht.
              */}
              {group.type === 'SUBUNTERNEHMER' && !zugeklappt.includes(group.type) ? (
                <tr>
                  <th
                    scope="row"
                    className="board-sticky-col border-b border-r px-2 py-1 text-left align-top"
                    style={{ width: 'var(--board-spalte)', minWidth: 'var(--board-spalte)' }}
                  >
                    <SubHinzufuegen
                      vorhanden={board.resources}
                      aufTafel={new Set(resources.map((r) => r.key))}
                      onWaehlen={onSubAufTafel}
                    />
                  </th>
                  <td className="border-b" colSpan={board.days.length} />
                </tr>
              ) : null}
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
                  style={{ width: 'var(--board-spalte)', minWidth: 'var(--board-spalte)' }}
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

function ResourceRowHeader({
  resource,
  onVonTafel,
  verplant,
}: {
  resource: ResourceDTO;
  /** Nur bei Subunternehmern gesetzt: von der Tafel nehmen. */
  onVonTafel?: (resource: ResourceDTO) => void;
  /** Steht schon ein Einsatz drin? Dann nicht ausblenden. */
  verplant?: boolean;
}) {
  return (
    <th
      scope="row"
      className="board-sticky-col group/res border-b border-r px-2 py-1.5 text-left align-top"
      style={{ width: 'var(--board-spalte)', minWidth: 'var(--board-spalte)' }}
    >
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
        {/*
          Subunternehmer wieder von der Tafel nehmen. Wer schon eingeplant
          ist, bleibt - ihn auszublenden hiesse, einen bestehenden Einsatz
          unsichtbar zu machen.
        */}
        {onVonTafel && !verplant ? (
          <button
            type="button"
            aria-label={`${resource.label} von der Plantafel nehmen`}
            title="Von der Plantafel nehmen"
            onClick={() => onVonTafel(resource)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover/res:opacity-100"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </span>
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

/**
 * „Subunternehmer hinzufügen" – ein Auswahlfeld unter der Gruppe.
 *
 * Bewusst am Ende der Liste und nicht als Knopf in der Kopfzeile: Dort
 * sucht man ihn, wenn einem beim Planen auffällt, dass ein Betrieb fehlt.
 */
function SubHinzufuegen({
  vorhanden,
  aufTafel,
  onWaehlen,
}: {
  vorhanden: ResourceDTO[];
  aufTafel: Set<string>;
  onWaehlen: (subcontractorId: string) => void;
}) {
  const offen = vorhanden
    .filter((r) => r.gruppe === 'SUBUNTERNEHMER' && r.active && !aufTafel.has(r.key))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

  if (offen.length === 0) {
    return <span className="text-2xs text-muted-foreground">Alle Betriebe stehen auf der Tafel.</span>;
  }

  return (
    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      <Plus className="size-3 shrink-0" aria-hidden />
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onWaehlen(e.target.value);
          e.target.value = '';
        }}
        className="min-w-0 flex-1 rounded border border-dashed bg-transparent px-1 py-0.5 text-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Subunternehmer hinzufügen …</option>
        {offen.map((r) => (
          <option key={r.key} value={r.id}>
            {r.label}
            {r.subtitle ? ` · ${r.subtitle}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
