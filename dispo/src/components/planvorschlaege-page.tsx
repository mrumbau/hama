'use client';
/**
 * Planvorschläge – die Freigabe.
 *
 * Die Bauleiter planen drei, vier Wochen voraus; einmal die Woche geht die
 * Leitung die Liste durch. Deshalb keine Einzelfallansicht, sondern eine
 * Liste zum Abarbeiten: nach Bauleiter gruppiert, Mehrfachauswahl, ein
 * Knopf. Dreißig Vorschläge einzeln anzuklicken macht aus dem Treffen eine
 * Klickstrecke.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateShort } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';

interface Vorschlag {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  tasks: string[];
  projektTitel: string;
  projektOrt: string | null;
  ressource: string;
  vorgeschlagenVon: string;
}

export function PlanvorschlaegePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gewaehlt, setGewaehlt] = React.useState<Set<string>>(new Set());
  const [grund, setGrund] = React.useState('');
  // Ablehnen ist nicht rueckgaengig zu machen - deshalb ein Zwischenschritt.
  const [ablehnenNachfrage, setAblehnenNachfrage] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['planvorschlaege'],
    queryFn: () =>
      api.get<{ darfFreigeben: boolean; vorschlaege: Vorschlag[] }>('/api/planvorschlaege'),
  });

  const entscheiden = useMutation({
    mutationFn: (annehmen: boolean) =>
      api.post<{ message: string }>('/api/planvorschlaege', {
        ids: [...gewaehlt],
        annehmen,
        grund: annehmen ? null : grund,
      }),
    onSuccess: (res) => {
      setGewaehlt(new Set());
      setGrund('');
      setAblehnenNachfrage(false);
      queryClient.invalidateQueries({ queryKey: ['planvorschlaege'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const vorschlaege = data?.vorschlaege ?? [];
  const darfFreigeben = data?.darfFreigeben ?? false;

  // Nach Bauleiter gruppieren – so geht man im Treffen durch: „Philipp,
  // was hast du?"
  const gruppen = React.useMemo(() => {
    const map = new Map<string, Vorschlag[]>();
    for (const v of vorschlaege) {
      const liste = map.get(v.vorgeschlagenVon);
      if (liste) liste.push(v);
      else map.set(v.vorgeschlagenVon, [v]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
  }, [vorschlaege]);

  const umschalten = (id: string) =>
    setGewaehlt((v) => {
      const neu = new Set(v);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  const gruppeWaehlen = (liste: Vorschlag[]) =>
    setGewaehlt((v) => {
      const neu = new Set(v);
      const alleDrin = liste.every((x) => neu.has(x.id));
      for (const x of liste) {
        if (alleDrin) neu.delete(x.id);
        else neu.add(x.id);
      }
      return neu;
    });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Planvorschläge"
        description={
          darfFreigeben
            ? 'Was die Bauleiter vorgeplant haben. Annehmen macht daraus feste Planung.'
            : 'Ihre eigenen Vorschläge. Die Leitung gibt sie frei.'
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : vorschlaege.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Keine offenen Vorschläge"
            description={
              darfFreigeben
                ? 'Alles freigegeben. Was die Bauleiter neu einplanen, erscheint hier.'
                : 'Alles, was Sie eingeplant haben, ist freigegeben.'
            }
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 pb-24">
            {gruppen.map(([wer, liste]) => (
              <section key={wer} className="rounded-lg border">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <h2 className="text-sm font-semibold">{wer}</h2>
                  <Badge variant="grau">{liste.length}</Badge>
                  {darfFreigeben ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => gruppeWaehlen(liste)}
                    >
                      {liste.every((x) => gewaehlt.has(x.id)) ? 'Auswahl aufheben' : 'Alle wählen'}
                    </Button>
                  ) : null}
                </div>

                <ul className="divide-y">
                  {liste.map((v) => (
                    <li key={v.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      {darfFreigeben ? (
                        <input
                          type="checkbox"
                          className="mt-0.5 size-3.5 accent-primary"
                          checked={gewaehlt.has(v.id)}
                          onChange={() => umschalten(v.id)}
                          aria-label={`${v.ressource} auf ${v.projektTitel} auswählen`}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {v.ressource} <span className="text-muted-foreground">auf</span>{' '}
                          {v.projektTitel}
                        </span>
                        <span className="block text-2xs text-muted-foreground">
                          {formatDateShort(v.startDate)}
                          {v.endDate !== v.startDate ? ` – ${formatDateShort(v.endDate)}` : ''}
                          {v.startTime ? ` · ${v.startTime}–${v.endTime ?? '?'}` : ''}
                          {v.projektOrt ? ` · ${v.projektOrt}` : ''}
                        </span>
                        {v.tasks.length > 0 || v.note ? (
                          <span className="block text-2xs text-muted-foreground">
                            {[v.tasks.join(', '), v.note].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/*
        Die Leiste erscheint erst mit einer Auswahl - vorher waere sie ein
        Balken, der Platz wegnimmt und nichts tut.
      */}
      {darfFreigeben && gewaehlt.size > 0 ? (
        <div className="shrink-0 border-t bg-card p-3">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="text-xs font-medium">
              {gewaehlt.size} ausgewählt
            </span>
            <Input
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="Grund (freiwillig)"
              className="h-8 min-w-[12rem] flex-1 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={entscheiden.isPending}
              onClick={() => setAblehnenNachfrage(true)}
            >
              <ThumbsDown /> Ablehnen
            </Button>
            <Button
              size="sm"
              disabled={entscheiden.isPending}
              onClick={() => entscheiden.mutate(true)}
            >
              <Check /> Annehmen
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        Ablehnen laesst sich nicht rueckgaengig machen, und es trifft die
        Arbeit von jemand anderem. Ein Zwischenschritt kostet eine Sekunde
        und verhindert den einen Fehlgriff, der Vertrauen kostet.
      */}
      <Dialog open={ablehnenNachfrage} onOpenChange={setAblehnenNachfrage}>
        <DialogContent className="max-w-sm">
          <DialogTitle>
            {gewaehlt.size} Vorschlag{gewaehlt.size === 1 ? '' : 'e'} ablehnen?
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Die Einsätze verschwinden von der Plantafel. Rückgängig geht das nicht – wer sie
            wiederhaben will, muss sie neu einplanen.
            {grund.trim() ? (
              <>
                {' '}
                Begründung: <span className="text-foreground">„{grund.trim()}"</span>
              </>
            ) : (
              ' Eine Begründung ist nicht nötig.'
            )}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAblehnenNachfrage(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={entscheiden.isPending}
              onClick={() => entscheiden.mutate(false)}
            >
              <ThumbsDown /> Ja, ablehnen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
