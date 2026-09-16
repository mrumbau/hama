'use client';
/**
 * Projekt-Sidepanel (Master-Prompt Abschnitt 24).
 * Kopf mit den wichtigsten Daten, darunter Tabs. Bearbeitung findet direkt
 * hier statt – keine eigene Seite, keine riesigen Formulare.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useSiteManagers } from '@/lib/queries';
import { formatDateShort, formatDateTime } from '@/lib/dates';
import {
  CONFIRMATION_KEYS,
  CONFIRMATION_LABEL,
  MATERIAL_STATUS_KEYS,
  MATERIAL_STATUS_LABEL,
  PRIORITY_KEYS,
  PRIORITY_LABEL,
  PROJECT_STATUS_KEYS,
  PROJECT_STATUS_LABEL,
  SOURCE_LABEL,
  TRAFFIC_LIGHT_KEYS,
  TRAFFIC_LIGHT_LABEL,
  type TrafficLightKey,
} from '@/lib/labels';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { AmpelDot } from '@/components/ui/ampel';
import { EmptyState, Separator } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import type { AssignmentDTO } from '@/lib/types';

interface ProjectDetail {
  id: string;
  erpId: string | null;
  orderNumber: string | null;
  projectNumber: string | null;
  customerName: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  primarySiteManagerId: string | null;
  primarySiteManagerName: string | null;
  secondarySiteManagerId: string | null;
  secondarySiteManagerName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  status: keyof typeof PROJECT_STATUS_LABEL;
  priority: keyof typeof PRIORITY_LABEL;
  materialStatus: keyof typeof MATERIAL_STATUS_LABEL;
  customerConfirmed: keyof typeof CONFIRMATION_LABEL;
  trafficLight: TrafficLightKey;
  trafficLightOverride: TrafficLightKey | null;
  trafficLightReasons: string[];
  internalNotes: string | null;
  specialNotes: string | null;
  isDemo: boolean;
  notes: { id: string; body: string; pinned: boolean; createdAt: string; source: string }[];
  communications: {
    id: string;
    occurredAt: string;
    customerName: string | null;
    summary: string | null;
    status: string;
    durationSeconds: number | null;
  }[];
  changeRequests: {
    id: string;
    title: string;
    status: string;
    type: string;
    createdAt: string;
    description: string | null;
  }[];
}

const TABS = [
  { value: 'uebersicht', label: 'Übersicht' },
  { value: 'planung', label: 'Planung' },
  { value: 'team', label: 'Team' },
  { value: 'subs', label: 'SUBs' },
  { value: 'kommunikation', label: 'Kommunikation' },
  { value: 'aenderungen', label: 'Änderungen' },
  { value: 'notizen', label: 'Notizen' },
] as const;

export function ProjectPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const tabFromUrl = params.get('tab') ?? 'uebersicht';
  const [tab, setTab] = React.useState(tabFromUrl);

  React.useEffect(() => setTab(tabFromUrl), [tabFromUrl]);

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      api.get<{ project: ProjectDetail; assignments: AssignmentDTO[] }>(
        `/api/projects/${projectId}`,
      ),
  });

  const project = data?.project;
  const assignments = data?.assignments ?? [];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        {isLoading || !project ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Projekt wird geladen …
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b p-4 pr-10">
              <div className="flex items-start gap-2">
                <AmpelDot light={project.trafficLight} className="mt-1.5 size-3" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">
                    {project.customerName} – {project.name}
                  </SheetTitle>
                  <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {project.orderNumber ? <span>{project.orderNumber}</span> : null}
                    {project.projectNumber ? <span>· {project.projectNumber}</span> : null}
                    {project.erpId ? <span>· ERP {project.erpId}</span> : null}
                    {project.isDemo ? <Badge variant="grau">Demo</Badge> : null}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{PROJECT_STATUS_LABEL[project.status]}</Badge>
                    {project.primarySiteManagerName ? (
                      <Badge variant="primary">
                        <User className="size-3" /> {project.primarySiteManagerName}
                      </Badge>
                    ) : (
                      <Badge variant="rot">Kein Bauleiter</Badge>
                    )}
                    {project.city ? (
                      <Badge variant="outline">
                        <MapPin className="size-3" />
                        {[project.street, project.zip, project.city].filter(Boolean).join(', ')}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              {project.trafficLightReasons.length > 0 ? (
                <ul className="mt-2 space-y-0.5 rounded-md bg-muted/60 p-2 text-2xs text-muted-foreground">
                  {project.trafficLightReasons.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v);
                const next = new URLSearchParams(params.toString());
                next.set('tab', v);
                router.replace(`?${next.toString()}`, { scroll: false });
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 overflow-x-auto border-b px-4 py-2">
                <TabsList>
                  {TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                <TabsContent value="uebersicht">
                  <OverviewTab project={project} />
                </TabsContent>
                <TabsContent value="planung">
                  <AssignmentsTab
                    assignments={assignments}
                    project={project}
                    filter={() => true}
                    emptyText="Für dieses Projekt ist noch nichts eingeplant."
                  />
                </TabsContent>
                <TabsContent value="team">
                  <AssignmentsTab
                    assignments={assignments}
                    project={project}
                    filter={(a) =>
                      a.resourceType === 'MITARBEITER' ||
                      a.resourceType === 'BAULEITER' ||
                      a.resourceType === 'UNBESETZT'
                    }
                    emptyText="Noch kein eigenes Personal eingeplant."
                  />
                </TabsContent>
                <TabsContent value="subs">
                  <AssignmentsTab
                    assignments={assignments}
                    project={project}
                    filter={(a) => a.resourceType === 'SUBUNTERNEHMER'}
                    emptyText="Noch kein Subunternehmer eingeplant."
                  />
                </TabsContent>
                <TabsContent value="kommunikation">
                  <CommunicationTab project={project} />
                </TabsContent>
                <TabsContent value="aenderungen">
                  <TimelineTab projectId={project.id} />
                </TabsContent>
                <TabsContent value="notizen">
                  <NotesTab project={project} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function OverviewTab({ project }: { project: ProjectDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: managers } = useSiteManagers();
  const [form, setForm] = React.useState(project);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setForm(project);
    setDirty(false);
  }, [project]);

  const set = <K extends keyof ProjectDetail>(key: K, value: ProjectDetail[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ message: string }>(`/api/projects/${project.id}`, {
        customerName: form.customerName,
        name: form.name,
        orderNumber: form.orderNumber,
        projectNumber: form.projectNumber,
        street: form.street,
        zip: form.zip,
        city: form.city,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        primarySiteManagerId: form.primarySiteManagerId || null,
        secondarySiteManagerId: form.secondarySiteManagerId || null,
        plannedStart: form.plannedStart || null,
        plannedEnd: form.plannedEnd || null,
        status: form.status,
        priority: form.priority,
        materialStatus: form.materialStatus,
        customerConfirmed: form.customerConfirmed,
        trafficLightOverride: form.trafficLightOverride || null,
        internalNotes: form.internalNotes,
        specialNotes: form.specialNotes,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDirty(false);
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Aus „Das Programm“ (ERP führend)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kunde">
            <Input value={form.customerName} onChange={(e) => set('customerName', e.target.value)} />
          </Field>
          <Field label="Projektname">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Auftragsnummer">
            <Input
              value={form.orderNumber ?? ''}
              onChange={(e) => set('orderNumber', e.target.value)}
            />
          </Field>
          <Field label="Projektnummer">
            <Input
              value={form.projectNumber ?? ''}
              onChange={(e) => set('projectNumber', e.target.value)}
            />
          </Field>
          <Field label="Straße" className="col-span-2">
            <Input value={form.street ?? ''} onChange={(e) => set('street', e.target.value)} />
          </Field>
          <Field label="PLZ">
            <Input value={form.zip ?? ''} onChange={(e) => set('zip', e.target.value)} />
          </Field>
          <Field label="Ort">
            <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ansprechpartner
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name">
            <Input
              value={form.contactName ?? ''}
              onChange={(e) => set('contactName', e.target.value)}
            />
          </Field>
          <Field label="Telefon">
            <Input
              value={form.contactPhone ?? ''}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </Field>
          <Field label="E-Mail">
            <Input
              value={form.contactEmail ?? ''}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </Field>
        </div>
        {form.contactPhone || form.contactEmail ? (
          <div className="flex gap-2">
            {form.contactPhone ? (
              <Button type="button" variant="outline" size="xs" asChild>
                <a href={`tel:${form.contactPhone}`}>
                  <Phone /> Anrufen
                </a>
              </Button>
            ) : null}
            {form.contactEmail ? (
              <Button type="button" variant="outline" size="xs" asChild>
                <a href={`mailto:${form.contactEmail}`}>
                  <Mail /> E-Mail
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Disposition (Dispo-App führend)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bauleiter">
            <Select
              value={form.primarySiteManagerId ?? ''}
              onChange={(e) => set('primarySiteManagerId', e.target.value || null)}
            >
              <option value="">– keiner –</option>
              {managers?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zweiter Bauleiter">
            <Select
              value={form.secondarySiteManagerId ?? ''}
              onChange={(e) => set('secondarySiteManagerId', e.target.value || null)}
            >
              <option value="">– keiner –</option>
              {managers?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Geplanter Beginn">
            <Input
              type="date"
              value={form.plannedStart ?? ''}
              onChange={(e) => set('plannedStart', e.target.value || null)}
            />
          </Field>
          <Field label="Geplantes Ende">
            <Input
              type="date"
              value={form.plannedEnd ?? ''}
              min={form.plannedStart ?? undefined}
              onChange={(e) => set('plannedEnd', e.target.value || null)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(e) => set('status', e.target.value as ProjectDetail['status'])}
            >
              {PROJECT_STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorität">
            <Select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as ProjectDetail['priority'])}
            >
              {PRIORITY_KEYS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Materialstatus">
            <Select
              value={form.materialStatus}
              onChange={(e) =>
                set('materialStatus', e.target.value as ProjectDetail['materialStatus'])
              }
            >
              {MATERIAL_STATUS_KEYS.map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_STATUS_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kundenbestätigung">
            <Select
              value={form.customerConfirmed}
              onChange={(e) =>
                set('customerConfirmed', e.target.value as ProjectDetail['customerConfirmed'])
              }
            >
              {CONFIRMATION_KEYS.map((c) => (
                <option key={c} value={c}>
                  {CONFIRMATION_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ampel übersteuern" hint="Leer = automatisch berechnet" className="col-span-2">
            <Select
              value={form.trafficLightOverride ?? ''}
              onChange={(e) =>
                set('trafficLightOverride', (e.target.value || null) as TrafficLightKey | null)
              }
            >
              <option value="">Automatisch ({TRAFFIC_LIGHT_LABEL[project.trafficLight]})</option>
              {TRAFFIC_LIGHT_KEYS.map((t) => (
                <option key={t} value={t}>
                  {TRAFFIC_LIGHT_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Interne Notizen">
          <Textarea
            rows={2}
            value={form.internalNotes ?? ''}
            onChange={(e) => set('internalNotes', e.target.value)}
          />
        </Field>
        <Field label="Besondere Hinweise">
          <Textarea
            rows={2}
            value={form.specialNotes ?? ''}
            onChange={(e) => set('specialNotes', e.target.value)}
          />
        </Field>
      </section>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-card py-3">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Speichert …' : dirty ? 'Änderungen speichern' : 'Gespeichert'}
        </Button>
      </div>
    </form>
  );
}

function AssignmentsTab({
  assignments,
  project,
  filter,
  emptyText,
}: {
  assignments: AssignmentDTO[];
  project: ProjectDetail;
  filter: (a: AssignmentDTO) => boolean;
  emptyText: string;
}) {
  const items = assignments.filter(filter);
  if (items.length === 0) {
    return <EmptyState icon={Building2} title={emptyText} />;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.resourceLabel}</span>
            <span className="block text-2xs text-muted-foreground">
              {formatDateShort(a.startDate)}
              {a.endDate !== a.startDate ? ` – ${formatDateShort(a.endDate)}` : ''}
              {a.startTime ? ` · ${a.startTime}${a.endTime ? `–${a.endTime}` : ''}` : ''}
              {a.note ? ` · ${a.note}` : ''}
            </span>
          </span>
          <Badge variant={a.status === 'BESTAETIGT' ? 'gruen' : a.status === 'ABGESAGT' ? 'rot' : 'outline'}>
            {a.status === 'BESTAETIGT' ? 'Bestätigt' : a.status === 'ABGESAGT' ? 'Abgesagt' : 'Geplant'}
          </Badge>
        </li>
      ))}
      <li className="pt-1 text-2xs text-muted-foreground">
        Planzeitraum: {formatDateShort(project.plannedStart)} – {formatDateShort(project.plannedEnd)}
      </li>
    </ul>
  );
}

function CommunicationTab({ project }: { project: ProjectDetail }) {
  if (project.communications.length === 0 && project.changeRequests.length === 0) {
    return <EmptyState title="Noch keine Kommunikation zu diesem Projekt erfasst." />;
  }
  return (
    <div className="space-y-4">
      {project.changeRequests.length > 0 ? (
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Änderungsvorschläge
          </h3>
          <ul className="space-y-1.5">
            {project.changeRequests.map((cr) => (
              <li key={cr.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{cr.title}</span>
                  <Badge variant={cr.status === 'OFFEN' ? 'gelb' : 'grau'}>{cr.status}</Badge>
                </div>
                {cr.description ? (
                  <p className="mt-0.5 text-2xs text-muted-foreground">{cr.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.communications.length > 0 ? (
        <section>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Telefonate
          </h3>
          <ul className="space-y-1.5">
            {project.communications.map((c) => (
              <li key={c.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {c.customerName ?? 'Telefonat'}
                  </span>
                  <span className="shrink-0 text-2xs text-muted-foreground">
                    {formatDateTime(c.occurredAt)}
                  </span>
                </div>
                {c.summary ? (
                  <p className="mt-0.5 text-2xs text-muted-foreground">{c.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Chronologische Projekthistorie mit Quelle je Eintrag (Abschnitt 25). */
function TimelineTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['project-timeline', projectId],
    queryFn: () =>
      api.get<{
        entries: {
          id: string;
          label: string;
          action: string;
          createdAt: string;
          source: keyof typeof SOURCE_LABEL;
          reasonText: string | null;
          note: string | null;
          oldValue: unknown;
          newValue: unknown;
        }[];
      }>(`/api/projects/${projectId}/timeline`),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Historie wird geladen …</p>;
  if (!data?.entries.length) return <EmptyState title="Noch keine Änderungen protokolliert." />;

  return (
    <ol className="relative space-y-3 border-l pl-4">
      {data.entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-border" />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-2xs tabular-nums text-muted-foreground">
              {formatDateTime(e.createdAt)}
            </span>
            <span className="text-sm font-medium">{e.label}</span>
            <Badge variant="outline">{SOURCE_LABEL[e.source] ?? e.source}</Badge>
          </div>
          {renderChange(e.oldValue, e.newValue)}
          {e.reasonText ? (
            <p className="text-2xs text-muted-foreground">Grund: {e.reasonText}</p>
          ) : null}
          {e.note ? <p className="text-2xs text-muted-foreground">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function renderChange(oldValue: unknown, newValue: unknown) {
  if (!oldValue && !newValue) return null;
  const format = (v: unknown) =>
    v && typeof v === 'object'
      ? Object.entries(v as Record<string, unknown>)
          .map(([k, val]) => `${k}: ${val ?? '–'}`)
          .join(', ')
      : String(v ?? '–');
  return (
    <p className="text-2xs text-muted-foreground">
      {oldValue ? (
        <>
          <span className="font-medium">ALT</span> {format(oldValue)}
          {newValue ? ' → ' : null}
        </>
      ) : null}
      {newValue ? (
        <>
          <span className="font-medium">NEU</span> {format(newValue)}
        </>
      ) : null}
    </p>
  );
}

function NotesTab({ project }: { project: ProjectDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = React.useState('');

  const add = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>(`/api/projects/${project.id}/notes`, { body }),
    onSuccess: (res) => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['project-timeline', project.id] });
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const remove = useMutation({
    mutationFn: (noteId: string) =>
      api.delete<{ message: string }>(`/api/projects/${project.id}/notes?notiz=${noteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
  });

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Neue Notiz – z. B. "Schlüssel liegt beim Nachbarn"'}
        />
        <Button type="submit" size="icon" disabled={!body.trim() || add.isPending}>
          <Plus />
        </Button>
      </form>

      {project.notes.length === 0 ? (
        <EmptyState title="Noch keine Notizen." />
      ) : (
        <ul className="space-y-1.5">
          {project.notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block whitespace-pre-wrap text-sm">{n.body}</span>
                <span className="block text-2xs text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                  {n.pinned ? ' · angeheftet' : ''}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(n.id)}
                aria-label="Notiz löschen"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
