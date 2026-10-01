'use client';
/**
 * Alle Bauzeitenpläne auf einer Zeitachse.
 *
 * Aufgebaut wie die Plantafel, und aus demselben Grund: Ein Plan je Baustelle
 * beantwortet „läuft diese Baustelle rund?". Die Frage, die wehtut, ist eine
 * andere – „wo stehen in KW 42 drei Gewerke gleichzeitig, und haben wir dafür
 * Leute?". Die sieht man nur, wenn alle Baustellen untereinanderstehen und
 * dieselbe Woche überall dieselbe Spalte ist.
 *
 * Zwei Ebenen, eine Seite. Oben die Liste aller Baustellen zum Vergleichen;
 * eine Baustelle anklicken öffnet ihren vollen Plan an derselben Stelle – mit
 * Gewerkleiste, Wochen- oder Tagesraster, Ziehen, Ändern und Entfernen. Kein
 * Panel, das sich darüberlegt: Was man ändert, ändert man dort, wo man es
 * sieht.
 *
 * Das Raster gehört zur einzelnen Baustelle, nicht zur Übersicht. Deshalb
 * steht der Schalter Wochen/Tage erst in der zweiten Ebene: Auf einer
 * gemeinsamen Achse können nicht zwei Baustellen verschieden rechnen.
 *
 * Der Pfeil links klappt die Gewerke in der Liste auf, wenn man nur hinsehen
 * und nicht umschalten will.
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useIstSchmal } from '@/lib/schmal';
import { formatDateShort, isoWeek, todayIso, type IsoDate } from '@/lib/dates';
import type { ProjectStatusKey } from '@/lib/labels';
import {
  balken,
  monatsSpannen,
  spalten as fensterFuer,
  type Phase,
  type Raster,
} from '@/lib/bauzeitenplan';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import { BauzeitenplanPlan } from '@/components/bauzeitenplan/plan';

interface PhaseDTO extends Phase {
  titel: string;
  gewerk: string | null;
  farbe: string;
  firma: string | null;
  note: string | null;
  besetzung: 'ok' | 'firmaFehlt' | 'niemand';
  wer: string[];
}

interface BaustelleDTO {
  id: string;
  customerName: string;
  name: string;
  status: ProjectStatusKey;
  bauleiter: string | null;
  raster: Raster;
  phasen: PhaseDTO[];
}

/**
 * Die Übersicht rechnet immer in Wochen.
 *
 * Tagesgenau ist die Sache der einzelnen Baustelle. Über zwanzig Baustellen
 * und ein halbes Jahr wären das rund zweihundert Spalten – man scrollt dann
 * eine Woche lang nach rechts, um den Februar zu sehen.
 */
const RASTER: Raster = 'WOCHE';
/**
 * Spaltenbreite der Übersicht.
 *
 * Breit genug für „KW 37" – die nackte Zahl liest sich schneller, sagt aber
 * nicht, was sie ist, und auf einem Plan, den man jemandem über die Schulter
 * zeigt, ist das der Unterschied zwischen Verstehen und Nachfragen.
 */
const SPALTE = 76;
const NAMENSSPALTE = { breit: 230, schmal: 150 };

