import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Welcher Stand läuft hier?
 *
 * Bewusst ohne Anmeldung erreichbar und bewusst minimal: Diese Frage kam an
 * einem Tag viermal auf, weil in Vercel mehrere Deployments nebeneinander
 * stehen und eine Adresse auch mal auf einen alten zeigt. Ein Blick hierher
 * beantwortet sie in zwei Sekunden, statt sie aus dem Verhalten der App zu
 * erraten.
 */
export function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'lokal',
    nachricht: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    umgebung: process.env.VERCEL_ENV ?? 'entwicklung',
    // Ob die Anmeldewege eingerichtet sind – ohne Geheimnisse preiszugeben.
    microsoft: Boolean(
      process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET,
    ),
    startpasswort: Boolean(process.env.DISPO_START_PASSWORT),
  });
}
