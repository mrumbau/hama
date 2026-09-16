'use client';
/**
 * Offene Punkte (Master-Prompt Abschnitt 22).
 * Sortierung: kritisch → heute → diese Woche → später.
 */
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateShort } from '@/lib/dates';
import type { WarningBucket, WarningDTO } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';

const BUCKET_LABEL: Record<WarningBucket, string> = {
  KRITISCH: 'Kritisch',
  HEUTE: 'Heute',
  DIESE_WOCHE: 'Diese Woche',
  SPAETER: 'Später',
};

const BUCKET_ORDER: WarningBucket[] = ['KRITISCH', 'HEUTE', 'DIESE_WOCHE', 'SPAETER'];

export function OpenPointsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = React.useState(false);
  const [category, setCategory] = React.useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['warnings', showDone],
    queryFn: () =>
      api.get<{ warnings: WarningDTO[] }>(`/api/warnings${showDone ? '?erledigte=1' : ''}`),
  });

  const dismiss = useMutation({
    mutationFn: (vars: { key: string; dismissed: boolean }) =>
      api.post<{ message: string }>('/api/warnings', {
        warningKey: vars.key,
        dismissed: vars.dismissed,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      toast({ title: res.message, tone: 'info' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const all = data?.warnings ?? [];
  const categories = [...new Set(all.map((w) => w.category))].sort();
  const warnings = category ? all.filter((w) => w.category === category) : all;

  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: warnings.filter((w) => w.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Offene Punkte"
        description="Alles, was heute Aufmerksamkeit braucht – automatisch aus dem Datenstand berechnet."
        actions={
          <Button
            variant={showDone ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 w-auto text-xs"
          >
            <option value="">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <span className="ml-auto text-2xs text-muted-foreground">
            {warnings.filter((w) => !w.dismissed).length} offen
          </span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Keine offenen Punkte"
            description="Alle Baustellen sind vollständig geplant. Gut gemacht."
          />
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.bucket}>
                <h2 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {BUCKET_LABEL[group.bucket]}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums">
                    {group.items.length}
                  </span>
                </h2>
                <ul className="space-y-1.5">
                  {group.items.map((w) => (
                    <li
                      key={w.key}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border bg-card p-3 transition',
                        w.severity === 'KRITISCH' && !w.dismissed && 'border-ampel-rot/40 bg-ampel-rot/5',
                        w.severity === 'WARNUNG' && !w.dismissed && 'border-ampel-gelb/40',
                        w.dismissed && 'opacity-50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              w.severity === 'KRITISCH'
                                ? 'rot'
                                : w.severity === 'WARNUNG'
                                  ? 'gelb'
                                  : 'grau'
                            }
                          >
                            {w.category}
                          </Badge>
                          <span className="text-sm font-medium">{w.title}</span>
                          {w.date ? (
                            <span className="text-2xs tabular-nums text-muted-foreground">
                              {formatDateShort(w.date)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{w.detail}</p>
                        {w.href ? (
                          <Link
                            href={w.href}
                            className="mt-1 inline-block text-2xs font-medium text-primary hover:underline"
                          >
                            Öffnen →
                          </Link>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={w.dismissed ? 'Wieder öffnen' : 'Als erledigt markieren'}
                        onClick={() => dismiss.mutate({ key: w.key, dismissed: !w.dismissed })}
                      >
                        {w.dismissed ? <RotateCcw /> : <CheckCircle2 />}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
