import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optionaler, sehr einfacher Zugriffsschutz (Master-Prompt Abschnitt 31).
 *
 * Das ist KEINE Benutzerverwaltung – nur ein Riegel, falls die App öffentlich
 * erreichbar ist. Ohne gesetzte Umgebungsvariablen passiert hier nichts.
 * Der 3CX-Webhook ist ausgenommen, er hat seine eigene Signaturprüfung.
 */
export function middleware(request: NextRequest) {
  const user = process.env.DISPO_BASIC_AUTH_USER;
  const password = process.env.DISPO_BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/integrations/3cx/events')) {
    return NextResponse.next();
  }

  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [providedUser, ...rest] = atob(header.slice(6)).split(':');
    if (providedUser === user && rest.join(':') === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Zugriff nur für die interne Disposition.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MR Umbau Dispo", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
