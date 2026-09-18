import { handler, ok } from '@/server/api';
import { geheimnisForm, microsoftKonfiguration, pruefeMicrosoftZugang } from '@/server/microsoft';

export const dynamic = 'force-dynamic';

/**
 * Prueft die Microsoft-Einrichtung, ohne dass jemand den Anmeldeknopf
 * druecken muss. Schlaegt die Anmeldung fehl, ist die naechste Frage immer
 * dieselbe: liegt es am Verzeichnis, an der Anwendung oder am Geheimnis?
 * Das beantwortet diese Pruefung, statt es den Benutzer raten zu lassen.
 *
 * Das Geheimnis selbst verlaesst den Server nie - nur die Aussage, ob es
 * angenommen wurde und welche Gestalt es hat.
 */
export const GET = handler(async (request: Request) => {
  const konfig = microsoftKonfiguration();
  if (!konfig) {
    return ok({
      eingerichtet: false,
      erfolg: false,
      meldung:
        'Es fehlen Angaben. Gebraucht werden MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID und MICROSOFT_CLIENT_SECRET.',
      geheimnis: null,
      umleitung: `${new URL(request.url).origin}/api/auth/microsoft/callback`,
    });
  }

  const ergebnis = await pruefeMicrosoftZugang(konfig);
  return ok({
    eingerichtet: true,
    ...ergebnis,
    geheimnis: geheimnisForm(konfig.clientSecret),
    umleitung: `${new URL(request.url).origin}/api/auth/microsoft/callback`,
  });
});
