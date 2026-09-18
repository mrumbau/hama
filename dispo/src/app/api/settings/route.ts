import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { prisma } from '@/lib/db';
import { verlange } from '@/server/auth';
import { pooltauglicheUrl } from '@/lib/db-url';
import { geheimnisForm } from '@/server/microsoft';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
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

  const [
    projects,
    demoProjects,
    employees,
    subcontractors,
    assignments,
    auditEntries,
    communications,
  ] = counts;

  return ok({
    settings: Object.fromEntries(rows.filter(istKeinGeheimnis).map((r) => [r.key, r.value])),
    sync,
    stats: {
      projects,
      demoProjects,
      employees,
      subcontractors,
      assignments,
      auditEntries,
      communications,
    },
    env: {
      erpProvider: process.env.DISPO_ERP_PROVIDER ?? 'mock',
      threeCxConfigured: Boolean(process.env.THREECX_WEBHOOK_SECRET),
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      database: describeDatabase(pooltauglicheUrl(process.env.DATABASE_URL).url),
      /** Anmeldung mit Microsoft-Konto: eingerichtet oder nicht. */
      microsoftKonfiguriert: Boolean(
        process.env.MICROSOFT_TENANT_ID &&
        process.env.MICROSOFT_CLIENT_ID &&
        process.env.MICROSOFT_CLIENT_SECRET,
      ),
      /**
       * Genau diese Adresse muss in der Microsoft-App-Registrierung als
       * Umleitungs-URI stehen. Sie haengt an der Adresse, unter der die App
       * gerade laeuft - deshalb wird sie hier ausgerechnet statt geraten.
       */
      microsoftUmleitung: `${new URL(request.url).origin}/api/auth/microsoft/callback`,
      /**
       * Wie das hinterlegte Client-Geheimnis aussieht - nicht, wie es lautet.
       * Wer in Entra die Geheimnis-ID statt des Werts kopiert, bekommt sonst
       * nur ein nacktes AADSTS7000215 zu sehen.
       */
      microsoftGeheimnis: process.env.MICROSOFT_CLIENT_SECRET
        ? geheimnisForm(process.env.MICROSOFT_CLIENT_SECRET)
        : null,
    },
  });
});

/**
 * Diese Antwort sieht jeder Angemeldete. Ausweise haben darin nichts zu
 * suchen - auch nicht der des Zeitplans, der sonst jedem offenstuende, der
 * sich einmal anmelden kann.
 */
function istKeinGeheimnis(zeile: { key: string }): boolean {
  return !/(token|secret|geheimnis|passwort|password)$/i.test(zeile.key);
}

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
