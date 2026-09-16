'use client';
/**
 * Morgenansicht (Master-Prompt Abschnitt 47).
 * Ein Blick, eine Minute: Wer ist heute wo, wo brennt es, was kam rein?
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, Loader2, Phone } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDayLong, todayIso } from '@/lib/dates';
import type { BoardResponse, WarningDTO } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AmpelDot } from '@/components/ui/ampel';
import { EmptyState } from '@/components/ui/misc';
import { RESOURCE_TYPE_LABEL } from '@/lib/labels';

export function MorningDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = todayIso();

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', `datum=${today}&zeitraum=tag`],
    queryFn: () => api.get<BoardResponse>(`/api/board?datum=${today}&zeitraum=tag`),
    enabled: open,
  });

  const { data: warningData } = useQuery({
    queryKey: ['warnings'],
    queryFn: () => api.get<{ warnings: WarningDTO[] }>('/api/warnings'),
    enabled: open,
  });

  const heuteAktiv = (board?.projects ?? []).filter((p) =>
    board?.assignments.some((a) => a.projectId === p.id),
  );
  const probleme = (warningData?.warnings ?? []).filter(
    (w) => w.severity === 'KRITISCH' || w.bucket === 'HEUTE',
  );
  const telefonate = (warningData?.warnings ?? []).filter((w) => w.category === 'Kommunikation');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
        <DialogTitle>Heute-Übersicht</DialogTitle>
        <DialogDescription>{formatDayLong(today)}</DialogDescription>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Wird geladen …
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Heute aktive Baustellen ({heuteAktiv.length})
              </h3>
              {heuteAktiv.length === 0 ? (
                <EmptyState title="Heute ist keine Baustelle eingeplant." />
              ) : (
                <ul className="space-y-1.5">
                  {heuteAktiv.map((p) => {
                    const items = (board?.assignments ?? []).filter((a) => a.projectId === p.id);
                    const gruppen = (['BAULEITER', 'MITARBEITER', 'SUBUNTERNEHMER', 'UNBESETZT'] as const)
                      .map((type) => ({
                        type,
                        names: items
                          .filter((a) => a.resourceType === type)
                          .map((a) => a.resourceLabel),
                      }))
                      .filter((g) => g.names.length > 0);

                    return (
                      <li key={p.id} className="rounded-md border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <AmpelDot light={p.trafficLight} />
                          <Link
                            href={`/plantafel?projekt=${p.id}`}
                            className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                          >
                            {p.customerName} – {p.name}
                          </Link>
                          {p.city ? (
                            <span className="shrink-0 text-2xs text-muted-foreground">{p.city}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {gruppen.map((g) => (
                            <span key={g.type} className="text-2xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {RESOURCE_TYPE_LABEL[g.type]}:
                              </span>{' '}
                              {g.names.join(', ')}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="size-3.5" /> Probleme ({probleme.length})
              </h3>
              {probleme.length === 0 ? (
                <p className="rounded-md bg-ampel-gruen/10 px-3 py-2 text-xs text-ampel-gruen">
                  Keine kritischen Punkte für heute.
                </p>
              ) : (
                <ul className="space-y-1">
                  {probleme.slice(0, 10).map((w) => (
                    <li key={w.key} className="rounded-md border px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={w.severity === 'KRITISCH' ? 'rot' : 'gelb'}>
                          {w.category}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{w.title}</span>
                      </div>
                      <p className="text-2xs text-muted-foreground">{w.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Phone className="size-3.5" /> Offene Telefonhinweise ({telefonate.length})
              </h3>
              {telefonate.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nichts Offenes aus der Kommunikation.</p>
              ) : (
                <ul className="space-y-1">
                  {telefonate.slice(0, 8).map((w) => (
                    <li key={w.key} className="rounded-md border px-3 py-1.5">
                      <Link href={w.href ?? '/kommunikation'} className="text-xs font-medium hover:underline">
                        {w.title}
                      </Link>
                      <p className="text-2xs text-muted-foreground">{w.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
