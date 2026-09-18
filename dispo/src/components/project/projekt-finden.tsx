'use client';
/**
 * „Projekt finden" – die Suche über alles, was es gibt.
 *
 * Der Knopf hieß „Projekt anlegen", und das war die falsche erste Antwort:
 * Fast jedes Projekt steht schon in „Das Programm" und ist längst
 * übernommen – es steht nur nicht auf der Tafel, weil es dort einen Status
 * hat, der nicht angezeigt wird (Angebotserstellung, abgeschlossen). Wer
 * dann „anlegen" drückt, hat die Baustelle zweimal.
 *
 * Deshalb zuerst suchen, und erst wenn wirklich nichts da ist, anlegen.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { ProjectSummaryDTO } from '@/lib/types';
import { erpStatusName, PROJECT_STATUS_LABEL } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

/** Status, in denen ein Projekt nicht auf der Plantafel steht. */
const NICHT_AUF_DER_TAFEL = ['ERLEDIGT', 'FERTIG'];

export function ProjektFindenDialog({
  offen,
  onOffen,
  onAnlegen,
  onOeffnen,
}: {
  offen: boolean;
  onOffen: (offen: boolean) => void;
  /** „Nicht dabei" – dann doch von Hand anlegen. */
  onAnlegen: () => void;
  onOeffnen: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suche, setSuche] = React.useState('');

  // Ausdrücklich inklusive der abgeschlossenen: Genau die sucht man hier.
  const { data, isLoading } = useQuery({
    queryKey: ['projekt-finden'],
    queryFn: () =>
      api.get<{ projects: ProjectSummaryDTO[] }>('/api/projects?abgeschlossen=1&limit=500'),
    enabled: offen,
  });

  const aufDieTafel = useMutation({
    mutationFn: (id: string) =>
      api.patch<{ message: string }>(`/api/projects/${id}`, {
        status: 'TERMINIERUNG_ERFORDERLICH',
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['projekt-finden'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const alle = data?.projects ?? [];
  const begriff = suche.trim().toLowerCase();
  const treffer = begriff
    ? alle.filter((p) =>
        [p.customerName, p.name, p.projectNumber, p.orderNumber, p.city, p.street]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(begriff),
      )
    : alle;

  return (
    <Dialog open={offen} onOpenChange={onOffen}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Projekt finden</DialogTitle>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Kunde, Projekt, Auftragsnummer, Ort …"
            className="pl-8"
          />
        </div>

        <p className="text-2xs text-muted-foreground">
          Alle Projekte aus „Das Programm", auch die, die gerade nicht auf der Plantafel stehen.
        </p>

        <div className="max-h-[22rem] min-h-[8rem] space-y-1 overflow-auto">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Wird geladen …</p>
          ) : treffer.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Nichts gefunden. Wenn es das Projekt in „Das Programm" nicht gibt – etwa ein kleiner
              Auftrag für einen Tag – lässt es sich hier anlegen.
            </p>
          ) : (
            treffer.slice(0, 100).map((p) => {
              const abseits = NICHT_AUF_DER_TAFEL.includes(p.status);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md border p-2 text-xs transition hover:bg-accent/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.customerName}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {[p.projectNumber, p.name, p.city].filter(Boolean).join(' · ')}
                    </span>
                  </span>

                  <Badge variant={abseits ? 'grau' : 'gruen'}>
                    {PROJECT_STATUS_LABEL[p.status]}
                  </Badge>
                  {p.erpStatus ? (
                    <span
                      className="hidden shrink-0 text-2xs text-muted-foreground sm:inline"
                      title="Status in „Das Programm“"
                    >
                      {erpStatusName(p.erpStatus)}
                    </span>
                  ) : null}

                  {abseits ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aufDieTafel.isPending}
                      onClick={() => aufDieTafel.mutate(p.id)}
                    >
                      Auf die Tafel
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onOffen(false);
                        onOeffnen(p.id);
                      }}
                    >
                      Öffnen
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-2xs text-muted-foreground">
            {treffer.length} von {alle.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOffen(false);
              onAnlegen();
            }}
          >
            <Plus /> Nicht dabei – neu anlegen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
