'use client';
/**
 * Einsatz bearbeiten / verschieben. Bei einer Terminverschiebung wird ein
 * Grund abgefragt (Master-Prompt Abschnitt 15) – auswertbar plus Freitext.
 */
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { AssignmentDTO, ProjectSummaryDTO } from '@/lib/types';
import {
  ASSIGNMENT_KIND_KEYS,
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_STATUS_KEYS,
  ASSIGNMENT_STATUS_LABEL,
  CHANGE_REASON_KEYS,
  CHANGE_REASON_LABEL,
  type AssignmentKindKey,
} from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { TaskListInput } from '@/components/ui/task-list-input';

export function AssignmentDialog({
  assignment,
  projects,
  onClose,
}: {
  assignment: AssignmentDTO | null;
  projects: ProjectSummaryDTO[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [status, setStatus] = React.useState('GEPLANT');
  const [note, setNote] = React.useState('');
  const [kind, setKind] = React.useState<AssignmentKindKey>('ARBEIT');
  const [tasks, setTasks] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState('KUNDE');
  const [reasonText, setReasonText] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!assignment) return;
    setProjectId(assignment.projectId);
    setStartDate(assignment.startDate);
    setEndDate(assignment.endDate);
    setStartTime(assignment.startTime ?? '');
    setEndTime(assignment.endTime ?? '');
    setStatus(assignment.status);
    setNote(assignment.note ?? '');
    setKind(assignment.kind);
    setTasks(assignment.tasks);
    setReason('KUNDE');
    setReasonText('');
    setError(null);
    setConflict(null);
  }, [assignment]);

  const dateChanged =
    !!assignment && (startDate !== assignment.startDate || endDate !== assignment.endDate);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['warnings'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const save = useMutation({
    mutationFn: (force: boolean) =>
      api.patch<{ message: string }>(`/api/assignments/${assignment!.id}`, {
        projectId,
        startDate,
        endDate,
        startTime: startTime || null,
        endTime: endTime || null,
        status,
        note: note || null,
        kind,
        tasks,
        reason: dateChanged ? reason : null,
        reasonText: dateChanged ? reasonText || null : null,
        force,
      }),
    onSuccess: (res) => {
      invalidate();
      toast({ title: res.message, tone: 'success' });
      onClose();
    },
    onError: (e: Error) => {
      if (e.message.includes('bereits auf Baustelle')) setConflict(e.message);
      else setError(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/api/assignments/${assignment!.id}`),
    onSuccess: (res) => {
      invalidate();
      toast({ title: res.message, tone: 'info' });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!assignment) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{assignment.resourceLabel}</DialogTitle>
        <DialogDescription>Einsatz bearbeiten, verschieben oder entfernen.</DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate(false);
          }}
        >
          <Field label="Baustelle">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.internKey ? p.name : [p.orderNumber, p.customerName, p.name].filter(Boolean).join(' · ')}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Von">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </Field>
            <Field label="Bis">
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Beginn">
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="Ende">
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {ASSIGNMENT_STATUS_KEYS.map((s) => (
                  <option key={s} value={s}>
                    {ASSIGNMENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {dateChanged ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-accent bg-accent/40 p-2.5">
              <Field label="Grund der Terminänderung">
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {CHANGE_REASON_KEYS.map((r) => (
                    <option key={r} value={r}>
                      {CHANGE_REASON_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ergänzung (optional)">
                <Input
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="z. B. Kunde nicht vor Ort"
                />
              </Field>
            </div>
          ) : null}

          <Field label="Wofür?">
            <Select value={kind} onChange={(e) => setKind(e.target.value as AssignmentKindKey)}>
              {ASSIGNMENT_KIND_KEYS.map((k) => (
                <option key={k} value={k}>
                  {ASSIGNMENT_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tätigkeiten">
            <TaskListInput value={tasks} onChange={setTasks} />
          </Field>

          <Field label="Notiz">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
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
                  disabled={save.isPending}
                  onClick={() => save.mutate(true)}
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
              className="text-destructive hover:bg-destructive/10"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 /> Entfernen
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={save.isPending || !!conflict}>
                Speichern
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
