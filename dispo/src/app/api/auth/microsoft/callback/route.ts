import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { baueSitzung, SESSION_COOKIE, stateGeheimnis } from '@/server/auth';
import {
  holeIdentitaet,
  microsoftKonfiguration,
  pruefeState,
  rueckkehrAdresse,
} from '@/server/microsoft';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

/** Rückkehr von Microsoft. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const zurueckMitFehler = (text: string) => {
    const ziel = new URL('/anmelden', url.origin);
    ziel.searchParams.set('fehler', text);
    return NextResponse.redirect(ziel);
  };

  const konfig = microsoftKonfiguration();
  if (!konfig) return zurueckMitFehler('Die Microsoft-Anmeldung ist nicht eingerichtet.');

  // Microsoft meldet Abbrüche und Fehler hier zurück.
  const fehler = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (fehler) return zurueckMitFehler(fehler.slice(0, 200));

  const { gueltig, weiter } = pruefeState(stateGeheimnis(), url.searchParams.get('state'));
  if (!gueltig) {
    return zurueckMitFehler(
      'Die Anmeldung ist abgelaufen oder wurde verändert. Bitte erneut versuchen.',
    );
  }

  const code = url.searchParams.get('code');
  if (!code) return zurueckMitFehler('Microsoft hat keinen Anmeldecode geschickt.');

  let identitaet;
  try {
    identitaet = await holeIdentitaet(konfig, code, rueckkehrAdresse(url.origin));
  } catch (e) {
    return zurueckMitFehler(
      e instanceof Error ? e.message.slice(0, 300) : 'Anmeldung fehlgeschlagen.',
    );
  }

  // Nur das eigene Verzeichnis. Sonst könnte sich jedes Microsoft-Konto der
  // Welt anmelden, sofern es zufällig dieselbe Adresse trägt.
  if (identitaet.tenantId && identitaet.tenantId !== konfig.tenantId) {
    return zurueckMitFehler('Dieses Microsoft-Konto gehört nicht zu MR Umbau.');
  }

  const user = await prisma.user.findUnique({ where: { email: identitaet.email } });
  if (!user || !user.active) {
    // Microsoft sagt, WER jemand ist – nicht, dass er hereindarf.
    return zurueckMitFehler(
      `Für ${identitaet.email} gibt es hier kein Konto. Bitte an die Verwaltung wenden.`,
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    entityType: 'integration',
    entityId: user.id,
    action: 'updated',
    label: `Angemeldet mit Microsoft-Konto: ${user.firstName} ${user.lastName}`,
  }).catch(() => undefined);

  const antwort = NextResponse.redirect(new URL(weiter, url.origin));
  antwort.cookies.set(SESSION_COOKIE, baueSitzung(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return antwort;
}