export function BauzeitenplanUebersicht() {
  const router = useRouter();
  const params = useSearchParams();
  /** Welche Baustelle ist aufgeschlagen? Leer = die Liste aller Baustellen. */
  const offeneBaustelle = params.get('baustelle');
  const schmal = useIstSchmal();

  const [suche, setSuche] = React.useState('');
  const [aufgeklappt, setAufgeklappt] = React.useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['bauzeitenplaene'],
    queryFn: () => api.get<{ baustellen: BaustelleDTO[] }>('/api/bauzeitenplaene'),
  });

  const alle = data?.baustellen ?? [];

  const baustellen = React.useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    if (!begriff) return alle;
    return alle.filter((b) =>
      `${b.customerName} ${b.name} ${b.bauleiter ?? ''}`.toLowerCase().includes(begriff),
    );
  }, [alle, suche]);

  /*
   * Ein Fenster fuer alle. Wird es je Baustelle gerechnet, liegt KW 42 in
   * jeder Zeile woanders, und die Uebersicht beantwortet genau die Frage
   * nicht, fuer die sie da ist.
   */
  const fenster = React.useMemo(() => {
    const allePhasen = baustellen.flatMap((b) => b.phasen);
    return fensterFuer(allePhasen, RASTER, todayIso());
  }, [baustellen]);

  const monate = React.useMemo(() => monatsSpannen(fenster.spalten), [fenster]);
  const heute = todayIso();
  const heuteSpalte = fenster.spalten.findIndex(
    (s, i) => s <= heute && (i === fenster.spalten.length - 1 || fenster.spalten[i + 1] > heute),
  );

  const oeffnen = (id: string | null) =>
    router.replace(id ? `/bauzeitenplan?baustelle=${id}` : '/bauzeitenplan', { scroll: false });

  const umklappen = (id: string) =>
    setAufgeklappt((vorher) => {
      const naechste = new Set(vorher);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });

  const mitPlan = baustellen.filter((b) => b.phasen.length > 0).length;

  const aufgeschlagen = alle.find((b) => b.id === offeneBaustelle);

  /*
   * Zweite Ebene: der ganze Plan dieser einen Baustelle. Bewusst anstelle der
   * Liste und nicht darueber - ein Bauzeitenplan braucht die Breite, und zwei
   * waagerecht scrollende Raster uebereinander liest niemand.
   */
  if (offeneBaustelle) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          title={aufgeschlagen ? aufgeschlagen.customerName : 'Bauzeitenplan'}
          description={
            aufgeschlagen
              ? [aufgeschlagen.name, aufgeschlagen.bauleiter].filter(Boolean).join(' · ')
              : undefined
          }
          actions={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`/projekte?projekt=${offeneBaustelle}`}>
                  <ExternalLink /> Baustelle
                </a>
              </Button>
            </div>
          }
        >
          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => oeffnen(null)}>
              <ArrowLeft /> Alle Baustellen
            </Button>
          </div>
        </PageHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <BauzeitenplanPlan projectId={offeneBaustelle} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Bauzeitenpläne"
        description="Alle Baustellen auf einer Zeitachse. Eine Baustelle anklicken schlägt ihren Plan auf."
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Baustelle oder Bauleiter …"
              className="pl-7"
            />
          </div>
          <span className="text-2xs text-muted-foreground">
            {mitPlan} von {baustellen.length} Baustellen mit Plan
          </span>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Bauzeitenpläne werden geladen …</p>
        ) : baustellen.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={suche.trim() ? 'Keine Baustelle passt' : 'Keine offenen Baustellen'}
            description={
              suche.trim()
                ? `Nichts zu „${suche.trim()}“. Abgeschlossene Baustellen stehen hier bewusst nicht – ein Bauzeitenplan ist ein Blick nach vorn.`
                : 'Sobald eine Baustelle offen ist, steht sie hier.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <div
              className="min-w-max"
              style={{
                ['--spalte' as string]: `${SPALTE}px`,
                ['--name' as string]: `${schmal ? NAMENSSPALTE.schmal : NAMENSSPALTE.breit}px`,
              }}
            >
              {/* --- Monate --- */}
              <div
                className="grid border-b bg-muted/70"
                style={{
                  gridTemplateColumns: `var(--name) repeat(${fenster.spalten.length}, var(--spalte))`,
                }}
              >
                <div className="border-r px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Baustelle
                </div>
                {monate.map((m, i) => (
                  <div
                    key={`${m.titel}-${i}`}
                    className="truncate border-r px-1 py-1 text-center text-2xs font-semibold last:border-r-0"
                    style={{ gridColumn: `span ${m.spalten}` }}
                    title={m.titel}
                  >
                    {/* Zwei Spalten tragen „Oktober 2026" nicht. */}
                    {m.spalten >= 3 ? m.titel : m.kurz}
                  </div>
                ))}
              </div>

              {/* --- Wochen --- */}
              <div
                className="grid border-b bg-muted/40"
                style={{
                  gridTemplateColumns: `var(--name) repeat(${fenster.spalten.length}, var(--spalte))`,
                }}
              >
                <div className="border-r" />
                {fenster.spalten.map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      'border-r px-0.5 py-1 text-center text-2xs tabular-nums last:border-r-0',
                      i === heuteSpalte
                        ? 'bg-primary/15 font-semibold text-foreground'
                        : 'text-muted-foreground',
                    )}
                    title={`Woche ab ${formatDateShort(s)}`}
                  >
                    KW {isoWeek(s)}
                  </div>
                ))}
              </div>

              {/* --- Baustellen --- */}
              {baustellen.map((b) => (
                <BaustellenZeile
                  key={b.id}
                  baustelle={b}
                  fenster={fenster}
                  heuteSpalte={heuteSpalte}
                  offen={aufgeklappt.has(b.id)}
                  onUmklappen={() => umklappen(b.id)}
                  onOeffnen={() => oeffnen(b.id)}
                />
              ))}
            </div>
          </div>
        )}

        {baustellen.length > 0 ? (
          <p className="mt-2 text-2xs text-muted-foreground">
            Der Pfeil links klappt die Gewerke auf. Ein Klick auf die Baustelle schlägt ihren Plan
            auf – dort wird gezogen, hinzugefügt, geändert und entfernt, und dort steht auch der
            Schalter Wochen/Tage. Diese Liste rechnet in Wochen, weil auf einer gemeinsamen Achse
            nicht zwei Baustellen verschieden rechnen können. Das rote Zeichen heißt: Dieses Gewerk
            steht im Plan, aber auf der Plantafel steht dafür niemand.
          </p>
        ) : null}
      </div>


    </div>
  );
}

