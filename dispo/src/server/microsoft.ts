/**
 * Anmeldung mit dem Microsoft-Konto (Entra ID).
 *
 * Der Ablauf ist der übliche OAuth2-Autorisierungscode-Fluss:
 *
 *   1. Wir schicken den Benutzer zu Microsoft.
 *   2. Er meldet sich dort mit seinem Firmenkonto an.
 *   3. Microsoft schickt ihn mit einem Code zurück.
 *   4. Wir tauschen den Code im Hintergrund gegen seine Identität.
 *
 * Wichtig dabei: Wir vertrauen nur dem, was in Schritt 4 über eine direkte,
 * verschlüsselte Verbindung von Microsoft kommt – nicht dem, was der Browser
 * mitbringt. Und angemeldet wird nur, wer hier bereits ein Konto hat:
 * Microsoft sagt uns, WER jemand ist, nicht, was er darf.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MicrosoftKonfiguration {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function microsoftKonfiguration(): MicrosoftKonfiguration | null {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

function basis(tenantId: string) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
}

/** Die Adresse, die in der App-Registrierung hinterlegt werden muss. */
export function rueckkehrAdresse(origin: string): string {
  return `${origin}/api/auth/microsoft/callback`;
}

// ---------------------------------------------------------------------------
// Schutz gegen untergeschobene Anmeldungen
// ---------------------------------------------------------------------------

/**
 * `state` verhindert, dass jemand einem Benutzer eine fremde Anmeldung
 * unterschiebt. Es ist signiert und läuft nach zehn Minuten ab – lange genug
 * für eine Anmeldung, zu kurz zum Sammeln.
 */
export function baueState(geheimnis: string, weiter: string, jetzt = Date.now()): string {
  const inhalt = `${jetzt}|${weiter}`;
  const sig = createHmac('sha256', geheimnis).update(inhalt).digest('hex');
  return Buffer.from(`${inhalt}|${sig}`).toString('base64url');
}

export function pruefeState(
  geheimnis: string,
  state: string | null,
  jetzt = Date.now(),
): { gueltig: boolean; weiter: string } {
  const ungueltig = { gueltig: false, weiter: '/plantafel' };
  if (!state) return ungueltig;

  let roh: string;
  try {
    roh = Buffer.from(state, 'base64url').toString('utf8');
  } catch {
    return ungueltig;
  }

  const teile = roh.split('|');
  if (teile.length !== 3) return ungueltig;
  const [zeit, weiter, sig] = teile;

  const erwartet = createHmac('sha256', geheimnis).update(`${zeit}|${weiter}`).digest('hex');
  if (sig.length !== erwartet.length) return ungueltig;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return ungueltig;

  const alter = jetzt - Number(zeit);
  if (!Number.isFinite(alter) || alter < 0 || alter > 10 * 60 * 1000) return ungueltig;

  return { gueltig: true, weiter: weiter || '/plantafel' };
}

// ---------------------------------------------------------------------------
// Die beiden Schritte
// ---------------------------------------------------------------------------

export function anmeldeAdresse(
  konfig: MicrosoftKonfiguration,
  redirectUri: string,
  state: string,
): string {
  const p = new URLSearchParams({
    client_id: konfig.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    // Mehr brauchen wir nicht: Name und E-Mail genügen, um die Person einem
    // vorhandenen Konto zuzuordnen. Kein Zugriff auf Postfach oder Kalender.
    scope: 'openid profile email',
    state,
  });
  return `${basis(konfig.tenantId)}/authorize?${p.toString()}`;
}

// ---------------------------------------------------------------------------
// Verständliche Fehlermeldungen
// ---------------------------------------------------------------------------

/**
 * Wie das hinterlegte Client-Geheimnis aussieht – ohne es je preiszugeben.
 *
 * In Entra stehen bei „Zertifikate & Geheimnisse" zwei Spalten nebeneinander:
 * „Wert" und „Geheimnis-ID". Gebraucht wird der **Wert**. Er ist nur direkt
 * nach dem Anlegen sichtbar, die ID dagegen immer – deshalb wird fast immer
 * die ID erwischt. Eine ID ist eine GUID, ein Wert nie.
 */
