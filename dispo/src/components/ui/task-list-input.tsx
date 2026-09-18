'use client';
/**
 * Eingabe für die Tätigkeiten eines Einsatzes.
 *
 * Bewusst eine Liste statt eines Freitextfeldes: So steht auf der Plantafel
 * und später auf dem Zettel für die Baustelle jede Aufgabe für sich, und sie
 * lässt sich einzeln abhaken. Enter legt die nächste Zeile an – damit ist
 * die Eingabe so schnell wie Tippen.
 */
import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TaskListInput({
  value,
  onChange,
  placeholder = 'z. B. Trockenbauwände stellen',
}: {
  value: string[];
  onChange: (tasks: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...value, text]);
    setDraft('');
  };

  return (
    <div className="space-y-1.5">
      {value.length > 0 ? (
        <ul className="space-y-1">
          {value.map((task, i) => (
            <li key={`${task}-${i}`} className="flex items-center gap-1.5 rounded border bg-card px-2 py-1">
              <span className="min-w-0 flex-1 truncate text-xs">{task}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, index) => index !== i))}
                className="rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                aria-label={`„${task}" entfernen`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Enter darf nicht das ganze Formular abschicken.
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="icon-sm" onClick={add} disabled={!draft.trim()}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}
