'use client';
import * as React from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  RotateCcw,
  Sun,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatDateShort,
  formatDayLong,
  isoWeek,
  MONTH_LONG,
  todayIso,
  type IsoDate,
} from '@/lib/dates';
import { PROJECT_STATUS_KEYS, PROJECT_STATUS_LABEL, TRAFFIC_LIGHT_LABEL } from '@/lib/labels';
import type { BoardResponse } from '@/lib/types';
import {
  countActiveFilters,
  type BoardFilterState,
  type BoardRange,
  type BoardView,
} from './use-board';

const RANGE_LABEL: Record<BoardRange, string> = {
  tag: 'Tag',
  sieben: '7 Tage',
  woche: 'Woche',
  zweiwochen: '2 Wochen',
  monat: 'Monat',
};

export function BoardToolbar({
  view,
  range,
  anchor,
  from,
  to,
  filters,
  board,
  onView,
  onRange,
  onShift,
  onToday,
  onAnchor,
  onFilters,
  onResetFilters,
  showInactive,
  onShowInactive,
  onMorgenansicht,
}: {
  view: BoardView;
  range: BoardRange;
  anchor: IsoDate;
  from: IsoDate;
  to: IsoDate;
  filters: BoardFilterState;
  board?: BoardResponse;
  onView: (v: BoardView) => void;
  onRange: (r: BoardRange) => void;
  onShift: (dir: -1 | 1) => void;
  onToday: () => void;
  onAnchor: (date: IsoDate) => void;
  onFilters: (patch: Partial<BoardFilterState>) => void;
  onResetFilters: () => void;
  showInactive: boolean;
  onShowInactive: (v: boolean) => void;
  onMorgenansicht: () => void;
}) {
  const activeFilters = countActiveFilters(filters);
  const managers = (board?.resources ?? []).filter((r) => r.gruppe === 'BAULEITER');
  const employees = (board?.resources ?? []).filter((r) => r.gruppe === 'MITARBEITER');
  const subs = (board?.resources ?? []).filter((r) => r.gruppe === 'SUBUNTERNEHMER');

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-3 py-2">
      {/* Ansicht */}
      <Tabs value={view} onValueChange={(v) => onView(v as BoardView)}>
        <TabsList>
          <TabsTrigger value="baustellen">
            <LayoutGrid className="mr-1 size-3.5" /> Baustellen
          </TabsTrigger>
          <TabsTrigger value="ressourcen">
            <Users className="mr-1 size-3.5" /> Ressourcen
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <span className="mx-1 h-5 w-px bg-border" />

      {/* Zeitraum-Navigation */}
      <div className="flex items-center gap-0.5">
        <Button variant="outline" size="icon-sm" onClick={() => onShift(-1)} aria-label="Zurück">
          <ChevronLeft />
        </Button>
        <Button variant={anchor === todayIso() ? 'default' : 'outline'} size="sm" onClick={onToday}>
          Heute
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => onShift(1)} aria-label="Weiter">
          <ChevronRight />
        </Button>
      </div>

      <Select
        value={range}
        onChange={(e) => onRange(e.target.value as BoardRange)}
        className="h-8 w-auto text-xs"
        aria-label="Zeitraum"
      >
        {(Object.keys(RANGE_LABEL) as BoardRange[]).map((r) => (
          <option key={r} value={r}>
            {RANGE_LABEL[r]}
          </option>
        ))}
      </Select>

      <MonatsSprung anchor={anchor} onAnchor={onAnchor} />

      <span className="hidden min-w-0 px-1 text-xs text-muted-foreground sm:block">
        {rangeCaption(range, from, to)}
      </span>

      <span className="mx-1 h-5 w-px bg-border" />

      {/* „Nur Probleme“ – der wichtigste Filter */}
      <Button
        variant={filters.nurProbleme ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => onFilters({ nurProbleme: !filters.nurProbleme })}
      >
        <TriangleAlert /> Nur Probleme
      </Button>

      <Button variant="outline" size="sm" onClick={onMorgenansicht} title="Morgenansicht für heute">
        <Sun /> Heute-Übersicht
      </Button>

      {/* Filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={activeFilters ? 'secondary' : 'outline'} size="sm">
            <Filter /> Filter
            {activeFilters ? (
              <Badge variant="primary" className="ml-0.5">
                {activeFilters}
              </Badge>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-auto">
          <DropdownMenuLabel>Bauleiter</DropdownMenuLabel>
          {managers.length === 0 ? (
            <p className="px-2 py-1 text-2xs text-muted-foreground">Keine Bauleiter angelegt.</p>
          ) : (
            managers.map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={filters.bauleiter.includes(m.id)}
                onCheckedChange={() => onFilters({ bauleiter: toggle(filters.bauleiter, m.id) })}
                onSelect={(e) => e.preventDefault()}
              >
                {m.label}
              </DropdownMenuCheckboxItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Ampel</DropdownMenuLabel>
          {(['ROT', 'GELB', 'GRUEN', 'GRAU'] as const).map((light) => (
            <DropdownMenuCheckboxItem
              key={light}
              checked={filters.ampel.includes(light)}
              onCheckedChange={() => onFilters({ ampel: toggle(filters.ampel, light) })}
              onSelect={(e) => e.preventDefault()}
            >
              {TRAFFIC_LIGHT_LABEL[light]}
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Projektstatus</DropdownMenuLabel>
          {PROJECT_STATUS_KEYS.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filters.status.includes(status)}
              onCheckedChange={() => onFilters({ status: toggle(filters.status, status) })}
              onSelect={(e) => e.preventDefault()}
            >
              {PROJECT_STATUS_LABEL[status]}
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Mitarbeiter</DropdownMenuLabel>
          {employees.map((e) => (
            <DropdownMenuCheckboxItem
              key={e.id}
              checked={filters.mitarbeiter.includes(e.id)}
              onCheckedChange={() => onFilters({ mitarbeiter: toggle(filters.mitarbeiter, e.id) })}
              onSelect={(ev) => ev.preventDefault()}
            >
              {e.label}
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Subunternehmer</DropdownMenuLabel>
          {subs.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.id}
              checked={filters.sub.includes(s.id)}
              onCheckedChange={() => onFilters({ sub: toggle(filters.sub, s.id) })}
              onSelect={(e) => e.preventDefault()}
            >
              {s.label}
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Ort</DropdownMenuLabel>
          <div className="px-1.5 pb-1.5">
            <Input
              value={filters.ort}
              onChange={(e) => onFilters({ ort: e.target.value })}
              placeholder="z. B. München"
              className="h-8 text-xs"
            />
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={filters.abgeschlossen}
            onCheckedChange={() => onFilters({ abgeschlossen: !filters.abgeschlossen })}
            onSelect={(e) => e.preventDefault()}
          >
            Abgeschlossene Projekte zeigen
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showInactive}
            onCheckedChange={() => onShowInactive(!showInactive)}
            onSelect={(e) => e.preventDefault()}
          >
            Inaktive Ressourcen zeigen
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeFilters ? (
        <Button variant="ghost" size="sm" onClick={onResetFilters}>
          <RotateCcw /> Zurücksetzen
        </Button>
      ) : null}

      <span className={cn('ml-auto hidden text-2xs text-muted-foreground md:block')}>
        {board ? `${board.projects.length} Baustellen · ${board.assignments.length} Einsätze` : ''}
      </span>
    </div>
  );
}

/**
 * Monat und Jahr direkt wählen.
 *
 * Das Datumsfeld des Browsers ist gut für „übermorgen" und schlecht für
 * „März 2028" – dorthin klickt man sich sonst durch zwanzig Monate. Zwei
 * Auswahlfelder sind hier schneller als jeder Kalender.
 */
function MonatsSprung({ anchor, onAnchor }: { anchor: IsoDate; onAnchor: (d: IsoDate) => void }) {
  const [jahr, monat] = anchor.split('-').map(Number);
  const heute = Number(todayIso().slice(0, 4));
  // Ein Jahr zurück genügt für Nachträge, fünf nach vorn für Rahmentermine.
  const jahre = Array.from({ length: 7 }, (_, i) => heute - 1 + i);

  const springe = (j: number, m: number) => {
    const letzterTag = new Date(j, m, 0).getDate();
    const tag = Math.min(Number(anchor.slice(8, 10)), letzterTag);
    onAnchor(`${j}-${String(m).padStart(2, '0')}-${String(tag).padStart(2, '0')}` as IsoDate);
  };

  return (
    <div className="flex items-center gap-0.5">
      <CalendarDays className="mr-0.5 size-3.5 text-muted-foreground" />
      <Select
        value={String(monat)}
        onChange={(e) => springe(jahr, Number(e.target.value))}
        className="h-8 w-auto text-xs"
        aria-label="Monat wählen"
      >
        {MONTH_LONG.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        value={String(jahr)}
        onChange={(e) => springe(Number(e.target.value), monat)}
        className="h-8 w-auto text-xs"
        aria-label="Jahr wählen"
      >
        {(jahre.includes(jahr) ? jahre : [jahr, ...jahre].sort()).map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </Select>
    </div>
  );
}

function rangeCaption(range: BoardRange, from: IsoDate, to: IsoDate) {
  if (range === 'tag') return formatDayLong(from);
  if (range === 'sieben') {
    return `7 Tage · ${formatDateShort(from)} – ${formatDateShort(to)}`;
  }
  if (range === 'monat') {
    const [y, m] = from.split('-').map(Number);
    return `${MONTH_LONG[m - 1]} ${y}`;
  }
  return `KW ${isoWeek(from)}${range === 'zweiwochen' ? `–${isoWeek(to)}` : ''} · ${formatDateShort(from)} – ${formatDateShort(to)}`;
}
