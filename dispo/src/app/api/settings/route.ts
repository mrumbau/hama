import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';
import { pooltauglicheUrl } from '@/lib/db-url';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const [rows, sync, counts] = await Promise.all([
    prisma.setting.findMany(),
    prisma.syncState.findMany(),
    Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { isDemo: true } }),
      prisma.employee.count(),
      prisma.subcontractor.count(),
      prisma.assignment.count(),
      prisma.auditLog.count(),
      prisma.communication.count(),
    ]),
  ]);

  const [projects, demoProjects, employees, subcontractors, assignments, auditEntries, communications] =
    counts;

  return ok({
    settings: Object.fromEntries(rows.map((r) => [r.key, r.value])),
    sync,
    stats: { projects, demoProjects, employees, subcontractors, assignments, auditEntries, communications },
    env: {
      erpProvider: process.env.DISPO_ERP_PROVIDER ?? 'mock',
      threeCxConfigured: Boolean(process.env.THREECX_WEBHOOK_SECRET),
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      database: describeDatabase(pooltauglicheUrl(process.env.DATABASE_URL).url),
    },
  });
});

export const PATCH = handler(async (request: Request) => {
  await verlange('einstellungenAendern');
  const input = await parseBody(request, z.record(z.string().max(2000)));
  for (const [key, value] of Object.entries(input)) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return ok({ message: 'Einstellungen gespeichert.' });
});

/**
 * Verbindungsdaten nie vollstaendig ausgeben – nur Host und Datenbankname.
 * Angezeigt wird die *tatsaechlich* benutzte Adresse, nicht die rohe
 * Umgebungsvariable: sonst steht dort ein Port, ueber den gar nicht
 * verbunden wird.
 */
function describeDatabase(url: string | undefined) {
  if (!url) return 'nicht konfiguriert';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return 'konfiguriert';
  }
}
