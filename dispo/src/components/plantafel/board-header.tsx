'use client';
import { cn } from '@/lib/utils';
import { MassZieher, type BoardMasse } from './masse';
import { feiertagName } from '@/lib/feiertage';
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
  masse,
  onMass,
  dense,
}: {
  days: IsoDate[];
  firstColumnLabel: string;
  masse: BoardMasse;
  onMass: (art: keyof BoardMasse, wert: number) => void;
  dense?: boolean;
}) {
  const today = todayIso();
  return (
    <thead className="board-sticky-head">
      <tr>
        {/*
          Die Ecke traegt beide Griffe: rechts die Breite der linken Spalte,
          unten die Zeilenhoehe. Beide liegen auf der Kante, die sie
          verschieben - da sucht man sie.
        */}
        <th
          className="board-sticky-corner relative border-b border-r px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ width: 'var(--board-spalte)', minWidth: 'var(--board-spalte)' }}
        >
          {firstColumnLabel}
          <MassZieher art="spalte" wert={masse.spalte} onAendern={onMass} />
          <MassZieher art="zeile" wert={masse.zeile} onAendern={onMass} />
        </th>
        {days.map((day, index) => {
          const isToday = day === today;
          const weekStart = weekdayIndex(day) === 1;
          // Wer am Feiertag einplant, merkt das sonst erst, wenn niemand
          // kommt. Also steht er da, wo man ihn nicht uebersehen kann.
          const feiertag = feiertagName(day);
          return (
            <th
              key={day}
              className={cn(
                'relative border-b border-l px-1 py-1.5 text-center font-medium',
                dense ? 'text-2xs' : 'text-xs',
                isWeekend(day) && 'bg-muted/40 text-muted-foreground',
                feiertag && 'bg-ampel-rot/10 text-muted-foreground',
                isToday && 'bg-primary/10',
                weekStart && 'border-l-2 border-l-border',
              )}
              style={{ minWidth: dense ? '2.25rem' : 'var(--board-tag)' }}
            >
              {/* Ein Griff genuegt: Alle Tagesspalten sind gleich breit. */}
              {index === 0 && !dense ? (
                <MassZieher art="tag" wert={masse.tag} onAendern={onMass} />
              ) : null}
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
              {feiertag ? (
                <span
                  className="block truncate text-[0.6rem] font-medium leading-tight text-ampel-rot"
                  title={feiertag}
                >
                  {dense ? '★' : feiertag}
                </span>
              ) : weekStart && days.length > 7 ? (
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
