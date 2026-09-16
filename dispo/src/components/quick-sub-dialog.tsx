'use client';
/**
 * Schnellanlage eines Subunternehmers (Master-Prompt Abschnitt 36).
 * Pflichtfeld ist ausschliesslich der Firmenname – danach sofort planbar.
 */
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useTrades } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export function QuickSubDialog({
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

  const [companyName, setCompanyName] = React.useState('');
  const [tradeId, setTradeId] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCompanyName('');
      setTradeId('');
      setPhone('');
      setEmail('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ subcontractor: { id: string; companyName: string }; message: string }>(
        '/api/subcontractors',
        {
          companyName,
          tradeIds: tradeId ? [tradeId] : [],
          phone: phone || null,
          email: email || null,
        },
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['subcontractors'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast({ title: res.message, tone: 'success' });
      onCreated?.(res.subcontractor.id);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Subunternehmer schnell anlegen</DialogTitle>
        <DialogDescription>
          Nur der Firmenname ist Pflicht. Alles Weitere lässt sich später ergänzen.
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!companyName.trim()) {
              setError('Bitte einen Firmennamen eingeben.');
              return;
            }
            mutation.mutate();
          }}
        >
          <Field label="Firmenname *">
            <Input
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="z. B. Elektro Müller GmbH"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Gewerk">
              <Select value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
                <option value="">– keines –</option>
                {trades?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Telefon">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>

          <Field label="E-Mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              <Plus /> Anlegen &amp; planen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
