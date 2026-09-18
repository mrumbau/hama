/**
 * Dateien in Box ablegen.
 *
 * Box spricht OAuth. Für etwas, das nachts ohne Menschen läuft, gibt es die
 * „Client Credentials Grant"-App: Sie bekommt ein eigenes Dienstkonto, das
 * man wie einen Kollegen auf einen Ordner einlädt. Kein Anmeldefenster, kein
 * Zertifikat, und der Zugriff endet, sobald man das Dienstkonto aus dem
 * Ordner wirft.
 *
 * Nötige Umgebungsvariablen (Vercel):
 *   BOX_CLIENT_ID, BOX_CLIENT_SECRET   – aus der Box-App
 *   BOX_SUBJECT_ID                     – die Enterprise-ID (oder Benutzer-ID)
 *   BOX_SUBJECT_TYPE                   – "enterprise" (Vorgabe) oder "user"
 *   BOX_ORDNER_ID                      – Zielordner
 */

const TOKEN_URL = 'https://api.box.com/oauth2/token';
const UPLOAD_URL = 'https://upload.box.com/api/2.0/files/content';

export interface BoxZugang {
  clientId: string;
  clientSecret: string;
  subjectId: string;
  subjectType: string;
  ordnerId: string;
}

/**
 * Was ist eingerichtet? Gibt `null` zurück, wenn etwas fehlt - der Aufrufer
 * entscheidet dann, ob das ein Fehler ist oder nur „noch nicht".
 */
export function boxZugang(env: Record<string, string | undefined> = process.env): BoxZugang | null {
  const clientId = env.BOX_CLIENT_ID?.trim();
  const clientSecret = env.BOX_CLIENT_SECRET?.trim();
  const subjectId = env.BOX_SUBJECT_ID?.trim();
  const ordnerId = env.BOX_ORDNER_ID?.trim();
  if (!clientId || !clientSecret || !subjectId || !ordnerId) return null;
  return {
    clientId,
    clientSecret,
    subjectId,
    subjectType: env.BOX_SUBJECT_TYPE?.trim() || 'enterprise',
    ordnerId,
  };
}

/** Welches Stück fehlt? Für die Anzeige in den Einstellungen. */
export function fehlendeBoxAngaben(env: Record<string, string | undefined> = process.env): string[] {
  const noetig = ['BOX_CLIENT_ID', 'BOX_CLIENT_SECRET', 'BOX_SUBJECT_ID', 'BOX_ORDNER_ID'];
  return noetig.filter((name) => !env[name]?.trim());
}

async function holeToken(zugang: BoxZugang): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: zugang.clientId,
      client_secret: zugang.clientSecret,
      box_subject_type: zugang.subjectType,
      box_subject_id: zugang.subjectId,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Box verweigert die Anmeldung (${res.status}): ${kurz(text)}`);
  const token = (JSON.parse(text) as { access_token?: string }).access_token;
  if (!token) throw new Error('Box hat kein Zugriffstoken geliefert.');
  return token;
}

export interface BoxAblage {
  dateiId: string;
  name: string;
  /** Neue Datei oder neue Fassung einer bestehenden? */
  neu: boolean;
}

/**
 * Datei in den Zielordner legen.
 *
 * Liegt der Name schon dort, antwortet Box mit 409 und nennt die bestehende
 * Datei. Dann laden wir eine neue Fassung hoch, statt den Lauf abzubrechen:
 * Zwei Sicherungen am selben Tag sind keine Störung, und Box hebt die
 * Vorfassungen ohnehin auf.
 */
export async function legeInBoxAb(
  zugang: BoxZugang,
  name: string,
  inhalt: string,
  typ = 'application/json',
): Promise<BoxAblage> {
  const token = await holeToken(zugang);
  const erste = await hochladen(token, UPLOAD_URL, name, inhalt, typ, zugang.ordnerId);

  if (erste.status === 409) {
    const vorhanden = konfliktId(erste.text);
    if (!vorhanden) throw new Error(`Box meldet einen Namenskonflikt: ${kurz(erste.text)}`);
    const zweite = await hochladen(
      token,
      `https://upload.box.com/api/2.0/files/${vorhanden}/content`,
      name,
      inhalt,
      typ,
    );
    if (!zweite.ok) throw new Error(`Box nimmt die neue Fassung nicht (${zweite.status}).`);
    return { dateiId: vorhanden, name, neu: false };
  }

  if (!erste.ok) throw new Error(`Box nimmt die Datei nicht an (${erste.status}): ${kurz(erste.text)}`);
  return { dateiId: ersteId(erste.text) ?? '', name, neu: true };
}

async function hochladen(
  token: string,
  url: string,
  name: string,
  inhalt: string,
  typ: string,
  ordnerId?: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const form = new FormData();
  form.append(
    'attributes',
    JSON.stringify(ordnerId ? { name, parent: { id: ordnerId } } : { name }),
  );
  form.append('file', new Blob([inhalt], { type: typ }), name);

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** Box nennt die bestehende Datei unter context_info.conflicts. */
export function konfliktId(text: string): string | null {
  try {
    const body = JSON.parse(text) as {
      context_info?: { conflicts?: { id?: string } | { id?: string }[] };
    };
    const k = body.context_info?.conflicts;
    if (!k) return null;
    return (Array.isArray(k) ? k[0]?.id : k.id) ?? null;
  } catch {
    return null;
  }
}

export function ersteId(text: string): string | null {
  try {
    return (JSON.parse(text) as { entries?: { id?: string }[] }).entries?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Fehlermeldungen von Box können sehr lang werden - und Tokens enthalten. */
function kurz(text: string): string {
  return text.replace(/[A-Za-z0-9_-]{40,}/g, '…').slice(0, 300);
}
