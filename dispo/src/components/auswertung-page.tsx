'use client';
/**
 * Auswertung: Lagertage, Besorgungsfahrten, Krankheit, Urlaub.
 *
 * Eine Tabelle pro Art, Zeilen sind Personen, Spalten sind die zwölf
 * Monate. Das ist die Form, in der man solche Zahlen liest – nicht als
 * Diagramm, sondern als Zeile, die man abfahren kann.
 */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '@/lib/api-client';
import { INTERN_FARBE } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/misc';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

interface MonatsWert {
  monat: number;
  tage: number;
  stunden: number | null;
  eintraege: number;
}
interface PersonenZeile {
  name: string;
  monate: MonatsWert[];
  summeTage: number;
  summeStunden: number | null;
  summeEintraege: number;
}
interface Block {
  schluessel: string;
  bezeichnung: string;
  personen: PersonenZeile[];
  gesamt: MonatsWert[];
}

export function AuswertungPage() {
  const heute = new Date().getFullYear();
  const [jahr, setJahr] = React.useState(heute);
  // „Wie oft" bei Krankheit, „wie viel" bei Lager – beides wird gebraucht.
  const [einheit, setEinheit] = React.useState<'tage' | 'eintraege'>('tage');

  const { data, isLoading } = useQuery({
    queryKey: ['auswertung', jahr],
    queryFn: () => api.get<{ jahr: number; bloecke: Block[] }>(`/api/auswertung?jahr=${jahr}`),
  });

  const bloecke = data?.bloecke ?? [];
  const wert = (m: MonatsWert) => (einheit === 'tage' ? m.tage : m.eintraege);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Auswertung"
        description="Lagertage, Besorgungsfahrten, Krankheit und Urlaub – nach Monat und Jahr."
        actions={
          <Button size="sm" variant="outline" onClick={() => alsCsv(bloecke, jahr, einheit)}>
            <Download /> Als CSV
          </Button>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={String(jahr)}
            onChange={(e) => setJahr(Number(e.target.value))}
            className="h-8 w-auto text-xs"
          >
            {[heute + 1, heute, heute - 1, heute - 2, heute - 3].map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </Select>
          <Select
            value={einheit}
            onChange={(e) => setEinheit(e.target.value as 'tage' | 'eintraege')}
            className="h-8 w-auto text-xs"
          >
            <option value="tage">Tage</option>
            <option value="eintraege">Anzahl (wie oft)</option>
          </Select>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : bloecke.every((b) => b.personen.length === 0) ? (
          <EmptyState
            title="Noch nichts ausgewertet"
            description="Sobald jemand auf Lager, Besorgungsfahrten, Urlaub oder Krank eingeplant ist, steht er hier."
          />
        ) : (
          bloecke.map((block) => (
            <section key={block.schluessel} className="rounded-lg border">
              <h2
                className="flex items-baseline gap-2 border-b border-l-[3px] px-3 py-2 text-sm font-semibold"
                style={{ borderLeftColor: INTERN_FARBE[block.schluessel] ?? 'transparent' }}
              >
                {block.bezeichnung}
                <span className="text-2xs font-normal text-muted-foreground">
                  {block.gesamt.reduce((s, m) => s + wert(m), 0)}{' '}
                  {einheit === 'tage' ? 'Tage gesamt' : 'Einträge gesamt'}
                </span>
              </h2>

              {block.personen.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  In {jahr} nichts eingetragen.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-2xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-1.5 text-left font-semibold">Mitarbeiter</th>
                        {MONATE.map((m) => (
                          <th key={m} className="px-1.5 py-1.5 text-right font-semibold">
                            {m}
                          </th>
                        ))}
                        <th className="px-3 py-1.5 text-right font-semibold">Summe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.personen.map((person) => (
                        <tr key={person.name} className="border-b last:border-0">
                          <td className="truncate px-3 py-1.5 font-medium">{person.name}</td>
                          {person.monate.map((m) => (
                            <td
                              key={m.monat}
                              className={`px-1.5 py-1.5 text-right tabular-nums ${
                                wert(m) === 0 ? 'text-muted-foreground/40' : ''
                              }`}
                            >
                              {wert(m) || '–'}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                            {einheit === 'tage' ? person.summeTage : person.summeEintraege}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/50 text-2xs font-semibold">
                        <td className="px-3 py-1.5">Gesamt</td>
                        {block.gesamt.map((m) => (
                          <td key={m.monat} className="px-1.5 py-1.5 text-right tabular-nums">
                            {wert(m) || '–'}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {block.gesamt.reduce((s, m) => s + wert(m), 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Als CSV herunterladen – damit die Zahlen in der Buchhaltung landen können,
 * ohne dass jemand sie abtippt. Semikolon, weil Excel auf Deutsch sonst
 * alles in eine Spalte legt.
 */
function alsCsv(bloecke: Block[], jahr: number, einheit: 'tage' | 'eintraege') {
  const zeilen: string[] = [
    ['Art', 'Mitarbeiter', ...MONATE, 'Summe'].join(';'),
  ];

  for (const block of bloecke) {
    for (const person of block.personen) {
      zeilen.push(
        [
          block.bezeichnung,
          person.name,
          ...person.monate.map((m) => (einheit === 'tage' ? m.tage : m.eintraege)),
          einheit === 'tage' ? person.summeTage : person.summeEintraege,
        ].join(';'),
      );
    }
  }

  const blob = new Blob([`﻿${zeilen.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auswertung-${jahr}-${einheit}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
