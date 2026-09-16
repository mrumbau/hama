'use client';
import Link from 'next/link';
import { AlertTriangle, CalendarCheck, HardHat, MessageSquare, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardResponse } from '@/lib/types';

/** Maximal fünf KPIs (Master-Prompt Abschnitt 46). */
export function KpiHeader({ kpis }: { kpis: BoardResponse['kpis'] }) {
  const items = [
    {
      label: 'Laufende Baustellen',
      value: kpis.laufendeBaustellen,
      icon: HardHat,
      href: '/projekte',
      tone: 'neutral' as const,
    },
    {
      label: 'Diese Woche',
      value: kpis.dieseWoche,
      icon: CalendarCheck,
      href: '/plantafel',
      tone: 'neutral' as const,
    },
    {
      label: 'Rote Baustellen',
      value: kpis.roteBaustellen,
      icon: AlertTriangle,
      href: '/plantafel?nurProbleme=1&ampel=ROT',
      tone: kpis.roteBaustellen > 0 ? ('bad' as const) : ('good' as const),
    },
    {
      label: 'Offene Änderungen',
      value: kpis.offeneAenderungen,
      icon: MessageSquare,
      href: '/kommunikation',
      tone: kpis.offeneAenderungen > 0 ? ('warn' as const) : ('good' as const),
    },
    {
      label: 'Nicht besetzte Einsätze',
      value: kpis.unbesetzteEinsaetze,
      icon: UserX,
      href: '/offene-punkte',
      tone: kpis.unbesetzteEinsaetze > 0 ? ('warn' as const) : ('good' as const),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition hover:shadow-sm',
              item.tone === 'bad' && 'border-ampel-rot/40 bg-ampel-rot/5',
              item.tone === 'warn' && 'border-ampel-gelb/40 bg-ampel-gelb/5',
            )}
          >
            <Icon
              className={cn(
                'size-4 shrink-0',
                item.tone === 'bad'
                  ? 'text-ampel-rot'
                  : item.tone === 'warn'
                    ? 'text-ampel-gelb'
                    : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold leading-none tabular-nums">
                {item.value}
              </span>
              <span className="block truncate text-2xs text-muted-foreground">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
