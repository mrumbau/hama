'use client';
/**
 * Die Plantafel – Startseite der Anwendung.
 *
 * Bündelt Ansicht A (Baustellen), Ansicht B (Ressourcen), Drag & Drop mit
 * Undo, Schnellplanung und das Projekt-Sidepanel.
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Loader2, Plus, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { AssignmentDTO, ResourceDTO } from '@/lib/types';
import { type IsoDate } from '@/lib/dates';
import { verschobenerBeginn } from '@/lib/board-range';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/misc';
import { CHANGE_REASON_KEYS, CHANGE_REASON_LABEL } from '@/lib/labels';
import { ProjectPanel } from '@/components/project/project-panel';
import { MorningDialog } from '@/components/morning-dialog';
import { BoardProjects } from './board-projects';
import { BoardResources } from './board-resources';
import { BoardToolbar } from './toolbar';
import { KpiHeader } from './kpi-header';
import { QuickPlanDialog, type QuickPlanSeed } from './quick-plan-dialog';
import { AssignmentDialog } from './assignment-dialog';
import { useBoardQuery, useBoardState } from './use-board';
import { Palette, type PaletteItem } from './palette';
import type { ChipActions } from './assignment-chip';

interface PendingMove {
  assignment: AssignmentDTO;
  startDate: IsoDate;
  projectId?: string;
  message: string;
}

export function Plantafel() {
  const state = useBoardState();
  const { data: board, isLoading, isFetching, error } = useBoardQuery(state.queryString);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();

  const [dragging, setDragging] = React.useState<AssignmentDTO | null>(null);
  const [draggingPalette, setDraggingPalette] = React.useState<PaletteItem | null>(null);
  const [quickPlan, setQuickPlan] = React.useState<QuickPlanSeed | null>(null);
  const [editing, setEditing] = React.useState<AssignmentDTO | null>(null);
  const [showInactive, setShowInactive] = React.useState(false);
  const [morning, setMorning] = React.useState(false);
  const [conflictMove, setConflictMove] = React.useState<{
    pending: PendingMove;
    message: string;
  } | null>(null);
  const [notePrompt, setNotePrompt] = React.useState<AssignmentDTO | null>(null);
  const [conflictCreate, setConflictCreate] = React.useState<{
    body: Record<string, unknown>;
    message: string;
    label: string;
  } | null>(null);

  const openProjectId = params.get('projekt');

  const sensors = useSensors(
    // Kleine Bewegung nötig, damit Klicks und Kontextmenü weiter funktionieren.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const refresh = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['warnings'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  }, [queryClient]);

  const openProject = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set('projekt', id);
      else next.delete('projekt');
      router.replace(`/plantafel?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  /** Führt den Move aus und bietet danach Undo an. */
  const performMove = React.useCallback(
    async (
      move: PendingMove,
      options: { force?: boolean; reason?: string; reasonText?: string; silent?: boolean } = {},
    ) => {
      try {
        const res = await api.post<{
          message: string;
          previous: { startDate: IsoDate; endDate: IsoDate; projectId: string };
        }>(`/api/assignments/${move.assignment.id}/move`, {
          startDate: move.startDate,
          projectId: move.projectId,
          force: options.force,
          reason: options.reason,
          reasonText: options.reasonText,
        });

        refresh();

        if (!options.silent) {
          toast({
            title: res.message,
            tone: 'success',
            undo: async () => {
              await api.post(`/api/assignments/${move.assignment.id}/move`, {
                startDate: res.previous.startDate,
                projectId: res.previous.projectId,
                force: true,
                reasonText: 'Verschieben rückgängig gemacht.',
              });
              refresh();
              toast({ title: 'Verschieben wurde rückgängig gemacht.', tone: 'info' });
            },
          });
        }
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unbekannter Fehler.';
        if (message.includes('bereits auf Baustelle')) {
          setConflictMove({ pending: move, message });
        } else {
          toast({ title: 'Verschieben nicht möglich', description: message, tone: 'error' });
        }
        return false;
      }
    },
    [refresh, toast],
  );

  /**
   * Legt einen Einsatz an, der aus der Ablageleiste gezogen wurde.
   * Bei einer Doppelbelegung antwortet der Server mit 409 – dann fragen wir
   * nach, statt stillschweigend zu speichern oder abzubrechen.
   */
  const createFromPalette = React.useCallback(
    async (body: Record<string, unknown>, label: string) => {
      try {
        const res = await api.post<{ message: string }>('/api/assignments', body);
        refresh();
        toast({ title: res.message, tone: 'success' });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unbekannter Fehler.';
        if (message.includes('bereits auf Baustelle')) {
          setConflictCreate({ body, message, label });
        } else {
          toast({ title: 'Einplanen nicht möglich', description: message, tone: 'error' });
        }
      }
    },
    [refresh, toast],
  );

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    setDragging((data?.assignment as AssignmentDTO) ?? null);
    setDraggingPalette((data?.paletteItem as PaletteItem) ?? null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setDragging(null);
    setDraggingPalette(null);

    const overId = event.over?.id;
    if (!overId || typeof overId !== 'string') return;
    const teile = overId.split(':');
    const zielTag = teile[teile.length - 1] as IsoDate;

    // --- Neuer Einsatz aus der Ablageleiste ---
    const palette = event.active.data.current?.paletteItem as PaletteItem | undefined;
    if (palette) {
      if (palette.art === 'ressource') {
        // Eine Ressource gehört auf eine Baustelle – also in eine Projektzeile.
        if (teile[0] !== 'project') {
          toast({
            title: 'Bitte auf eine Baustellenzeile ziehen',
            description: 'In der Ressourcenansicht ziehen Sie stattdessen Baustellen hinein.',
            tone: 'warning',
          });
          return;
        }
        const r = palette.resource;
        await createFromPalette(
          {
            projectId: teile[1],
            resourceType: r.type,
            employeeId: r.type === 'MITARBEITER' ? r.id : null,
            siteManagerId: r.type === 'BAULEITER' ? r.id : null,
            subcontractorId: r.type === 'SUBUNTERNEHMER' ? r.id : null,
            startDate: zielTag,
            endDate: zielTag,
            kind: r.type === 'BAULEITER' ? 'BESICHTIGUNG' : 'ARBEIT',
          },
          r.label,
        );
      } else {
        // Eine Baustelle gehört zu einer Ressource – also in eine Ressourcenzeile.
        if (teile[0] !== 'resource') {
          toast({
            title: 'Bitte auf eine Ressourcenzeile ziehen',
            description: 'In der Baustellenansicht ziehen Sie stattdessen Personal hinein.',
            tone: 'warning',
          });
          return;
        }
        const art = teile[1];
        const id = teile[2];
        await createFromPalette(
          {
            projectId: palette.project.id,
            resourceType: art,
            employeeId: art === 'MITARBEITER' ? id : null,
            siteManagerId: art === 'BAULEITER' ? id : null,
            subcontractorId: art === 'SUBUNTERNEHMER' ? id : null,
            startDate: zielTag,
            endDate: zielTag,
            kind: art === 'BAULEITER' ? 'BESICHTIGUNG' : 'ARBEIT',
          },
          `${palette.project.customerName} – ${palette.project.name}`,
        );
      }
      return;
    }

    const assignment = event.active.data.current?.assignment as AssignmentDTO | undefined;
    if (!assignment) return;

    // Drop-Ziele: project:<projectId>:<date> | resource:<type>:<id>:<date> | unassigned:<date>
    const parts = teile;
    const kind = parts[0];

    /*
      Ein mehrtägiger Einsatz erscheint in jeder Tageszelle, die er belegt.
      Der Zieltag ist deshalb nicht automatisch der neue Beginn: Wer den
      Mittwoch einer Mo–Fr-Baustelle anfasst und auf Donnerstag zieht, will
      sie um EINEN Tag verschieben – nicht ihren Beginn auf Donnerstag legen
      und damit den ganzen Block um zwei Tage nach hinten werfen.

      Verschoben wird also um die Differenz zwischen angefasstem und
      abgelegtem Tag. Die Dauer bleibt erhalten (der Server rechnet das Ende
      mit), und bei einem eintägigen Einsatz ist das Ergebnis dasselbe wie
      vorher.
    */
    const angefasst = (event.active.data.current?.fromDate as IsoDate | undefined) ?? null;
    const date = verschobenerBeginn(assignment.startDate, angefasst, zielTag);

    if (kind === 'project') {
      const projectId = parts[1];
      if (projectId === assignment.projectId && date === assignment.startDate) return;
      await performMove({
        assignment,
        startDate: date,
        projectId: projectId !== assignment.projectId ? projectId : undefined,
        message: '',
      });
      return;
    }

    if (kind === 'resource') {
      const resourceType = parts[1];
      const resourceId = parts[2];
      const sameResource = assignment.resourceKey === `${resourceType}:${resourceId}`;

      if (sameResource) {
        if (date === assignment.startDate) return;
        await performMove({ assignment, startDate: date, message: '' });
        return;
      }

      // Auf eine andere Ressourcenzeile gezogen = Einsatz umbesetzen.
      try {
        const res = await api.patch<{ message: string }>(`/api/assignments/${assignment.id}`, {
          startDate: date,
          resourceType,
          employeeId: resourceType === 'MITARBEITER' ? resourceId : null,
          siteManagerId: resourceType === 'BAULEITER' ? resourceId : null,
          subcontractorId: resourceType === 'SUBUNTERNEHMER' ? resourceId : null,
          placeholderLabel: null,
        });
        refresh();
        toast({
          title: res.message,
          description: `Einsatz von ${assignment.resourceLabel} übernommen.`,
          tone: 'success',
        });
      } catch (e) {
        toast({
          title: 'Umbesetzen nicht möglich',
          description: e instanceof Error ? e.message : '',
          tone: 'error',
        });
      }
    }
  };

  const actions: ChipActions = React.useMemo(
    () => ({
      onEdit: setEditing,
      onConfirm: async (a) => {
        try {
          const res = await api.patch<{ message: string }>(`/api/assignments/${a.id}`, {
            status: 'BESTAETIGT',
            force: true,
          });
          refresh();
          toast({ title: res.message, tone: 'success' });
        } catch (e) {
          toast({ title: e instanceof Error ? e.message : 'Fehler', tone: 'error' });
        }
      },
      onAddNote: setNotePrompt,
      onDelete: async (a) => {
        try {
          const res = await api.delete<{ message: string }>(`/api/assignments/${a.id}`);
          refresh();
          toast({ title: res.message, tone: 'info' });
        } catch (e) {
          toast({ title: e instanceof Error ? e.message : 'Fehler', tone: 'error' });
        }
      },
      onOpenProject: openProject,
      onHistory: (id) => {
        const next = new URLSearchParams(params.toString());
        next.set('projekt', id);
        next.set('tab', 'aenderungen');
        router.replace(`/plantafel?${next.toString()}`, { scroll: false });
      },
      onAddResource: (projectId, date) => setQuickPlan({ projectId, date }),
      onReportProblem: (id) => {
        const next = new URLSearchParams(params.toString());
        next.set('projekt', id);
        next.set('tab', 'notizen');
        router.replace(`/plantafel?${next.toString()}`, { scroll: false });
      },
    }),
    [openProject, params, refresh, router, toast],
  );

  return (
    <div className="flex h-full flex-col">
      {board ? <KpiHeader kpis={board.kpis} /> : <div className="h-[4.5rem]" />}

      <BoardToolbar
        view={state.view}
        range={state.range}
        anchor={state.anchor}
        from={state.from}
        to={state.to}
        filters={state.filters}
        board={board}
        onView={state.setView}
        onRange={state.setRange}
        onShift={state.shift}
        onToday={state.goToday}
        onAnchor={(d) => state.setParams({ datum: d })}
        onFilters={state.setFilters}
        onResetFilters={state.resetFilters}
        showInactive={showInactive}
        onShowInactive={setShowInactive}
        onMorgenansicht={() => setMorning(true)}
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Plantafel wird geladen …
        </div>
      ) : error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Plantafel konnte nicht geladen werden"
          description={error instanceof Error ? error.message : undefined}
          className="m-4"
          action={
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              Erneut versuchen
            </Button>
          }
        />
      ) : board ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <Palette
            view={state.view}
            board={board}
            belegtAm={state.anchor}
            onAktualisieren={refresh}
          />

          {state.view === 'baustellen' ? (
            <BoardProjects
              board={board}
              actions={actions}
              onOpenProject={openProject}
              onQuickPlan={(projectId, date) => setQuickPlan({ projectId, date })}
            />
          ) : (
            <BoardResources
              board={board}
              actions={actions}
              showInactive={showInactive}
              onQuickPlan={(resource: ResourceDTO, date) =>
                setQuickPlan({
                  date,
                  resourceType: resource.type as QuickPlanSeed['resourceType'],
                  employeeId: resource.type === 'MITARBEITER' ? resource.id : undefined,
                  siteManagerId: resource.type === 'BAULEITER' ? resource.id : undefined,
                  subcontractorId: resource.type === 'SUBUNTERNEHMER' ? resource.id : undefined,
                })
              }
            />
          )}

          <DragOverlay dropAnimation={null}>
            {dragging ? (
              <div
                className="rounded border-l-[3px] bg-card px-1.5 py-1 text-xs font-medium shadow-lg ring-1 ring-border"
                style={{ borderLeftColor: dragging.color }}
              >
                {dragging.resourceLabel}
              </div>
            ) : draggingPalette ? (
              <div className="rounded border-l-[3px] border-l-primary bg-card px-1.5 py-1 text-xs font-medium shadow-lg ring-1 ring-border">
                {draggingPalette.art === 'ressource'
                  ? draggingPalette.resource.label
                  : `${draggingPalette.project.customerName} – ${draggingPalette.project.name}`}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}

      {/* Schnellplanung immer erreichbar */}
      <Button
        className="fixed bottom-5 right-5 z-30 shadow-lg"
        size="lg"
        onClick={() => setQuickPlan({ date: state.anchor })}
      >
        <Plus /> Einplanen
      </Button>

      {isFetching && !isLoading ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-card px-3 py-1 text-2xs text-muted-foreground shadow">
          Aktualisiere …
        </div>
      ) : null}

      <QuickPlanDialog
        seed={quickPlan}
        projects={board?.projects ?? []}
        onClose={() => setQuickPlan(null)}
        onDone={refresh}
      />

      <AssignmentDialog
        assignment={editing}
        projects={board?.projects ?? []}
        onClose={() => setEditing(null)}
      />

      <ConflictMoveDialog
        conflict={conflictMove}
        onCancel={() => setConflictMove(null)}
        onConfirm={async (reason, reasonText) => {
          if (!conflictMove) return;
          await performMove(conflictMove.pending, { force: true, reason, reasonText });
          setConflictMove(null);
        }}
      />

      <Dialog open={!!conflictCreate} onOpenChange={(o) => !o && setConflictCreate(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-ampel-gelb" /> Terminüberschneidung
          </DialogTitle>
          <DialogDescription>{conflictCreate?.message}</DialogDescription>
          <p className="mt-3 text-xs text-muted-foreground">
            Bei Subunternehmern ist das oft in Ordnung – sie haben mehrere Kolonnen. Bei eigenen
            Mitarbeitern sollten Sie zweimal hinsehen.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConflictCreate(null)}>
              Abbrechen
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!conflictCreate) return;
                const { body, label } = conflictCreate;
                setConflictCreate(null);
                await createFromPalette({ ...body, force: true }, label);
              }}
            >
              Trotzdem einplanen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NoteDialog assignment={notePrompt} onClose={() => setNotePrompt(null)} onSaved={refresh} />

      <MorningDialog open={morning} onOpenChange={setMorning} />

      {openProjectId ? (
        <ProjectPanel projectId={openProjectId} onClose={() => openProject(null)} />
      ) : null}
    </div>
  );
}

