'use client';
/**
 * Der Bauzeitenplan zum Ausdrucken oder als PDF.
 *
 * Eine eigene Seite, nicht der Reiter mit versteckter Seitenleiste: Dieses
 * Blatt geht aus dem Haus – zum Kunden, zum Architekten, an die
 * Subunternehmer. Es darf nichts darauf stehen, was nur intern etwas
 * bedeutet, und es muss auf ein Blatt passen.
 *
 * Zum PDF führt der Druckdialog des Browsers („Als PDF sichern"). Das klingt
 * nach einem Umweg, ist aber der verlässlichste Weg: Die Seite sieht im PDF
 * exakt so aus wie auf dem Bildschirm, Umlaute und Schriften stimmen, und es
 * funktioniert auch auf dem Handy.
 */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateShort, todayIso, type IsoDate } from '@/lib/dates';
import {
  balken,
  spalten as fensterFuer,
  spaltenTitel,
  dauerText,
  type Raster,
} from '@/lib/bauzeitenplan';
import { Button } from '@/components/ui/button';

interface PhaseDTO {
  id: string;
  titel: string;
  gewerk: string | null;
  farbe: string;
  firma: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string | null;
}

interface PlanDTO {
  raster: Raster;
  phasen: PhaseDTO[];
}

interface ProjektDTO {
  customerName: string;
  name: string;
  orderNumber: string | null;
  projectNumber: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  primarySiteManagerName: string | null;
}

