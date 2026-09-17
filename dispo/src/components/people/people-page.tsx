'use client';
/** Mitarbeiter und Bauleiter (Master-Prompt Abschnitte 10 + 11). */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  useEmployees,
  useSiteManagers,
  useTrades,
  type EmployeeRow,
  type SiteManagerRow,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';

export function PeoplePage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get('tab') === 'bauleiter' ? 'bauleiter' : 'mitarbeiter';
  const [dialog, setDialog] = React.useState<'mitarbeiter' | 'bauleiter' | null>(null);
  const [editEmployee, setEditEmployee] = React.useState<EmployeeRow | null>(null);
  const [editManager, setEditManager] = React.useState<SiteManagerRow | null>(null);

  const employees = useEmployees();
  const managers = useSiteManagers();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Mitarbeiter &amp; Bauleiter"
        description="Eigene Ressourcen der MR Umbau GmbH. Keine Benutzerkonten – reine Planungsstammdaten."
        actions={
          <Button size="sm" onClick={() => setDialog(tab)}>
            <UserPlus /> {tab === 'bauleiter' ? 'Bauleiter' : 'Mitarbeiter'} anlegen
          </Button>
        }
      >
        <Tabs
          value={tab}
          onValueChange={(v) =>
            router.replace(v === 'bauleiter' ? '/mitarbeiter?tab=bauleiter' : '/mitarbeiter')
          }
          className="mt-2"
        >
          <TabsList>
            <TabsTrigger value="mitarbeiter">
              Mitarbeiter ({employees.data?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="bauleiter">Bauleiter ({managers.data?.length ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab === 'mitarbeiter' ? (
          employees.isLoading ? (
            <p className="text-sm text-muted-foreground">Wird geladen …</p>
          ) : !employees.data?.length ? (
            <EmptyState
              title="Noch keine Mitarbeiter angelegt"
              description="Legen Sie Ihre eigenen Mitarbeiter an, damit sie in der Plantafel eingeplant werden können."
              action={
                <Button size="sm" onClick={() => setDialog('mitarbeiter')}>
                  <Plus /> Mitarbeiter anlegen
                </Button>
              }
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {employees.data.map((e) => (
                <EmployeeCard key={e.id} employee={e} onEdit={() => setEditEmployee(e)} />
              ))}
            </div>
          )
        ) : managers.isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : !managers.data?.length ? (
          <EmptyState
            title="Noch keine Bauleiter angelegt"
            action={
              <Button size="sm" onClick={() => setDialog('bauleiter')}>
                <Plus /> Bauleiter anlegen
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {managers.data.map((m) => (
              <ManagerCard key={m.id} manager={m} onEdit={() => setEditManager(m)} />
            ))}
          </div>
        )}
      </div>

      <EmployeeDialog
        open={dialog === 'mitarbeiter' || !!editEmployee}
        employee={editEmployee}
        onClose={() => {
          setDialog(null);
          setEditEmployee(null);
        }}
      />
      <ManagerDialog
        open={dialog === 'bauleiter' || !!editManager}
        manager={editManager}
        onClose={() => {
          setDialog(null);
          setEditManager(null);
        }}
      />
    </div>
  );
}

function EmployeeCard({ employee, onEdit }: { employee: EmployeeRow; onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className={cn(
        'rounded-lg border bg-card p-3 text-left transition hover:shadow-sm',
        !employee.active && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-[#0f766e]/10 text-xs font-semibold text-[#0f766e]">
          {employee.shortCode}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{employee.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {employee.profession ?? 'Keine Qualifikation hinterlegt'}
          </p>
        </div>
        {employee.isDemo ? <Badge variant="grau">Demo</Badge> : null}
        {!employee.active ? <Badge variant="rot">inaktiv</Badge> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {employee.tradeNames.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
      </div>
      <div className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
        {employee.phone ? (
          <p className="flex items-center gap-1">
            <Phone className="size-3" /> {employee.phone}
          </p>
        ) : null}
        {employee.weeklyHours ? <p>{employee.weeklyHours} Std./Woche</p> : null}
        {employee.driversLicense ? <p>Führerschein vorhanden</p> : null}
        {employee.note ? <p className="line-clamp-2">{employee.note}</p> : null}
      </div>
    </button>
  );
}

function ManagerCard({ manager, onEdit }: { manager: SiteManagerRow; onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className={cn(
        'rounded-lg border bg-card p-3 text-left transition hover:shadow-sm',
        !manager.active && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded text-xs font-semibold text-white"
          style={{ backgroundColor: manager.color }}
        >
          {manager.shortCode}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{manager.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {manager.projectCount} verantwortliche Projekte
          </p>
        </div>
        {manager.isDemo ? <Badge variant="grau">Demo</Badge> : null}
        {!manager.active ? <Badge variant="rot">inaktiv</Badge> : null}
      </div>
      <div className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
        {manager.phone ? (
          <p className="flex items-center gap-1">
            <Phone className="size-3" /> {manager.phone}
          </p>
        ) : null}
        {manager.email ? <p>{manager.email}</p> : null}
        {manager.note ? <p className="line-clamp-2">{manager.note}</p> : null}
      </div>
    </button>
  );
}

function EmployeeDialog({
  open,
  employee,
  onClose,
}: {
  open: boolean;
  employee: EmployeeRow | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: trades } = useTrades();
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    shortCode: '',
    phone: '',
    profession: '',
    weeklyHours: '',
    driversLicense: false,
    note: '',
    active: true,
    tradeIds: [] as string[],
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      employee
        ? {
            firstName: employee.firstName,
            lastName: employee.lastName,
            shortCode: employee.shortCode,
            phone: employee.phone ?? '',
            profession: employee.profession ?? '',
            weeklyHours: employee.weeklyHours ? String(employee.weeklyHours) : '',
            driversLicense: employee.driversLicense,
            note: employee.note ?? '',
            active: employee.active,
            tradeIds: employee.tradeIds,
          }
        : {
            firstName: '',
            lastName: '',
            shortCode: '',
            phone: '',
            profession: '',
            weeklyHours: '',
            driversLicense: false,
            note: '',
            active: true,
            tradeIds: [],
          },
    );
  }, [open, employee]);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    toast({ title: message, tone: 'success' });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        phone: form.phone || null,
        profession: form.profession || null,
        weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : null,
        note: form.note || null,
      };
      return employee
        ? api.patch<{ message: string }>(`/api/employees/${employee.id}`, body)
        : api.post<{ message: string }>('/api/employees', body);
    },
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/api/employees/${employee!.id}`),
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{employee ? employee.name : 'Neuer Mitarbeiter'}</DialogTitle>
        <DialogDescription>
          Mitarbeiter sind reine Planungsressourcen – kein Login, keine Rechte.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Vorname *">
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Nachname *">
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label="Kürzel" hint="Leer = automatisch">
              <Input
                value={form.shortCode}
                onChange={(e) => setForm({ ...form, shortCode: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Beruf / Qualifikation">
              <Input
                value={form.profession}
                onChange={(e) => setForm({ ...form, profession: e.target.value })}
              />
            </Field>
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Wochenstunden">
              <Input
                type="number"
                min={0}
                max={80}
                value={form.weeklyHours}
                onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Fähigkeiten">
            <div className="flex flex-wrap gap-1 rounded-md border p-2">
              {trades?.map((t) => {
                const on = form.tradeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        tradeIds: on
                          ? form.tradeIds.filter((id) => id !== t.id)
                          : [...form.tradeIds, t.id],
                      })
                    }
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-2xs transition',
                      on
                        ? 'border-transparent text-white'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                    style={on ? { backgroundColor: t.color } : undefined}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Notiz">
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>

          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.driversLicense}
                onChange={(e) => setForm({ ...form, driversLicense: e.target.checked })}
              />
              Führerschein
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Aktiv
            </label>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            {employee ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 /> Löschen
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Speichern
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagerDialog({
  open,
  manager,
  onClose,
}: {
  open: boolean;
  manager: SiteManagerRow | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    shortCode: '',
    phone: '',
    email: '',
    color: '#2563eb',
    note: '',
    active: true,
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      manager
        ? {
            firstName: manager.firstName,
            lastName: manager.lastName,
            shortCode: manager.shortCode,
            phone: manager.phone ?? '',
            email: manager.email ?? '',
            color: manager.color,
            note: manager.note ?? '',
            active: manager.active,
          }
        : {
            firstName: '',
            lastName: '',
            shortCode: '',
            phone: '',
            email: '',
            color: '#2563eb',
            note: '',
            active: true,
          },
    );
  }, [open, manager]);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['site-managers'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    toast({ title: message, tone: 'success' });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        phone: form.phone || null,
        email: form.email || null,
        note: form.note || null,
      };
      return manager
        ? api.patch<{ message: string }>(`/api/site-managers/${manager.id}`, body)
        : api.post<{ message: string }>('/api/site-managers', body);
    },
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/api/site-managers/${manager!.id}`),
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{manager ? manager.name : 'Neuer Bauleiter'}</DialogTitle>
        <DialogDescription>
          Die Farbe kennzeichnet den Bauleiter in der Plantafel.
        </DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Vorname *">
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </Field>
            <Field label="Nachname *">
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </Field>
            <Field label="Kürzel" hint="Leer = automatisch">
              <Input
                value={form.shortCode}
                onChange={(e) => setForm({ ...form, shortCode: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="E-Mail">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Farbe">
              <Input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 p-1"
              />
            </Field>
          </div>
          <Field label="Notiz">
            <Textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Aktiv
          </label>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            {manager ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                <Trash2 /> Löschen
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Speichern
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
