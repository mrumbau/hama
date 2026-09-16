'use client';
import { cn } from '@/lib/utils';
import {
  formatDay,
  isoWeek,
  isWeekend,
  todayIso,
  WEEKDAY_SHORT,
  weekdayIndex,
  type IsoDate,
} from '@/lib/dates';

/** Sticky Kopfzeile mit den Tagen. */
export function BoardHeader({
  days,
  firstColumnLabel,
  firstColumnWidth,
  dense,
}: {
  days: IsoDate[];
  firstColumnLabel: string;
  firstColumnWidth: string;
  dense?: boolean;
}) {
  const today = todayIso();
  return (
    <thead className="board-sticky-head">
      <tr>
        <th
          className={cn(
            'board-sticky-corner border-b border-r px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
            firstColumnWidth,
          )}
        >
          {firstColumnLabel}
        </th>
        {days.map((day) => {
          const isToday = day === today;
          const weekStart = weekdayIndex(day) === 1;
          return (
            <th
              key={day}
              className={cn(
                'border-b border-l px-1 py-1.5 text-center font-medium',
                dense ? 'text-2xs' : 'text-xs',
                isWeekend(day) && 'bg-muted/40 text-muted-foreground',
                isToday && 'bg-primary/10',
                weekStart && 'border-l-2 border-l-border',
              )}
              style={{ minWidth: dense ? '2.25rem' : '6rem' }}
            >
              <span className={cn('block leading-tight', isToday && 'font-bold text-primary')}>
                {WEEKDAY_SHORT[weekdayIndex(day)]}
              </span>
              <span
                className={cn(
                  'block text-2xs leading-tight',
                  isToday ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {formatDay(day)}
              </span>
              {weekStart && days.length > 7 ? (
                <span className="block text-[0.6rem] leading-tight text-muted-foreground">
                  KW{isoWeek(day)}
                </span>
              ) : null}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
