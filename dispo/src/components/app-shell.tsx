'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  CalendarRange,
  HardHat,
  LayoutGrid,
  Menu,
  MessageSquare,
  Settings,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/global-search';
import { OpenPointsBadge } from '@/components/open-points-badge';

const NAV = [
  { href: '/plantafel', label: 'Plantafel', icon: CalendarRange },
  { href: '/projekte', label: 'Projekte', icon: LayoutGrid },
  { href: '/mitarbeiter', label: 'Mitarbeiter', icon: Users },
  { href: '/subunternehmer', label: 'Subunternehmer', icon: Truck },
  { href: '/kommunikation', label: 'Änderungen / Kommunikation', icon: MessageSquare },
  { href: '/offene-punkte', label: 'Offene Punkte', icon: AlertTriangle, badge: true },
  { href: '/einstellungen', label: 'Einstellungen', icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* --- Seitenleiste --- */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
          <div className="flex size-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            <HardHat className="size-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">MR Umbau</p>
            <p className="truncate text-2xs text-muted-foreground">Dispo &amp; Einsatzplanung</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Menü schließen"
          >
            <X />
          </Button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {'badge' in item && item.badge ? <OpenPointsBadge /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3 text-2xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Version 1 – interne Disposition</p>
          <p>Kaufmännische Daten bleiben in „Das Programm“.</p>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* --- Hauptbereich --- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Menü öffnen"
          >
            <Menu />
          </Button>
          <GlobalSearch />
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
