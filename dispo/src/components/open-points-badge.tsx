'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { WarningDTO } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Kleiner Zähler in der Navigation – zeigt kritische Punkte rot. */
export function OpenPointsBadge() {
  const { data } = useQuery({
    queryKey: ['warnings'],
    queryFn: () => api.get<{ warnings: WarningDTO[] }>('/api/warnings'),
    refetchInterval: 60_000,
  });

  const warnings = data?.warnings ?? [];
  if (warnings.length === 0) return null;
  const kritisch = warnings.filter((w) => w.severity === 'KRITISCH').length;

  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
        kritisch > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {warnings.length}
    </span>
  );
}
