'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { WarningDTO } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Zähler in der Navigation.
 *
 * Gezählt wird nur, was JETZT dran ist – kritische Punkte und alles, was
 * heute ansteht. Hinweise auf Baustellen, die erst in drei Wochen beginnen,
 * gehören in die Liste, aber nicht in eine rote Zahl: eine Warnung, die
 * immer leuchtet, sieht man nach zwei Tagen nicht mehr.
 */
export function OpenPointsBadge() {
  const { data } = useQuery({
    queryKey: ['warnings'],
    queryFn: () => api.get<{ warnings: WarningDTO[] }>('/api/warnings'),
    refetchInterval: 60_000,
  });

  const warnings = data?.warnings ?? [];
  const kritisch = warnings.filter((w) => w.severity === 'KRITISCH').length;
  const faellig = warnings.filter((w) => w.bucket === 'KRITISCH' || w.bucket === 'HEUTE').length;

  if (faellig === 0) return null;

  return (
    <span
      title={
        kritisch > 0
          ? `${kritisch} kritisch, ${faellig} heute zu erledigen`
          : `${faellig} heute zu erledigen`
      }
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
        kritisch > 0
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-ampel-gelb/25 text-[hsl(41_94%_28%)] dark:text-ampel-gelb',
      )}
    >
      {faellig}
    </span>
  );
}
