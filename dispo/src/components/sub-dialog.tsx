'use client';
/**
 * Subunternehmer anlegen.
 *
 * Der Stammdatensatz gehört in „Das Programm“ – dort stehen die Lieferanten.
 * Deshalb wird hier alles erfasst, was dort hingehört, und der Betrieb
 * gleich mit übertragen. Klappt der Übertrag nicht, bleibt er hier trotzdem
 * planbar und trägt den Grund sichtbar mit sich.
 */
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useTrades } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface Antwort {
  subcontractor: { id: string; companyName: string };
  erp?: { versucht: boolean; erfolg: boolean; nachricht: string };
  message: string;
}

const LEER = {
  companyName: '',
  contactName: '',
  phone: '',
  email: '',
  street: '',
  zip: '',
  city: '',
  note: '',
  crewSize: '',
};

export function SubAnlegenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: trades } = useTrades();

  const [form, setForm] = React.useState(LEER);
  const [gewerkIds, setGewerkIds] = React.useState<string[]>([]);
  const [neuesGewerk, setNeuesGewerk] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(LEER);
      setGewerkIds([]);
      setNeuesGewerk('');
      setError(null);
    }
  }, [open]);

  const set = (key: keyof typeof LEER, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const gewerkNamen = (trades ?? []).filter((t) => gewerkIds.includes(t.id)).map((t) => t.name);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Antwort>('/api/subcontractors', {
        companyName: form.companyName.trim(),
        contactName: form.contactName || null,
        phone: form.phone || null,
        email: form.email || null,
        street: form.street || null,
        zip: form.zip || null,
        city: form.city || null,
        note: form.note || null,
        crewSize: form.crewSize || null,
        tradeIds: gewerkIds,
        tradeName: neuesGewerk.trim() || null,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['subcontractors'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      // Ein misslungener Übertrag ist keine Erfolgsmeldung – der Ton sagt es.
      toast({
        title: res.message,
        tone: res.erp?.versucht && !res.erp.erfolg ? 'warning' : 'success',
        duration: res.erp?.versucht && !res.erp.erfolg ? 9000 : 5000,
      });
      onCreated?.(res.subcontractor.id);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const absenden = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      setError('Der Firmenname fehlt.');
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Subunternehmer anlegen</DialogTitle>
        <DialogDescription>
          Wird zugleich in „Das Programm“ unter den Lieferanten angelegt – mit der Kennzeichnung{' '}
          <em>Subunternehmer</em> und den Gewerken im Notizfeld.
        </DialogDescription>

        <form onSubmit={absenden} className="space-y-3">
          <Field label="Firma">
            <Input
              autoFocus
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder="z. B. Trockenbau Huber"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ansprechpartner">
              <Input
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                placeholder="z. B. Josef Huber"
              />
            </Field>
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                inputMode="tel"
                placeholder="+49 …"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-Mail">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Mannschaftsstärke" hint="Wie viele Leute kommen üblicherweise?">
              <Input
                value={form.crewSize}
                onChange={(e) => set('crewSize', e.target.value)}
                inputMode="numeric"
                placeholder="z. B. 4"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
            <Field label="Straße und Hausnummer">
              <Input value={form.street} onChange={(e) => set('street', e.target.value)} />
            </Field>
            <Field label="PLZ">
              <Input
                value={form.zip}
                onChange={(e) => set('zip', e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Ort">
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
          </div>

          <Gewerkwahl
            trades={trades ?? []}
            ausgewaehlt={gewerkIds}
            onAendern={setGewerkIds}
            neuesGewerk={neuesGewerk}
            onNeuesGewerk={setNeuesGewerk}
          />

          <Field label="Notizen" hint="Was macht der Betrieb, worauf ist zu achten?">
            <Textarea
              rows={3}
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="z. B. Freigabe liegt vor, Unbedenklichkeitsbescheinigung fehlt"
            />
          </Field>

          {gewerkNamen.length > 0 || neuesGewerk.trim() ? (
            <p className="rounded-md border bg-muted/40 p-2 text-2xs text-muted-foreground">
              In Das Programm steht dann:{' '}
              <code>
                Subunternehmer – {[...gewerkNamen, neuesGewerk.trim()].filter(Boolean).join(', ')}
              </code>
            </p>
          ) : null}

          {error ? <p className="text-xs text-rot-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              <Building2 /> {mutation.isPending ? 'Wird angelegt …' : 'Anlegen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Mehrere Gewerke auswählen – ein Betrieb kann mehr als eines abdecken. */
function Gewerkwahl({
  trades,
  ausgewaehlt,
  onAendern,
  neuesGewerk,
  onNeuesGewerk,
}: {
  trades: { id: string; name: string }[];
  ausgewaehlt: string[];
  onAendern: (ids: string[]) => void;
  neuesGewerk: string;
  onNeuesGewerk: (v: string) => void;
}) {
  const [zusatz, setZusatz] = React.useState('');

  const umschalten = (id: string) =>
    onAendern(
      ausgewaehlt.includes(id) ? ausgewaehlt.filter((x) => x !== id) : [...ausgewaehlt, id],
    );

  return (
    <Field label="Gewerke" hint="Mehrfachauswahl – anklicken zum Hinzufügen">
      <div className="space-y-2">
        <div className="flex max-h-32 flex-wrap gap-1 overflow-auto rounded-md border p-2">
          {trades.length === 0 ? (
            <span className="text-2xs text-muted-foreground">Noch keine Gewerke angelegt.</span>
          ) : (
            trades.map((t) => {
              const an = ausgewaehlt.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => umschalten(t.id)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-2xs transition',
                    an
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary hover:text-primary',
                  )}
                >
                  {t.name}
                  {an ? <X className="ml-1 inline size-2.5" /> : null}
                </button>
              );
            })
          )}
        </div>

        {neuesGewerk ? (
          <div className="flex items-center gap-1 text-2xs">
            <span className="rounded-full border border-primary bg-primary px-2 py-0.5 text-primary-foreground">
              {neuesGewerk}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onNeuesGewerk('')}
            >
              entfernen
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Input
              value={zusatz}
              onChange={(e) => setZusatz(e.target.value)}
              placeholder="Neues Gewerk …"
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (zusatz.trim()) {
                    onNeuesGewerk(zusatz.trim());
                    setZusatz('');
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (zusatz.trim()) {
                  onNeuesGewerk(zusatz.trim());
                  setZusatz('');
                }
              }}
            >
              <Plus />
            </Button>
          </div>
        )}
      </div>
    </Field>
  );
}
