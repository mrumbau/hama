import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';
import { dbDateToIso } from '@/lib/dates';
import { fullName, phoneTail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export interface SearchHit {
  type: 'projekt' | 'mitarbeiter' | 'bauleiter' | 'sub' | 'telefonat';
  id: string;
  title: string;
  subtitle: string;
  meta: string | null;
  href: string;
}

/**
 * Globale Suche (Master-Prompt Abschnitt 26). Trifft Kunde, Projekt, Projekt-
 * und Auftragsnummer, Adresse, Personen, SUBs und Telefonnummern.
 */
export const GET = handler(async (request: Request) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return ok({ hits: [] as SearchHit[] });

  const like = { contains: q, mode: 'insensitive' as const };
  const tail = phoneTail(q);

  const [projects, employees, managers, subs, calls] = await Promise.all([
    prisma.project.findMany({
      where: {
        OR: [
          { customerName: like },
          { name: like },
          { orderNumber: like },
          { projectNumber: like },
          { erpId: like },
          { city: like },
          { street: like },
          { zip: like },
          { contactName: like },
          ...(tail ? [{ contactPhone: { contains: tail } }] : []),
        ],
      },
      include: {
        primarySiteManager: true,
        assignments: { orderBy: { startDate: 'desc' }, take: 1 },
        communications: { orderBy: { occurredAt: 'desc' }, take: 1 },
      },
      take: 12,
    }),
    prisma.employee.findMany({
      where: {
        OR: [
          { firstName: like },
          { lastName: like },
          { shortCode: like },
          { profession: like },
          ...(tail ? [{ phone: { contains: tail } }] : []),
        ],
      },
      take: 6,
    }),
    prisma.siteManager.findMany({
      where: {
        OR: [
          { firstName: like },
          { lastName: like },
          { shortCode: like },
          ...(tail ? [{ phone: { contains: tail } }] : []),
        ],
      },
      take: 6,
    }),
    prisma.subcontractor.findMany({
      where: {
        OR: [
          { companyName: like },
          { contactName: like },
          { city: like },
          ...(tail ? [{ phone: { contains: tail } }] : []),
        ],
      },
      include: { trades: { include: { trade: true } } },
      take: 8,
    }),
    prisma.communication.findMany({
      where: {
        OR: [
          { customerName: like },
          { summary: like },
          ...(tail
            ? [{ contactNumber: { contains: tail } }, { callerNumber: { contains: tail } }]
            : []),
        ],
      },
      orderBy: { occurredAt: 'desc' },
      take: 6,
    }),
  ]);

  const hits: SearchHit[] = [
    ...projects.map<SearchHit>((p) => ({
      type: 'projekt',
      id: p.id,
      title: [p.orderNumber, p.customerName].filter(Boolean).join(' · '),
      subtitle: `${p.name}${p.city ? ` · ${p.city}` : ''}`,
      meta: [
        p.primarySiteManager ? `Bauleiter ${fullName(p.primarySiteManager)}` : null,
        p.assignments[0] ? `letzter Termin ${dbDateToIso(p.assignments[0].startDate)}` : null,
        p.communications[0]
          ? `letzte Kommunikation ${p.communications[0].occurredAt.toLocaleDateString('de-DE')}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
      href: `/projekte?projekt=${p.id}`,
    })),
    ...employees.map<SearchHit>((e) => ({
      type: 'mitarbeiter',
      id: e.id,
      title: fullName(e),
      subtitle: e.profession ?? 'Mitarbeiter',
      meta: e.phone,
      href: `/mitarbeiter?id=${e.id}`,
    })),
    ...managers.map<SearchHit>((m) => ({
      type: 'bauleiter',
      id: m.id,
      title: fullName(m),
      subtitle: 'Bauleiter',
      meta: m.phone,
      href: `/mitarbeiter?tab=bauleiter&id=${m.id}`,
    })),
    ...subs.map<SearchHit>((s) => ({
      type: 'sub',
      id: s.id,
      title: s.companyName,
      subtitle: s.trades.map((t) => t.trade.name).join(', ') || 'Subunternehmer',
      meta: [s.contactName, s.phone].filter(Boolean).join(' · ') || null,
      href: `/subunternehmer?id=${s.id}`,
    })),
    ...calls.map<SearchHit>((c) => ({
      type: 'telefonat',
      id: c.id,
      title: c.customerName ?? c.contactNumber ?? 'Telefonat',
      subtitle: c.summary?.slice(0, 90) ?? 'Telefonat',
      meta: c.occurredAt.toLocaleDateString('de-DE'),
      href: `/kommunikation?eintrag=${c.id}`,
    })),
  ];

  return ok({ hits });
});