/** Eine Baustelle: eine Zeile mit allen Balken, darunter auf Wunsch die Gewerke. */
function BaustellenZeile({
  baustelle: b,
  fenster,
  heuteSpalte,
  offen,
  onUmklappen,
  onOeffnen,
}: {
  baustelle: BaustelleDTO;
  fenster: { von: IsoDate; spalten: IsoDate[] };
  heuteSpalte: number;
  offen: boolean;
  onUmklappen: () => void;
  onOeffnen: () => void;
}) {
  const spaltenZahl = fenster.spalten.length;
  const raster = `var(--name) repeat(${spaltenZahl}, var(--spalte))`;
  const ohneMannschaft = b.phasen.filter((p) => p.besetzung === 'niemand').length;

  return (
    <>
      <div className="grid border-b hover:bg-accent/30" style={{ gridTemplateColumns: raster }}>
        <div className="flex min-w-0 items-center gap-1 border-r pl-1 pr-2">
          <button
            onClick={onUmklappen}
            aria-label={offen ? 'Gewerke zuklappen' : 'Gewerke aufklappen'}
            aria-expanded={offen}
            disabled={b.phasen.length === 0}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 [@media(pointer:coarse)]:p-1.5"
          >
            {offen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          <button onClick={onOeffnen} className="min-w-0 flex-1 py-1.5 text-left">
            <span className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {b.customerName}
              </span>
              {/*
                Der eigentliche Zweck der Uebersicht: Man sieht auf einen
                Blick, welche Baustelle im Plan steht und auf der Tafel nicht.
              */}
              {ohneMannschaft > 0 ? (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-2xs font-semibold text-destructive"
                  title={`${ohneMannschaft} ${
                    ohneMannschaft === 1 ? 'Gewerk' : 'Gewerke'
                  } ohne Einsatz auf der Plantafel`}
                >
                  <AlertTriangle className="size-3" />
                  {ohneMannschaft}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-2xs text-muted-foreground">
              {b.name}
              {b.bauleiter ? ` · ${b.bauleiter}` : ''}
            </span>
          </button>
        </div>

        {/* Hintergrundraster */}
        {fenster.spalten.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-full border-r last:border-r-0',
              i === heuteSpalte ? 'bg-primary/10' : i % 2 === 1 && 'bg-muted/20',
            )}
            style={{ gridRow: 1, gridColumn: i + 2 }}
          />
        ))}

        {b.phasen.length === 0 ? (
          <button
            onClick={onOeffnen}
            className="py-1.5 text-left text-2xs text-muted-foreground hover:underline"
            style={{ gridRow: 1, gridColumn: `2 / span ${Math.min(spaltenZahl, 6)}` }}
          >
            <span className="pl-2">Noch kein Bauzeitenplan – anlegen</span>
          </button>
        ) : (
          /*
           * Alle Gewerke auf einer Zeile. Ueberlappende Gewerke liegen
           * uebereinander - genau das ist die Information: Dort stehen zwei
           * Firmen gleichzeitig auf der Baustelle.
           */
          b.phasen.map((p) => {
            const lage = balken(p, fenster, RASTER);
            return (
              <button
                key={p.id}
                onClick={onOeffnen}
                title={`${p.titel}${p.firma ? ` · ${p.firma}` : ''} · ${formatDateShort(
                  p.startDate,
                )}–${formatDateShort(p.endDate)}`}
                className="my-1.5 h-3 rounded-sm opacity-90 hover:opacity-100"
                style={{
                  gridRow: 1,
                  gridColumn: `${lage.ab + 2} / span ${lage.breite}`,
                  backgroundColor: p.farbe,
                  zIndex: 10,
                }}
              >
                <span className="sr-only">{p.titel}</span>
              </button>
            );
          })
        )}
      </div>

      {/* --- Aufgeklappt: jedes Gewerk auf eigener Zeile --- */}
      {offen
        ? b.phasen.map((p) => {
            const lage = balken(p, fenster, RASTER);
            return (
              <div
                key={p.id}
                className="grid border-b bg-muted/10"
                style={{ gridTemplateColumns: raster }}
              >
                <div className="flex min-w-0 items-center gap-1.5 border-r py-1 pl-8 pr-2">
                  <span
                    className="size-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: p.farbe }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-2xs">{p.titel}</span>
                  {p.besetzung !== 'ok' ? (
                    <span
                      className={cn(
                        'shrink-0',
                        p.besetzung === 'niemand' ? 'text-destructive' : 'text-amber-600',
                      )}
                      title={
                        p.besetzung === 'niemand'
                          ? `Für ${p.titel} steht im Zeitraum niemand auf der Plantafel.`
                          : `${p.firma ?? 'Die hinterlegte Firma'} steht nicht auf der Plantafel – eingeplant ist ${
                              p.wer.join(', ') || 'jemand'
                            }.`
                      }
                    >
                      <AlertTriangle className="size-3" />
                    </span>
                  ) : null}
                </div>
                {fenster.spalten.map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      'h-full border-r last:border-r-0',
                      i === heuteSpalte ? 'bg-primary/10' : i % 2 === 1 && 'bg-muted/20',
                    )}
                    style={{ gridRow: 1, gridColumn: i + 2 }}
                  />
                ))}
                <div
                  className="my-1 flex h-3 items-center justify-center rounded-sm px-1 text-[9px] font-semibold text-white"
                  style={{
                    gridRow: 1,
                    gridColumn: `${lage.ab + 2} / span ${lage.breite}`,
                    backgroundColor: p.farbe,
                    zIndex: 10,
                  }}
                  title={p.note ?? undefined}
                >
                  {lage.breite >= 3 ? (p.firma ?? '') : ''}
                </div>
              </div>
            );
          })
        : null}
    </>
  );
}