/** Doppelbelegung beim Verschieben: erlaubt, aber bestätigungspflichtig. */
function ConflictMoveDialog({
  conflict,
  onCancel,
  onConfirm,
}: {
  conflict: { pending: PendingMove; message: string } | null;
  onCancel: () => void;
  onConfirm: (reason: string, reasonText: string) => void;
}) {
  const [reason, setReason] = React.useState('MR_UMBAU');
  const [reasonText, setReasonText] = React.useState('');

  React.useEffect(() => {
    if (conflict) {
      setReason('MR_UMBAU');
      setReasonText('');
    }
  }, [conflict]);

  if (!conflict) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-ampel-gelb" /> Terminüberschneidung
        </DialogTitle>
        <DialogDescription>{conflict.message}</DialogDescription>

        <div className="mt-4 space-y-3">
          <Field label="Grund der Verschiebung">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {CHANGE_REASON_KEYS.map((r) => (
                <option key={r} value={r}>
                  {CHANGE_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notiz (optional)">
            <Textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button variant="secondary" onClick={() => onConfirm(reason, reasonText)}>
              Trotzdem einplanen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: AssignmentDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setNote(assignment?.note ?? ''), [assignment]);

  if (!assignment) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Notiz zum Einsatz</DialogTitle>
        <DialogDescription>{assignment.resourceLabel}</DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.patch(`/api/assignments/${assignment.id}`, {
                note: note || null,
                force: true,
              });
              onSaved();
              toast({ title: 'Notiz gespeichert.', tone: 'success' });
              onClose();
            } catch (err) {
              toast({ title: err instanceof Error ? err.message : 'Fehler', tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Textarea rows={4} value={note} autoFocus onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              Speichern
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
