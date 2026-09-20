'use client';
/**
 * Schnelle Planung (Master-Prompt Abschnitt 37):
 * Projekt → Ressource → Datum → Speichern. Ziel: unter 15 Sekunden.
 */
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useEmployees, useSiteManagers, useSubcontractors } from '@/lib/queries';
import { addDays, type IsoDate } from '@/lib/dates';
import {
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_KEYS,
  ASSIGNMENT_STATUS_LABEL,
  KIND_SUGGESTIONS,
  type AssignmentKindKey,
} from '@/lib/labels';
import type { ProjectSummaryDTO } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { SubAnlegenDialog } from '@/components/sub-dialog';
import { TaskListInput } from '@/components/ui/task-list-input';

export interface QuickPlanSeed {
  projectId?: string;
  date: IsoDate;
  resourceType?: 'MITARBEITER' | 'BAULEITER' | 'SUBUNTERNEHMER' | 'UNBESETZT';
  employeeId?: string;
  siteManagerId?: string;
  subcontractorId?: string;
}

export function QuickPlanDialog({
  seed,
  projects,
  onClose,
  onDone,
}: {
  seed: QuickPlanSeed | null;
  projects: ProjectSummaryDTO[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employees } = useEmployees();
  const { data: managers } = useSiteManagers();
  const { data: subs } = useSubcontractors();

  const [projectId, setProjectId] = React.useState('');
  const [resourceType, setResourceType] =
    React.useState<NonNullable<QuickPlanSeed['resourceType']>>('MITARBEITER');
  const [resourceId, setResourceId] = React.useState('');
  const [placeholder, setPlaceholder] = React.useState('');
  const [startDate, setStartDate] = React.useState<IsoDate>('');
  const [endDate, setEndDate] = React.useState<IsoDate>('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [note, setNote] = React.useState('');
  const [kind, setKind] = React.useState<AssignmentKindKey>('ARBEIT');
  const [tasks, setTasks] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState('GEPLANT');
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [subDialog, setSubDialog] = React.useState(false);

  // Beim Öffnen aus dem Kontext heraus vorbelegen.
  React.useEffect(() => {
    if (!seed) return;
    setProjectId(seed.projectId ?? projects[0]?.id ?? '');
    setResourceType(seed.resourceType ?? 'MITARBEITER');
    setResourceId(seed.employeeId ?? seed.siteManagerId ?? seed.subcontractorId ?? '');
    setPlaceholder('');
    setStartDate(seed.date);
    setEndDate(seed.date);
    setStartTime('');
    setEndTime('');
    setNote('');
    // Bauleiter fahren meist zur Besichtigung, Mitarbeiter arbeiten.
    setKind(seed.resourceType === 'BAULEITER' ? 'BESICHTIGUNG' : 'ARBEIT');
    setTasks([]);
    setStatus('GEPLANT');
    setError(null);
    setConflict(null);
  }, [seed, projects]);

  const options = React.useMemo(() => {
    if (resourceType === 'MITARBEITER') {
      return (employees ?? [])
        .filter((e) => e.active)
        .map((e) => ({ id: e.id, label: `${e.name}${e.profession ? ` · ${e.profession}` : ''}` }));
    }
    if (resourceType === 'BAULEITER') {
      return (managers ?? []).filter((m) => m.active).map((m) => ({ id: m.id, label: m.name }));
    }
    if (resourceType === 'SUBUNTERNEHMER') {
      return (subs ?? [])
        .filter((s) => s.active)
        .map((s) => ({
          id: s.id,
          label: `${s.companyName}${s.tradeNames.length ? ` · ${s.tradeNames.join(', ')}` : ''}`,
        }));
    }
    return [];
  }, [resourceType, employees, managers, subs]);

  const save = useMutation({
    mutationFn: (force: boolean) =>
      api.post<{ message: string }>('/api/assignments', {
        projectId,
        resourceType,
        employeeId: resourceType === 'MITARBEITER' ? resourceId : null,
        siteManagerId: resourceType === 'BAULEITER' ? resourceId : null,
        subcontractorId: resourceType === 'SUBUNTERNEHMER' ? resourceId : null,
        placeholderLabel: resourceType === 'UNBESETZT' ? placeholder || 'Unbesetzt' : null,
        startDate,
        endDate: endDate || startDate,
        startTime: startTime || null,
        endTime: endTime || null,
        note: note || null,
        kind,
        tasks,
        status,
        force,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      toast({ title: res.message, tone: 'success' });
      onDone();
      onClose();
    },
    onError: (e: Error) => {
      // 409 = Doppelbelegung. Erlaubt, aber bestätigungspflichtig.
      if (e.message.includes('bereits auf Baustelle')) setConflict(e.message);
      else setError(e.message);
    },
  });

  const submit = (force: boolean) => {
    setError(null);
    if (!projectId) return setError('Bitte ein Projekt wählen.');
    if (resourceType !== 'UNBESETZT' && !resourceId)
      return setError('Bitte eine Ressource wählen.');
    if (!startDate) return setError('Bitte ein Startdatum wählen.');
    save.mutate(force);
  };

  return (
    <>
      <Dialog open={!!seed} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Ressource einplanen</DialogTitle>
          <DialogDescription>
            Projekt, Ressource und Datum wählen – fertig. Änderungen landen automatisch im
            Änderungsprotokoll.
          </DialogDescription>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <Field label="Baustelle *">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">– wählen –</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.internKey ? p.name : [p.orderNumber, p.customerName, p.name].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-[9rem_1fr] gap-3">
              <Field label="Art">
                <Select
                  value={resourceType}
                  onChange={(e) => {
                    const next = e.target.value as typeof resourceType;
                    setResourceType(next);
                    setResourceId('');
                    setKind(next === 'BAULEITER' ? 'BESICHTIGUNG' : 'ARBEIT');
                  }}
                >
                  <option value="MITARBEITER">Mitarbeiter</option>
                  <option value="BAULEITER">Bauleiter</option>
                  <option value="SUBUNTERNEHMER">Subunternehmer</option>
                  <option value="UNBESETZT">Platzhalter (unbesetzt)</option>
                </Select>
              </Field>

              {resourceType === 'UNBESETZT' ? (
                <Field label="Bezeichnung">
                  <Input
                    value={placeholder}
                    onChange={(e) => setPlaceholder(e.target.value)}
                    placeholder="z. B. Helfer für Abnahme"
                  />
                </Field>
              ) : (
                <Field label="Ressource *">
                  <div className="flex gap-1.5">
                    <Select
                      value={resourceId}
                      onChange={(e) => setResourceId(e.target.value)}
                      className="flex-1"
                    >
                      <option value="">– wählen –</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    {resourceType === 'SUBUNTERNEHMER' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Subunternehmer anlegen"
                        onClick={() => setSubDialog(true)}
                      >
                        <Plus />
                      </Button>
                    ) : null}
                  </div>
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Von *">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                  }}
                />
              </Field>
              <Field label="Bis" hint="Leer = eintägiger Einsatz">
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Beginn">
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="Ende">
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {ASSIGNMENT_STATUS_KEYS.filter((s) => s !== 'ERLEDIGT').map((s) => (
                    <option key={s} value={s}>
                      {ASSIGNMENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Wofür?"
              hint={
                resourceType === 'BAULEITER'
                  ? 'Bauleiter fahren selten zum Arbeiten – hier steht der Anlass.'
                  : undefined
              }
            >
              <Select value={kind} onChange={(e) => setKind(e.target.value as AssignmentKindKey)}>
                {(KIND_SUGGESTIONS[resourceType] ?? KIND_SUGGESTIONS.MITARBEITER).map((k) => (
                  <option key={k} value={k}>
                    {ASSIGNMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Tätigkeiten"
              hint="Was ist an diesem Tag konkret zu tun? Enter legt die nächste Zeile an."
            >
              <TaskListInput
                value={tasks}
                onChange={setTasks}
                placeholder={
                  resourceType === 'BAULEITER'
                    ? 'z. B. Aufmaß Fenster nehmen'
                    : 'z. B. Trockenbauwände stellen'
                }
              />
            </Field>

            <Field label="Notiz">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="z. B. Schlüssel beim Nachbarn"
              />
            </Field>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            {conflict ? (
              <div className="rounded-md border border-ampel-gelb/50 bg-ampel-gelb/10 p-2.5">
                <p className="flex items-start gap-1.5 text-xs">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-ampel-gelb" />
                  <span>{conflict}</span>
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => submit(true)}
                    disabled={save.isPending}
                  >
                    Trotzdem einplanen
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConflict(null)}>
                    Zurück
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!startDate) return;
                  setStartDate(addDays(startDate, 1));
                  setEndDate(addDays(endDate || startDate, 1));
                }}
              >
                +1 Tag
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={save.isPending || !!conflict}>
                  Einplanen
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <SubAnlegenDialog
        open={subDialog}
        onOpenChange={setSubDialog}
        onCreated={(id) => {
          setResourceType('SUBUNTERNEHMER');
          setResourceId(id);
        }}
      />
    </>
  );
}
