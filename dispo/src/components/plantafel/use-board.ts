'use client';
import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { addDays, todayIso, type IsoDate } from '@/lib/dates';
import { resolveRange, type BoardRange } from '@/lib/board-range';
import type { BoardResponse } from '@/lib/types';

export type BoardView = 'baustellen' | 'ressourcen';
export type { BoardRange };
export { resolveRange };

export interface BoardFilterState {
  bauleiter: string[];
  status: string[];
  mitarbeiter: string[];
  sub: string[];
  ampel: string[];
  ort: string;
  nurProbleme: boolean;
  abgeschlossen: boolean;
}

export const EMPTY_FILTERS: BoardFilterState = {
  bauleiter: [],
  status: [],
  mitarbeiter: [],
  sub: [],
  ampel: [],
  ort: '',
  nurProbleme: false,
  abgeschlossen: false,
};

export function countActiveFilters(f: BoardFilterState) {
  return (
    f.bauleiter.length +
    f.status.length +
    f.mitarbeiter.length +
    f.sub.length +
    f.ampel.length +
    (f.ort ? 1 : 0) +
    (f.nurProbleme ? 1 : 0) +
    (f.abgeschlossen ? 1 : 0)
  );
}

// Geblättert wird immer wochenweise – auch in der rollenden Sieben-Tage-
// Ansicht. Wer „weiter" drückt, denkt in Wochen, nicht in einzelnen Tagen.
const STEP: Record<BoardRange, number> = {
  tag: 1,
  sieben: 7,
  woche: 7,
  zweiwochen: 14,
  monat: 0,
};

/**
 * Plantafel-Zustand liegt in der URL: damit ist jede Ansicht teilbar,
 * der Zurück-Button funktioniert und ein Reload verliert nichts.
 */
export function useBoardState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const anchor = params.get('datum') || todayIso();
  const view = (params.get('ansicht') as BoardView) || 'baustellen';
  const range = (params.get('zeitraum') as BoardRange) || 'woche';

  const filters = React.useMemo<BoardFilterState>(
    () => ({
      bauleiter: splitParam(params.get('bauleiter')),
      status: splitParam(params.get('status')),
      mitarbeiter: splitParam(params.get('mitarbeiter')),
      sub: splitParam(params.get('sub')),
      ampel: splitParam(params.get('ampel')),
      ort: params.get('ort') ?? '',
      nurProbleme: params.get('nurProbleme') === '1',
      abgeschlossen: params.get('abgeschlossen') === '1',
    }),
    [params],
  );

  const setParams = React.useCallback(
    (patch: Record<string, string | string[] | boolean | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === false || value === '' || (Array.isArray(value) && !value.length)) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          next.set(key, value.join(','));
        } else if (typeof value === 'boolean') {
          next.set(key, '1');
        } else {
          next.set(key, value);
        }
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const { from, to } = resolveRange(range, anchor);

  const shift = React.useCallback(
    (direction: -1 | 1) => {
      if (range === 'monat') {
        const [y, m] = anchor.split('-').map(Number);
        const d = new Date(y, m - 1 + direction, 1, 12);
        setParams({
          datum: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        });
        return;
      }
      setParams({ datum: addDays(anchor, STEP[range] * direction) });
    },
    [anchor, range, setParams],
  );

  const queryString = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set('datum', anchor);
    p.set('zeitraum', range);
    if (filters.bauleiter.length) p.set('bauleiter', filters.bauleiter.join(','));
    if (filters.status.length) p.set('status', filters.status.join(','));
    if (filters.mitarbeiter.length) p.set('mitarbeiter', filters.mitarbeiter.join(','));
    if (filters.sub.length) p.set('sub', filters.sub.join(','));
    if (filters.ampel.length) p.set('ampel', filters.ampel.join(','));
    if (filters.ort) p.set('ort', filters.ort);
    if (filters.nurProbleme) p.set('nurProbleme', '1');
    if (filters.abgeschlossen) p.set('abgeschlossen', '1');
    return p.toString();
  }, [anchor, range, filters]);

  return {
    anchor,
    view,
    range,
    filters,
    from,
    to,
    setParams,
    shift,
    queryString,
    goToday: () => setParams({ datum: todayIso() }),
    setView: (v: BoardView) => setParams({ ansicht: v === 'baustellen' ? null : v }),
    setRange: (r: BoardRange) => setParams({ zeitraum: r === 'woche' ? null : r }),
    setFilters: (patch: Partial<BoardFilterState>) =>
      setParams({
        bauleiter: patch.bauleiter ?? filters.bauleiter,
        status: patch.status ?? filters.status,
        mitarbeiter: patch.mitarbeiter ?? filters.mitarbeiter,
        sub: patch.sub ?? filters.sub,
        ampel: patch.ampel ?? filters.ampel,
        ort: patch.ort ?? filters.ort,
        nurProbleme: patch.nurProbleme ?? filters.nurProbleme,
        abgeschlossen: patch.abgeschlossen ?? filters.abgeschlossen,
      }),
    resetFilters: () =>
      setParams({
        bauleiter: null,
        status: null,
        mitarbeiter: null,
        sub: null,
        ampel: null,
        ort: null,
        nurProbleme: null,
        abgeschlossen: null,
      }),
  };
}

export function useBoardQuery(queryString: string) {
  return useQuery({
    queryKey: ['board', queryString],
    queryFn: () => api.get<BoardResponse>(`/api/board?${queryString}`),
    placeholderData: (prev) => prev,
  });
}

function splitParam(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}
