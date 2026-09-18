'use client';
/**
 * Schlanker Toast-Stack mit Undo (Master-Prompt Abschnitt 7).
 *
 * Nach einem Drag & Drop wird sofort gespeichert und unten erscheint
 * "Luigi wurde von Dienstag 08.09. auf Mittwoch 09.09. verschoben." –
 * inklusive Rueckgaengig-Button fuer einige Sekunden.
 */
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, Undo2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Anzeigedauer in ms. 0 = bleibt stehen. */
  duration?: number;
  undo?: () => void | Promise<void>;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb von <ToastProvider> benutzt werden.');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      // Undo braucht Zeit zum Lesen und Klicken.
      const duration = options.duration ?? (options.undo ? 8000 : 4000);
      setItems((prev) => [...prev.slice(-4), { ...options, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-start sm:pl-6">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
} as const;

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'text-primary',
  success: 'text-ampel-gruen',
  warning: 'text-ampel-gelb',
  error: 'text-destructive',
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const Icon = TONE_ICON[item.tone ?? 'info'];

  return (
    <div className="pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-3 rounded-lg border bg-card p-3 shadow-lg">
      <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_CLASS[item.tone ?? 'info'])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        ) : null}
      </div>
      {item.undo ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await item.undo!();
            } finally {
              onDismiss();
            }
          }}
        >
          <Undo2 /> Rückgängig
        </Button>
      ) : null}
      <button
        onClick={onDismiss}
        className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        aria-label="Schließen"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
