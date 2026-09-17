'use client';
/** Subunternehmer (Master-Prompt Abschnitt 12 + 36). */
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Plus, Star, Trash2, Truck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useSubcontractors, useTrades, type SubcontractorRow } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { SubAnlegenDialog } from '@/components/sub-dialog';

export function SubcontractorsPage() {
  const { data, isLoading } = useSubcontractors();
  const { data: trades } = useTrades();
  const [quick, setQuick] = React.useState(false);
  const [edit, setEdit] = React.useState<SubcontractorRow | null>(null);
  const [search, setSearch] = React.useState('');
  const [tradeFilter, setTradeFilter] = React.useState('');
  const [showInactive, setShowInactive] = React.useState(false);

  const list = (data ?? []).filter((s) => {
    if (!showInactive && !s.active) return false;
    if (tradeFilter && !s.tradeIds.includes(tradeFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [s.companyName, s.contactName, s.city, s.phone, ...s.tradeNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Subunternehmer"
        description="Externe Partner. Kein Login, keine Lizenzkosten – einfache Planungsressourcen."
        actions={
          <Button size="sm" onClick={() => setQuick(true)}>
            <Plus /> Sub anlegen
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, Ansprechpartner, Ort …"
            className="h-8 w-56 text-xs"
          />
          <Select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="">Alle Gewerke</option>
            {trades?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Inaktive zeigen
          </label>
          <span className="ml-auto text-2xs text-muted-foreground">{list.length} Einträge</span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Keine Subunternehmer gefunden"
            description="Ein SUB braucht nur einen Firmennamen – danach ist er sofort planbar."
            action={
              <Button size="sm" onClick={() => setQuick(true)}>
                <Plus /> SUB anlegen
              </Button>
            }
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => setEdit(s)}
                className={cn(
                  'rounded-lg border bg-card p-3 text-left transition hover:shadow-sm',
                  !s.active && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-medium">
                      {s.preferred ? (
                        <Star className="size-3.5 shrink-0 fill-ampel-gelb text-ampel-gelb" />
                      ) : null}
                      {s.companyName}
                    </p>
                    {s.contactName ? (
                      <p className="truncate text-xs text-muted-foreground">{s.contactName}</p>
                    ) : null}
                  </div>
                  {s.isDemo ? <Badge variant="grau">Demo</Badge> : null}
                  {!s.active ? <Badge variant="rot">inaktiv</Badge> : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {s.tradeNames.map((t) => {
                    const trade = trades?.find((x) => x.name === t);
                    return (
                      <Badge
                        key={t}
                        variant="outline"
                        style={trade ? { borderColor: trade.color, color: trade.color } : undefined}
                      >
                        {t}
                      </Badge>
                    );
                  })}
                </div>

                <div className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
                  {s.phone ? (
                    <p className="flex items-center gap-1">
                      <Phone className="size-3" /> {s.phone}
                    </p>
                  ) : null}
                  {s.email ? (
                    <p className="flex items-center gap-1 truncate">
                      <Mail className="size-3" /> {s.email}
                    </p>
                  ) : null}
                  {s.city ? <p>{[s.zip, s.city].filter(Boolean).join(' ')}</p> : null}
                  <p>
                    {s.crewSize ? `${s.crewSize} Mann` : 'Mannschaftsstärke unbekannt'}
                    {s.rating ? ` · Bewertung ${'★'.repeat(s.rating)}` : ''}
                  </p>
                  {s.note ? <p className="line-clamp-2">{s.note}</p> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SubAnlegenDialog open={quick} onOpenChange={setQuick} />
      <SubDialog sub={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function SubDialog({ sub, onClose }: { sub: SubcontractorRow | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: trades } = useTrades();
  const [form, setForm] = React.useState<SubcontractorRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setForm(sub);
    setError(null);
  }, [sub]);

  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['subcontractors'] });
    queryClient.invalidateQueries({ queryKey: ['board'] });
    toast({ title: message, tone: 'success' });
    onClose();
  };

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ message: string }>(`/api/subcontractors/${sub!.id}`, {
        companyName: form!.companyName,
        contactName: form!.contactName,
        phone: form!.phone,
        email: form!.email,
        street: form!.street,
        zip: form!.zip,
        city: form!.city,
        note: form!.note,
        active: form!.active,
        preferred: form!.preferred,
        rating: form!.rating,
        crewSize: form!.crewSize,
        tradeIds: form!.tradeIds,
      }),
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ message: string }>(`/api/subcontractors/${sub!.id}`),
    onSuccess: (res) => done(res.message),
    onError: (e: Error) => setError(e.message),
  });

  if (!sub || !form) return null;
  const set = <K extends keyof SubcontractorRow>(k: K, v: SubcontractorRow[K]) =>
    setForm({ ...form, [k]: v });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{sub.companyName}</DialogTitle>
        <DialogDescription>Stammdaten des Subunternehmers.</DialogDescription>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Firmenname *">
              <Input
                value={form.companyName}
                onChange={(e) => set('companyName', e.target.value)}
              />
            </Field>
            <Field label="Ansprechpartner">
              <Input
                value={form.contactName ?? ''}
                onChange={(e) => set('contactName', e.target.value)}
              />
            </Field>
            <Field label="Telefon">
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="E-Mail">
              <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
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
            <Field label="Mannschaftsstärke">
              <Input
                type="number"
                min={0}
                value={form.crewSize ?? ''}
                onChange={(e) => set('crewSize', e.target.value ? Number(e.target.value) : null)}
              />
            </Field>
            <Field label="Interne Bewertung">
              <Select
                value={form.rating ? String(form.rating) : ''}
                onChange={(e) => set('rating', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">– keine –</option>
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={r}>
                    {'★'.repeat(r)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Gewerke">
            <div className="flex flex-wrap gap-1 rounded-md border p-2">
              {trades?.map((t) => {
                const on = form.tradeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      set(
                        'tradeIds',
                        on ? form.tradeIds.filter((id) => id !== t.id) : [...form.tradeIds, t.id],
                      )
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
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>

          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.preferred}
                onChange={(e) => set('preferred', e.target.checked)}
              />
              Bevorzugter Partner
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set('active', e.target.checked)}
              />
              Aktiv
            </label>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex items-center justify-between gap-2 pt-1">
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