export function BauzeitenplanDruck({ projectId }: { projectId: string }) {
  const plan = useQuery({
    queryKey: ['bauzeitenplan', projectId],
    queryFn: () => api.get<PlanDTO>(`/api/projects/${projectId}/bauzeitenplan`),
  });
  const projekt = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<{ project: ProjektDTO }>(`/api/projects/${projectId}`),
  });

  if (plan.isLoading || projekt.isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Wird geladen …</p>;
  }
  if (!plan.data || !projekt.data) {
    return <p className="p-8 text-sm text-destructive">Der Plan konnte nicht geladen werden.</p>;
  }

  const { raster, phasen } = plan.data;
  const p = projekt.data.project;
  const fenster = fensterFuer(phasen, raster, todayIso(), 0);
  const anschrift = [p.street, [p.zip, p.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto max-w-[297mm] bg-white p-6 text-black print:p-0">
      {/* Nur auf dem Bildschirm */}
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Drucken / Als PDF sichern
        </Button>
        <p className="text-xs text-muted-foreground">
          Im Druckdialog Querformat wählen – dann passt der Plan auf ein Blatt.
        </p>
      </div>

      {/* --- Kopf --- */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Bauzeitenplan</h1>
          <p className="mt-1 text-base font-semibold">{p.customerName}</p>
          <p className="text-sm">{p.name}</p>
          {anschrift ? <p className="text-xs text-neutral-600">{anschrift}</p> : null}
        </div>

        <div className="shrink-0 text-right">
          <Logo />
          <dl className="mt-2 space-y-0.5 text-2xs text-neutral-600">
            {p.orderNumber ? (
              <div>
                <dt className="inline">Auftrag: </dt>
                <dd className="inline tabular-nums">{p.orderNumber}</dd>
              </div>
            ) : null}
            {p.primarySiteManagerName ? (
              <div>
                <dt className="inline">Bauleitung: </dt>
                <dd className="inline">{p.primarySiteManagerName}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline">Stand: </dt>
              <dd className="inline tabular-nums">{formatDateShort(todayIso())}</dd>
            </div>
          </dl>
        </div>
      </header>

      {/* --- Der Plan --- */}
      {phasen.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          Für diese Baustelle ist noch kein Bauzeitenplan hinterlegt.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-[9pt]">
          <thead>
            <tr>
              <th className="w-[46mm] border border-neutral-400 bg-neutral-100 px-1.5 py-1 text-left font-semibold">
                Gewerk
              </th>
              <th className="w-[28mm] border border-neutral-400 bg-neutral-100 px-1.5 py-1 text-left font-semibold">
                Firma
              </th>
              {/*
                Auf Papier zaehlen die Daten. Auf dem Bildschirm kann man
                einen Balken antippen - ein ausgedruckter Plan muss sagen,
                wann es losgeht, ohne dass jemand Wochen abzaehlt.
              */}
              <th className="w-[32mm] whitespace-nowrap border border-neutral-400 bg-neutral-100 px-1.5 py-1 text-left font-semibold">
                Zeitraum
              </th>
              {fenster.spalten.map((s) => (
                <th
                  key={s}
                  className="border border-neutral-400 bg-neutral-100 px-0.5 py-1 text-center text-[7.5pt] font-medium tabular-nums"
                >
                  {spaltenTitel(s, raster)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phasen.map((phase) => {
              const lage = balken(phase, fenster, raster);
              return (
                <tr key={phase.id} className="break-inside-avoid">
                  <td className="border border-neutral-400 px-1.5 py-1 align-middle">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-[1px] print:!block"
                        style={{
                          backgroundColor: phase.farbe,
                          printColorAdjust: 'exact',
                          WebkitPrintColorAdjust: 'exact',
                        }}
                        aria-hidden
                      />
                      <span className="font-medium">{phase.titel}</span>
                    </span>
                  </td>
                  <td className="border border-neutral-400 px-1.5 py-1 align-middle text-neutral-700">
                    {phase.firma ?? '–'}
                  </td>
                  <td className="whitespace-nowrap border border-neutral-400 px-1.5 py-1 align-middle tabular-nums text-neutral-700">
                    {kurzesDatum(phase.startDate)}–{kurzesDatum(phase.endDate)}
                  </td>

                  {fenster.spalten.map((s, i) => {
                    const drin = i >= lage.ab && i < lage.ab + lage.breite;
                    if (i === lage.ab) {
                      return (
                        <td
                          key={s}
                          colSpan={lage.breite}
                          className="border border-neutral-400 p-[2px]"
                        >
                          <div
                            className="flex h-4 items-center justify-center rounded-[2px] px-1 text-[7.5pt] font-semibold text-white"
                            style={{
                              backgroundColor: phase.farbe,
                              printColorAdjust: 'exact',
                              WebkitPrintColorAdjust: 'exact',
                            }}
                          >
                            {lage.breite > 1 ? dauerText(phase, raster) : ''}
                          </div>
                        </td>
                      );
                    }
                    return drin ? null : (
                      <td key={s} className="border border-neutral-400" />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* --- Notizen zu einzelnen Zeilen --- */}
      {phasen.some((x) => x.note) ? (
        <section className="mt-4 break-inside-avoid">
          <h2 className="text-[9pt] font-semibold">Hinweise</h2>
          <ul className="mt-1 space-y-0.5 text-[8.5pt] text-neutral-700">
            {phasen
              .filter((x) => x.note)
              .map((x) => (
                <li key={x.id}>
                  <span className="font-medium">{x.titel}:</span> {x.note}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-6 flex items-end justify-between border-t border-neutral-300 pt-2 text-[7.5pt] text-neutral-500">
        <span>
          MR Umbau GmbH · Bauzeitenplan {p.customerName} – {p.name} · Stand{' '}
          {formatDateShort(todayIso())}
        </span>
        <span>
          Zwischenstand der Planung. Änderungen bleiben vorbehalten.
        </span>
      </footer>
    </div>
  );
}

/**
 * „05.10.26" – kurz genug, dass der Zeitraum auf eine Zeile passt.
 *
 * Die ausgeschriebene Jahreszahl zweimal pro Zeile macht die Spalte doppelt
 * so hoch, und auf einem Plan mit zwanzig Gewerken kostet das eine Seite.
 */
function kurzesDatum(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
}

/**
 * Das Firmenlogo.
 *
 * Liegt `public/logo.png` im Projekt, wird es genommen. Fehlt es, steht
 * stattdessen der Schriftzug da – ein Plan ohne Logo ist besser als einer
 * mit einem kaputten Bildsymbol an der Stelle, an der das Logo sein sollte.
 */
function Logo() {
  const [fehlt, setFehlt] = React.useState(false);

  if (fehlt) {
    return (
      <div className="text-right leading-none">
        <span className="block text-lg font-black tracking-tight">MR UMBAU</span>
        <span className="block text-[7pt] font-medium uppercase tracking-[0.2em] text-neutral-500">
          GmbH
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="MR Umbau GmbH"
      className="ml-auto h-10 w-auto object-contain"
      onError={() => setFehlt(true)}
    />
  );
}