export type GeheimnisForm = 'wert' | 'id-statt-wert' | 'zu-kurz';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function geheimnisForm(clientSecret: string): GeheimnisForm {
  if (GUID.test(clientSecret.trim())) return 'id-statt-wert';
  if (clientSecret.trim().length < 30) return 'zu-kurz';
  return 'wert';
}

/**
 * Microsofts Antworten sind technisch korrekt und für den Anwender wertlos.
 * Hier wird daraus ein Satz, der sagt, was zu tun ist.
 */
export function erklaereMicrosoftFehler(rohantwort: string, form: GeheimnisForm): string {
  const code = /AADSTS\d+/.exec(rohantwort)?.[0] ?? '';

  switch (code) {
    case 'AADSTS7000215':
      return form === 'id-statt-wert'
        ? 'Microsoft weist das Client-Geheimnis zurück. In MICROSOFT_CLIENT_SECRET steht eine GUID – das ist die Geheimnis-ID, gebraucht wird die Spalte „Wert" aus „Zertifikate & Geheimnisse".'
        : form === 'zu-kurz'
          ? 'Microsoft weist das Client-Geheimnis zurück. Der hinterlegte Wert ist auffällig kurz, vermutlich beim Kopieren abgeschnitten.'
          : 'Microsoft weist das Client-Geheimnis zurück. Bitte in Entra ein neues Geheimnis anlegen und dessen „Wert" als MICROSOFT_CLIENT_SECRET hinterlegen.';
    case 'AADSTS7000222':
      return 'Das Client-Geheimnis ist abgelaufen. Bitte in Entra ein neues anlegen und dessen „Wert" als MICROSOFT_CLIENT_SECRET hinterlegen.';
    case 'AADSTS700016':
    case 'AADSTS900023':
      return 'Microsoft findet diese Anwendung nicht. Bitte MICROSOFT_CLIENT_ID und MICROSOFT_TENANT_ID prüfen.';
    case 'AADSTS50011':
      return 'Die Umleitungs-Adresse ist in der App-Registrierung nicht hinterlegt. Die benötigte Adresse steht in den Einstellungen unter „System".';
    case 'AADSTS65001':
      return 'Die Anwendung ist im Verzeichnis noch nicht freigegeben. Ein Administrator muss die Zustimmung erteilen.';
    default:
      return `Microsoft lehnte die Anmeldung ab${code ? ` (${code})` : ''}. ${rohantwort.slice(0, 200)}`;
  }
}

export interface MicrosoftIdentitaet {
  email: string;
  name: string | null;
  tenantId: string | null;
}

/**
 * Code gegen Identität tauschen.
 *
 * Das `id_token` kommt hier über eine direkte Verbindung zu Microsoft, mit
 * unserem Client-Geheimnis belegt – deshalb genügt es, seinen Inhalt zu
 * lesen. Es stammt nicht aus dem Browser und kann unterwegs nicht ausgetauscht
 * worden sein.
 */
export async function holeIdentitaet(
  konfig: MicrosoftKonfiguration,
  code: string,
  redirectUri: string,
): Promise<MicrosoftIdentitaet> {
  const res = await fetch(`${basis(konfig.tenantId)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: konfig.clientId,
      client_secret: konfig.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
    }).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(erklaereMicrosoftFehler(text, geheimnisForm(konfig.clientSecret)));
  }

  const daten = JSON.parse(text) as { id_token?: string };
  if (!daten.id_token) throw new Error('Microsoft lieferte kein id_token.');

  return leseIdToken(daten.id_token);
}

/** Liest den Inhalt eines JWT. Ohne Signaturprüfung – siehe oben. */
export function leseIdToken(idToken: string): MicrosoftIdentitaet {
  const teile = idToken.split('.');
  if (teile.length !== 3) throw new Error('Das id_token hat nicht das erwartete Format.');

  const inhalt = JSON.parse(Buffer.from(teile[1], 'base64url').toString('utf8')) as {
    email?: string;
    preferred_username?: string;
    upn?: string;
    name?: string;
    tid?: string;
  };

  // Microsoft liefert die Adresse je nach Kontotyp in verschiedenen Feldern.
  const email = inhalt.email ?? inhalt.preferred_username ?? inhalt.upn;
  if (!email) throw new Error('Microsoft lieferte keine E-Mail-Adresse.');

  return {
    email: email.trim().toLowerCase(),
    name: inhalt.name ?? null,
    tenantId: inhalt.tid ?? null,
  };
}
