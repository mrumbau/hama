'use client';
import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isWeekend, todayIso, type IsoDate } from '@/lib/dates';

/** Eine Tageszelle der Plantafel – gleichzeitig Drop-Ziel. */
export function BoardCell({
  id,
  date,
  children,
  onQuickAdd,
  className,
  dense,
}: {
  id: string;
  date: IsoDate;
  children?: React.ReactNode;
  onQuickAdd?: () => void;
  className?: string;
  dense?: boolean;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data: { date } });
  const today = date === todayIso();

  return (
    <td
      ref={setNodeRef}
      /*
       * Der Tag am Element: Beim Aufziehen eines Einsatzes ueber mehrere
       * Tage muss der Zeiger wissen, ueber welchem Tag er gerade steht.
       * dnd-kit hilft dabei nicht - das ist kein Ziehen und Fallenlassen,
       * sondern ein Aufziehen der Kante.
       */
      data-day={date}
      className={cn(
        'group/cell relative border-b border-l align-top transition-colors',
        dense ? 'p-0.5' : 'p-1',
        isWeekend(date) && 'bg-muted/40',
        today && 'bg-accent/40',
        isOver && 'bg-primary/10 ring-1 ring-inset ring-primary',
        className,
      )}
    >
      {/*
        Die Hoehe kommt aus den Maßen, die der Benutzer gezogen hat. In der
        gedraengten Ansicht bleibt es bei der festen kleinen Hoehe - dort
        geht es gerade darum, moeglichst viel auf einen Bildschirm zu
        bekommen.
      */}
      <div
        className={cn('flex flex-col gap-0.5', dense && 'min-h-[1.75rem]')}
        style={dense ? undefined : { minHeight: 'var(--board-zeile, 2.25rem)' }}
      >
        {children}
      </div>
      {onQuickAdd && !active ? (
        <button
          type="button"
          onClick={onQuickAdd}
          className="absolute inset-x-0 bottom-0 hidden items-center justify-center py-0.5 text-muted-foreground transition hover:text-foreground group-hover/cell:flex"
          aria-label="Ressource einplanen"
        >
          <Plus className="size-3" />
        </button>
      ) : null}
    </td>
  );
}
