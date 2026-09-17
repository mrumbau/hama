import { NextResponse } from 'next/server';
import {
  anmeldeAdresse,
  baueState,
  microsoftKonfiguration,
  rueckkehrAdresse,
} from '@/server/microsoft';
import { stateGeheimnis } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Start der Microsoft-Anmeldung: weiter zu Microsoft. */
export async function GET(request: Request) {
  const konfig = microsoftKonfiguration();
  const url = new URL(request.url);

  if (!konfig) {
    const ziel = new URL('/anmelden', url.origin);
    ziel.searchParams.set('fehler', 'Die Microsoft-Anmeldung ist noch nicht eingerichtet.');
    return NextResponse.redirect(ziel);
  }

  const weiter = url.searchParams.get('weiter') || '/plantafel';
  const state = baueState(stateGeheimnis(), weiter);

  return NextResponse.redirect(anmeldeAdresse(konfig, rueckkehrAdresse(url.origin), state));
}
