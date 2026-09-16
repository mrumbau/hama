'use client';
/**
 * Änderungen / Kommunikation (Master-Prompt Abschnitte 20–21).
 *
 * Links die Telefonate, rechts die daraus abgeleiteten Änderungsvorschläge.
 * Ein Vorschlag wird erst nach „Übernehmen“ wirksam.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Clock,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PlayCircle,
  X,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateShort, formatDateTime } from '@/lib/dates';
import { formatDuration } from '@/lib/utils';
import {
  CHANGE_REASON_KEYS,
  CHANGE_REASON_LABEL,
  CHANGE_REQUEST_STATUS_LABEL,
  CHANGE_REQUEST_TYPE_LABEL,
  COMMUNICATION_STATUS_LABEL,
  type ChangeReasonKey,
  type ChangeRequestTypeKey,
} from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';

interface ProjectRef {
  id: string;
  customerName: string;
  name: string;
  orderNumber: string | null;
}

interface ChangeRequestRow {
  id: string;
  type: ChangeRequestTypeKey;
  title: string;
  description: string | null;
  currentValue: { plannedStart?: string; plannedEnd?: string } | null;
  proposedValue: { plannedStart?: string; plannedEnd?: string } | null;
  reason: ChangeReasonKey;
  reasonText: string | null;
  confidence: number | null;
  status: 'OFFEN' | 'UEBERNOMMEN' | 'ABGELEHNT';
  projectId: string | null;
  project?: ProjectRef | null;
  createdAt: string;
}

interface CommunicationRow {
  id: string;
  occurredAt: string;
  direction: 'EINGEHEND' | 'AUSGEHEND' | 'UNBEKANNT';
  callerNumber: string | null;
  contactNumber: string | null;
  durationSeconds: number | null;
  agentName: string | null;
  customerName: string | null;
  summary: string | null;
  transcript: string | null;
  aiNotes: string | null;
  actionItems: string[];
  recordingUrl: string | null;
  status: 'NEU' | 'IN_PRUEFUNG' | 'ERLEDIGT';
  projectId: string | null;
  candidateProjectIds: string[];
  project: ProjectRef | null;
  changeRequests: ChangeRequestRow[];
  isDemo: boolean;
}

export function CommunicationPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<'ALLE' | 'NEU' | 'ERLEDIGT'>('ALLE');
  const selectedId = params.get('eintrag');

  const { data, isLoading } = useQuery({
    queryKey: ['communications', filter],
    queryFn: () =>
      api.get<{
        communications: CommunicationRow[];
        changeRequests: ChangeRequestRow[];
        candidates: ProjectRef[];
      }>(`/api/communications${filter === 'ALLE' ? '' : `?status=${filter}`}`),
  });

  const simulate = useMutation({
    mutationFn: () => api.post<{ message: string; matchNote: string }>('/api/integrations/3cx/simulate', {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast({ title: res.message, description: res.matchNote, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const communications = data?.communications ?? [];
  const openRequests = data?.changeRequests ?? [];
  const selected = communications.find((c) => c.id === selectedId) ?? communications[0] ?? null;

  const select = (id: string) => router.replace(`/kommunikation?eintrag=${id}`, { scroll: false });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Änderungen &amp; Kommunikation"
        description="Telefonate aus 3CX und die daraus erkannten Änderungsvorschläge. Nichts wird automatisch übernommen."
        actions={
          <Button size="sm" variant="outline" onClick={() => simulate.mutate()} disabled={simulate.isPending}>
            <PlayCircle /> 3CX-Testanruf simulieren
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="ALLE">Alle</TabsTrigger>
              <TabsTrigger value="NEU">Ungeprüft</TabsTrigger>
              <TabsTrigger value="ERLEDIGT">Erledigt</TabsTrigger>
            </TabsList>
          </Tabs>
          {openRequests.length > 0 ? (
            <Badge variant="gelb">{openRequests.length} offene Änderungsvorschläge</Badge>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22rem_1fr]">
        <div className="min-h-0 overflow-auto border-r">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Wird geladen …</p>
          ) : communications.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="Noch keine Telefonate"
              description="Sobald 3CX angebunden ist, erscheinen Gespräche hier automatisch."
              className="m-4"
              action={
                <Button size="sm" variant="outline" onClick={() => simulate.mutate()}>
                  <PlayCircle /> Testanruf simulieren
                </Button>
              }
            />
          ) : (
            <ul>
              {communications.map((c) => {
                const Icon = c.direction === 'AUSGEHEND' ? PhoneOutgoing : PhoneIncoming;
                const offen = c.changeRequests.filter((r) => r.status === 'OFFEN').length;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => select(c.id)}
                      className={cn(
                        'w-full border-b px-3 py-2.5 text-left transition hover:bg-accent/50',
                        selected?.id === c.id && 'bg-accent',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {c.status === 'NEU' ? <Badge variant="rot">NEU</Badge> : null}
                        <Icon className="size-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {c.customerName ?? c.contactNumber ?? 'Unbekannt'}
                        </span>
                        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                          {formatDateTime(c.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {c.summary ?? 'Keine Zusammenfassung.'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {c.project?.orderNumber ? (
                          <Badge variant="outline">{c.project.orderNumber}</Badge>
                        ) : c.candidateProjectIds.length ? (
                          <Badge variant="gelb">Projekt wählen</Badge>
                        ) : (
                          <Badge variant="grau">Ohne Projekt</Badge>
                        )}
                        {offen > 0 ? <Badge variant="gelb">{offen} Vorschlag/Vorschläge</Badge> : null}
                        <span className="text-2xs text-muted-foreground">
                          <Clock className="mr-0.5 inline size-2.5" />
                          {formatDuration(c.durationSeconds)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-h-0 overflow-auto p-4">
          {selected ? (
            <CommunicationDetail
              communication={selected}
              candidates={data?.candidates ?? []}
            />
          ) : (
            <EmptyState title="Kein Telefonat ausgewählt" />
          )}
        </div>
      </div>
    </div>
  );
}

function CommunicationDetail({
  communication,
  candidates,
}: {
  communication: CommunicationRow;
  candidates: ProjectRef[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<ChangeRequestRow | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['communications'] });
    queryClient.invalidateQueries({ queryKey: ['warnings'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
  };

  const update = useMutation({
    mutationFn: (body: { status?: string; projectId?: string | null }) =>
      api.patch<{ message: string }>(`/api/communications/${communication.id}`, body),
    onSuccess: (res) => {
      invalidate();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; action: 'uebernehmen' | 'ablehnen' }) =>
      api.post<{ message: string }>(`/api/change-requests/${vars.id}`, { action: vars.action }),
    onSuccess: (res) => {
      invalidate();
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const myCandidates = candidates.filter((c) => communication.candidateProjectIds.includes(c.id));
  const offeneVorschlaege = communication.changeRequests.filter((r) => r.status === 'OFFEN');

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              {communication.customerName ?? communication.contactNumber ?? 'Unbekannter Anrufer'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(communication.occurredAt)} · Telefonat{' '}
              {formatDuration(communication.durationSeconds)}
              {communication.agentName ? ` · ${communication.agentName}` : ''}
              {communication.callerNumber ? ` · ${communication.callerNumber}` : ''}
            </p>
          </div>
          <Badge
            variant={
              communication.status === 'NEU'
                ? 'rot'
                : communication.status === 'IN_PRUEFUNG'
                  ? 'gelb'
                  : 'gruen'
            }
          >
            {COMMUNICATION_STATUS_LABEL[communication.status]}
          </Badge>
          {communication.isDemo ? <Badge variant="grau">Demo</Badge> : null}
        </div>

        {/* Projektzuordnung */}
        <div className="mt-3 rounded-md bg-muted/60 p-2.5">
          {communication.project ? (
            <p className="text-xs">
              <span className="text-muted-foreground">Projekt: </span>
              <Link
                href={`/projekte?projekt=${communication.project.id}`}
                className="font-medium text-primary hover:underline"
              >
                {[communication.project.orderNumber, communication.project.customerName, communication.project.name]
                  .filter(Boolean)
                  .join(' · ')}
              </Link>
            </p>
          ) : myCandidates.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">
                Telefonat konnte Kunde {communication.customerName} zugeordnet werden. Bitte Projekt
                auswählen.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {myCandidates.map((c) => (
                  <Button
                    key={c.id}
                    size="xs"
                    variant="outline"
                    onClick={() => update.mutate({ projectId: c.id })}
                  >
                    {[c.orderNumber, c.customerName, c.name].filter(Boolean).join(' · ')}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Keine automatische Zuordnung möglich – bitte im Projekt-Sidepanel manuell zuordnen.
            </p>
          )}
        </div>

        {communication.summary ? (
          <div className="mt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zusammenfassung
            </p>
            <p className="mt-0.5 text-sm">{communication.summary}</p>
          </div>
        ) : null}

        {communication.actionItems.length > 0 ? (
          <div className="mt-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Erkannte Aktionen
            </p>
            <ul className="mt-0.5 space-y-0.5 text-sm">
              {communication.actionItems.map((a) => (
                <li key={a}>• {a}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {communication.transcript ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transkript anzeigen
            </summary>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {communication.transcript}
            </p>
          </details>
        ) : null}

        {communication.recordingUrl ? (
          <p className="mt-2 text-2xs">
            <a
              href={communication.recordingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary hover:underline"
            >
              Aufzeichnung in 3CX öffnen
            </a>
          </p>
        ) : null}

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={communication.status === 'IN_PRUEFUNG'}
            onClick={() => update.mutate({ status: 'IN_PRUEFUNG' })}
          >
            Prüfen
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={communication.status === 'ERLEDIGT'}
            onClick={() => update.mutate({ status: 'ERLEDIGT' })}
          >
            <Check /> Als erledigt markieren
          </Button>
        </div>
      </header>

      {/* Änderungsvorschläge */}
      {communication.changeRequests.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aus diesem Gespräch wurde kein Änderungsvorschlag abgeleitet.
        </p>
      ) : (
        <section className="space-y-2">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Änderungsvorschläge ({offeneVorschlaege.length} offen)
          </h3>
          {communication.changeRequests.map((cr) => (
            <article
              key={cr.id}
              className={cn(
                'rounded-lg border p-3',
                cr.status === 'OFFEN' && 'border-ampel-gelb/50 bg-ampel-gelb/5',
                cr.status === 'ABGELEHNT' && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={cr.status === 'OFFEN' ? 'gelb' : cr.status === 'UEBERNOMMEN' ? 'gruen' : 'grau'}>
                  {CHANGE_REQUEST_STATUS_LABEL[cr.status]}
                </Badge>
                <span className="text-sm font-medium">{cr.title}</span>
                <Badge variant="outline">{CHANGE_REQUEST_TYPE_LABEL[cr.type]}</Badge>
                {cr.confidence != null ? (
                  <span className="text-2xs text-muted-foreground">
                    Sicherheit {Math.round(cr.confidence * 100)} %
                  </span>
                ) : null}
              </div>

              {cr.description ? <p className="mt-1 text-xs">{cr.description}</p> : null}

              {cr.type === 'TERMIN_AENDERUNG' && cr.proposedValue?.plannedStart ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-card p-2 text-xs">
                  <span>
                    <span className="text-muted-foreground">Aktueller Termin: </span>
                    <span className="font-medium tabular-nums">
                      {formatDateShort(cr.currentValue?.plannedStart ?? null)}
                    </span>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">Vorschlag: </span>
                    <span className="font-medium tabular-nums text-primary">
                      {formatDateShort(cr.proposedValue.plannedStart)}
                    </span>
                  </span>
                </div>
              ) : null}

              <p className="mt-1 text-2xs text-muted-foreground">
                Grund: {CHANGE_REASON_LABEL[cr.reason]}
                {cr.reasonText ? ` – ${cr.reasonText}` : ''}
              </p>

              {cr.status === 'OFFEN' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: cr.id, action: 'uebernehmen' })}
                  >
                    <Check /> Übernehmen
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(cr)}>
                    <Pencil /> Bearbeiten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: cr.id, action: 'ablehnen' })}
                  >
                    <X /> Ablehnen
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}

      <EditChangeRequestDialog
        changeRequest={editing}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
    </div>
  );
}

/** Vorschlag vor der Übernahme anpassen (anderes Datum, anderer Grund). */
function EditChangeRequestDialog({
  changeRequest,
  onClose,
  onSaved,
}: {
  changeRequest: ChangeRequestRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [reason, setReason] = React.useState<string>('KUNDE');
  const [reasonText, setReasonText] = React.useState('');
  const [moveAssignments, setMoveAssignments] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!changeRequest) return;
    setStart(changeRequest.proposedValue?.plannedStart ?? '');
    setEnd(changeRequest.proposedValue?.plannedEnd ?? '');
    setReason(changeRequest.reason);
    setReasonText(changeRequest.reasonText ?? '');
    setMoveAssignments(true);
    setError(null);
  }, [changeRequest]);

  const accept = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>(`/api/change-requests/${changeRequest!.id}`, {
        action: 'uebernehmen',
        payload: {
          plannedStart: start || null,
          plannedEnd: end || null,
          reason,
          reasonText: reasonText || null,
          moveAssignments,
        },
      }),
    onSuccess: (res) => {
      onSaved();
      toast({ title: res.message, tone: 'success' });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!changeRequest) return null;
  const istTermin = changeRequest.type === 'TERMIN_AENDERUNG';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{changeRequest.title}</DialogTitle>
        <DialogDescription>
          Vorschlag anpassen und übernehmen. Erst danach wird der Termin geändert.
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            accept.mutate();
          }}
        >
          {istTermin ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Neuer Beginn">
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
                <Field label="Neues Ende">
                  <Input
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={moveAssignments}
                  onChange={(e) => setMoveAssignments(e.target.checked)}
                />
                Eingeplante Einsätze um denselben Zeitraum mitverschieben
              </label>
            </>
          ) : null}

          <Field label="Grund">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {CHANGE_REASON_KEYS.map((r) => (
                <option key={r} value={r}>
                  {CHANGE_REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ergänzung">
            <Textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
          </Field>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={accept.isPending}>
              <Check /> Übernehmen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
