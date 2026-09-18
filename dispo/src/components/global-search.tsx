'use client';
/**
 * Globale Suche (Master-Prompt 26). Öffnet mit Strg/Cmd+K oder "/",
 * liefert Treffer aus Projekten, Personen, SUBs und Telefonaten.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import type { SearchHit } from '@/app/api/search/route';
import { cn } from '@/lib/utils';
import { KeyHint } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';

const TYPE_LABEL: Record<SearchHit['type'], string> = {
  projekt: 'Projekt',
  mitarbeiter: 'Mitarbeiter',
  bauleiter: 'Bauleiter',
  sub: 'SUB',
  telefonat: 'Telefonat',
};

export function GlobalSearch() {
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const debounced = useDebounced(value, 180);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
    staleTime: 10_000,
  });

  const hits = data?.hits ?? [];

  React.useEffect(() => setActive(0), [debounced]);

  // Tastaturkürzel: Strg/Cmd+K und "/".
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT');

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setValue('');
    router.push(hit.href);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && hits[active]) {
              e.preventDefault();
              go(hits[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Kunde, Projekt, Auftragsnummer, Adresse, Mitarbeiter, SUB, Telefonnummer …"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-16 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isFetching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          <KeyHint>⌘K</KeyHint>
        </div>
      </div>

      {open && debounced.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[60vh] overflow-auto rounded-lg border bg-popover p-1 shadow-xl">
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {isFetching ? 'Wird gesucht …' : `Keine Treffer für „${debounced}“.`}
            </p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.type}-${hit.id}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(hit)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  i === active ? 'bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <Badge variant="outline" className="mt-0.5 shrink-0">
                  {TYPE_LABEL[hit.type]}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{hit.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {hit.subtitle}
                  </span>
                  {hit.meta ? (
                    <span className="block truncate text-2xs text-muted-foreground">
                      {hit.meta}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
