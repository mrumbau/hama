'use client';
/** Projektliste (Master-Prompt Abschnitt 8) – Detail öffnet als Sidepanel. */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Building2, Plus, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useSiteManagers } from '@/lib/queries';
import { formatDateShort } from '@/lib/dates';
import {
  CONFIRMATION_LABEL,
  MATERIAL_STATUS_LABEL,
  PRIORITY_LABEL,
  PROJECT_STATUS_KEYS,
  PROJECT_STATUS_LABEL,
  TRAFFIC_LIGHT_LABEL,
} from '@/lib/labels';
import type { ProjectSummaryDTO } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AmpelDot, AmpelErklaerung } from '@/components/ui/ampel';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { ProjectPanel } from './project-panel';

export function ProjectsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('projekt');

  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [ampel, setAmpel] = React.useState('');
  const [manager, setManager] = React.useState('');
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  // Abgeschlossene sind standardmäßig aus dem Weg: Angebote, die nie zum
  // Auftrag geworden sind, gehören nicht in die tägliche Liste.
  const [showClosed, setShowClosed] = React.useState(false);
  const [create, setCreate] = React.useState(false);

  const { data: managers } = useSiteManagers();

  const query = React.useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    if (status) p.set('status', status);
    if (ampel) p.set('ampel', ampel);
    if (manager) p.set('bauleiter', manager);
    if (onlyProblems) p.set('nurProbleme', '1');
    if (showClosed) p.set('abgeschlossen', '1');
    return p.toString();
  }, [search, status, ampel, manager, onlyProblems, showClosed]);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', query],
    queryFn: () => api.get<{ projects: ProjectSummaryDTO[] }>(`/api/projects?${query}`),
    placeholderData: (prev) => prev,
  });

  const projects = data?.projects ?? [];

  const open = (id: string | null) =>
    router.replace(id ? `/projekte?projekt=${id}` : '/projekte', { scroll: false });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Projekte"
        description="Stammdaten kommen aus „Das Programm“. Disposition, Ampel und Historie pflegt diese App."
        actions={
          <Button size="sm" onClick={() => setCreate(true)}>
            <Plus /> Projekt anlegen
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kunde, Projekt, Auftragsnummer, Ort …"
            className="h-8 w-64 text-xs"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="">Alle Status</option>
            {PROJECT_STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            value={ampel}
            onChange={(e) => setAmpel(e.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="">Alle Ampeln</option>
            {(['ROT', 'GELB', 'GRUEN', 'GRAU'] as const).map((a) => (
              <option key={a} value={a}>
                {TRAFFIC_LIGHT_LABEL[a]}
              </option>
            ))}
          </Select>
          <Select
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="">Alle Bauleiter</option>
            {managers?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Button
            variant={onlyProblems ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setOnlyProblems((v) => !v)}
          >
            <TriangleAlert /> Nur Probleme
          </Button>
          <Button
            variant={showClosed ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowClosed((v) => !v)}
            title="Erledigte Baustellen und Projekte, die nicht zum Auftrag geführt haben"
          >
            <Archive /> Abgeschlossene
          </Button>
          <span className="ml-auto text-2xs text-muted-foreground">{projects.length} Projekte</span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Wird geladen …</p>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Keine Projekte gefunden"
            description="Passen Sie die Filter an oder synchronisieren Sie mit „Das Programm“."
            className="m-4"
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Baustelle</th>
                <th className="px-3 py-2 font-semibold">Bauleiter</th>
                <th className="px-3 py-2 font-semibold">Zeitraum</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Material</th>
                <th className="px-3 py-2 font-semibold">Kunde best.</th>
                <th className="px-3 py-2 font-semibold">Priorität</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => open(p.id)}
                  className="cursor-pointer border-b transition hover:bg-accent/50"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="mt-1">
                            <AmpelDot light={p.trafficLight} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="start">
                          <AmpelErklaerung light={p.trafficLight} reasons={p.trafficLightReasons} />
                        </TooltipContent>
                      </Tooltip>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.customerName} – {p.name}
                        </p>
                        <p className="truncate text-2xs text-muted-foreground">
                          {[p.orderNumber, p.projectNumber, p.city].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {p.primarySiteManagerName ?? (
                      <span className="text-destructive">Kein Bauleiter</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">
                    {p.plannedStart ? formatDateShort(p.plannedStart) : '–'}
                    {p.plannedEnd && p.plannedEnd !== p.plannedStart
                      ? ` – ${formatDateShort(p.plannedEnd)}`
                      : ''}
                  </td>
                  <td className="px-3 py-2 text-xs">{PROJECT_STATUS_LABEL[p.status]}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        p.materialStatus === 'VOLLSTAENDIG'
                          ? 'gruen'
                          : p.materialStatus === 'OFFEN'
                            ? 'rot'
                            : p.materialStatus === 'TEILWEISE'
                              ? 'gelb'
                              : 'grau'
                      }
                    >
                      {MATERIAL_STATUS_LABEL[p.materialStatus]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        p.customerConfirmed === 'BESTAETIGT'
                          ? 'gruen'
                          : p.customerConfirmed === 'ABGELEHNT'
                            ? 'rot'
                            : 'gelb'
                      }
                    >
                      {CONFIRMATION_LABEL[p.customerConfirmed]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'text-xs',
                        p.priority === 'KRITISCH'
                          ? 'font-semibold text-destructive'
                          : p.priority === 'HOCH'
                            ? 'font-medium'
                            : 'text-muted-foreground',
                      )}
                    >
                      {PRIORITY_LABEL[p.priority]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateProjectDialog open={create} onClose={() => setCreate(false)} onCreated={open} />
      {openId ? <ProjectPanel projectId={openId} onClose={() => open(null)} /> : null}
    </div>
  );
}

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: managers } = useSiteManagers();
  const [form, setForm] = React.useState({
    customerName: '',
    name: '',
    orderNumber: '',
    city: '',
    street: '',
    zip: '',
    primarySiteManagerId: '',
    plannedStart: '',
    plannedEnd: '',
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm({
        customerName: '',
        name: '',
        orderNumber: '',
        city: '',
        street: '',
        zip: '',
        primarySiteManagerId: '',
        plannedStart: '',
        plannedEnd: '',
      });
      setError(null);
    }
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      api.post<{ project: { id: string }; message: string }>('/api/projects', {
        ...form,
        primarySiteManagerId: form.primarySiteManagerId || null,
        plannedStart: form.plannedStart || null,
        plannedEnd: form.plannedEnd || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast({ title: res.message, tone: 'success' });
      onClose();
      onCreated(res.project.id);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Projekt anlegen</DialogTitle>
        <DialogDescription>
          Für Baustellen, die (noch) nicht aus „Das Programm“ kommen.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kunde *">
              <Input
                autoFocus
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </Field>
            <Field label="Projektname *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Auftragsnummer">
              <Input
                value={form.orderNumber}
                onChange={(e) => setForm({ ...form, orderNumber: e.target.value })}
                placeholder="AG-260047"
              />
            </Field>
            <Field label="Bauleiter">
              <Select
                value={form.primarySiteManagerId}
                onChange={(e) => setForm({ ...form, primarySiteManagerId: e.target.value })}
              >
                <option value="">– keiner –</option>
                {managers?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Straße" className="col-span-2">
              <Input
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
            </Field>
            <Field label="PLZ">
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </Field>
            <Field label="Ort">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="Geplanter Beginn">
              <Input
                type="date"
                value={form.plannedStart}
                onChange={(e) => setForm({ ...form, plannedStart: e.target.value })}
              />
            </Field>
            <Field label="Geplantes Ende">
              <Input
                type="date"
                value={form.plannedEnd}
                min={form.plannedStart || undefined}
                onChange={(e) => setForm({ ...form, plannedEnd: e.target.value })}
              />
            </Field>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Anlegen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
