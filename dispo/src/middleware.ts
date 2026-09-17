import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/auth-edge';

/**
 * Wer darf überhaupt herein?
 *
 * Zwei Riegel, unabhängig voneinander:
 *
 *   1. Anmeldung mit Benutzerkonto – sobald Benutzer angelegt sind, führt
 *      kein Weg daran vorbei.
 *   2. Der alte Basic-Auth-Riegel aus den Umgebungsvariablen. Er bleibt, weil
 *      er die App schützt, bevor der erste Benutzer ein Passwort gesetzt hat.
 *
 * Der 3CX-Webhook ist von beidem ausgenommen: Er hat seine eigene
 * Signaturprüfung und kommt von einer Maschine, nicht von einem Menschen.
 *
 * Hier wird nur geprüft, OB ein gültiges Sitzungs-Cookie vorliegt – wer
 * dahintersteckt und was er darf, entscheidet der Server in der jeweiligen
 * Route. Die Middleware läuft in der Edge-Laufzeit und kommt nicht an die
 * Datenbank.
 */
const OFFEN = [
  '/anmelden',
  '/api/auth/login',
  // Der Microsoft-Weg fuehrt selbst zur Anmeldung – er darf nicht hinter
  // der Anmeldung liegen.
  '/api/auth/microsoft',
  // Sagt nur, ob und wer angemeldet ist; ohne Sitzung kommt schlicht null.
  '/api/auth/ich',
  '/api/integrations/3cx/events',
];

export async function middleware(request: NextRequest) {
  const pfad = request.nextUrl.pathname;

  if (pfad.startsWith('/api/integrations/3cx/events')) return NextResponse.next();

  // --- Riegel 1: Basic Auth, falls hinterlegt ---
  const basicUser = process.env.DISPO_BASIC_AUTH_USER;
  const basicPass = process.env.DISPO_BASIC_AUTH_PASSWORD;
  if (basicUser && basicPass) {
    const header = request.headers.get('authorization') ?? '';
    let erlaubt = false;
    if (header.startsWith('Basic ')) {
      const [u, ...rest] = atob(header.slice(6)).split(':');
      erlaubt = u === basicUser && rest.join(':') === basicPass;
    }
    if (!erlaubt) {
      return new NextResponse('Zugriff nur für die interne Disposition.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="MR Umbau Dispo", charset="UTF-8"' },
      });
    }
  }

  // --- Riegel 2: Anmeldung ---
  if (OFFEN.some((o) => pfad === o || pfad.startsWith(`${o}/`))) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) return NextResponse.next();

  if (pfad.startsWith('/api/')) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  }

  const ziel = new URL('/anmelden', request.url);
  if (pfad !== '/') ziel.searchParams.set('weiter', pfad + request.nextUrl.search);
  return NextResponse.redirect(ziel);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
