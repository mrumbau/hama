/**
 * Anmeldung und Rechte.
 *
 * Bewusst ohne fremde Bibliothek: Drei Bauleiter brauchen kein
 * Identitätsframework, und jede Abhängigkeit an dieser Stelle ist eine, die
 * man pflegen muss. Verwendet wird ausschliesslich, was Node mitbringt –
 * `scrypt` fürs Passwort, HMAC fürs Sitzungs-Cookie.
 *
 * Die Anmeldung mit Microsoft-Konto lässt sich später danebenstellen: Die
 * Rechte hängen am Benutzer, nicht am Anmeldeweg.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { ApiError } from './api';
import { SESSION_COOKIE } from './auth-edge';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export { SESSION_COOKIE } from './auth-edge';
/** Sieben Tage – lange genug, dass niemand täglich tippt. */
const SESSION_TAGE = 7;

export type Rolle = 'ADMIN' | 'LEITUNG' | 'BAULEITER';

export interface AngemeldeterBenutzer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Rolle;
  siteManagerId: string | null;
}

// ---------------------------------------------------------------------------
// Passwörter
// ---------------------------------------------------------------------------

/**
 * `scrypt` mit zufälligem Salz. Das Ergebnis ist `salz:hash`, beides hex.
 * Die Parameter sind Nodes Vorgaben – bewusst nicht selbst geschraubt.
 */
export async function hashePasswort(passwort: string): Promise<string> {
  const salz = randomBytes(16).toString('hex');
  const hash = await scryptAsync(passwort, salz, 64);
  return `${salz}:${hash.toString('hex')}`;
}

export async function passwortStimmt(passwort: string, gespeichert: string): Promise<boolean> {
  const [salz, hash] = gespeichert.split(':');
  if (!salz || !hash) return false;
  const geprueft = await scryptAsync(passwort, salz, 64);
  const erwartet = Buffer.from(hash, 'hex');
  // Zeitkonstanter Vergleich: sonst verrät die Dauer, wie weit man war.
  return geprueft.length === erwartet.length && timingSafeEqual(geprueft, erwartet);
}

// ---------------------------------------------------------------------------
// Sitzung
// ---------------------------------------------------------------------------

/**
 * Schlüssel für die Cookie-Signatur.
 *
 * Ohne `DISPO_AUTH_SECRET` wird er aus der Datenbankadresse abgeleitet. Die
 * enthält ein Passwort, ist also nicht zu erraten, und bleibt über Neustarts
 * und mehrere Instanzen hinweg gleich – sonst würde jeder Neustart alle
 * Anmeldungen ungültig machen.
 */
function schluessel(): string {
  const eigen = process.env.DISPO_AUTH_SECRET?.trim();
  if (eigen) return eigen;
  return `abgeleitet:${process.env.DATABASE_URL ?? 'ohne-datenbank'}`;
}

function signiere(inhalt: string): string {
  return createHmac('sha256', schluessel()).update(inhalt).digest('hex');
}

export function baueSitzung(userId: string, jetzt = Date.now()): string {
  const gueltigBis = jetzt + SESSION_TAGE * 24 * 60 * 60 * 1000;
  const inhalt = `${userId}.${gueltigBis}`;
  return `${inhalt}.${signiere(inhalt)}`;
}

export function leseSitzung(wert: string | undefined, jetzt = Date.now()): string | null {
  if (!wert) return null;
  const teile = wert.split('.');
  if (teile.length !== 3) return null;
  const [userId, gueltigBis, unterschrift] = teile;

  const erwartet = signiere(`${userId}.${gueltigBis}`);
  if (unterschrift.length !== erwartet.length) return null;
  if (!timingSafeEqual(Buffer.from(unterschrift), Buffer.from(erwartet))) return null;

  if (!Number.isFinite(Number(gueltigBis)) || Number(gueltigBis) < jetzt) return null;
  return userId;
}

// ---------------------------------------------------------------------------
// Wer ist angemeldet?
// ---------------------------------------------------------------------------

export async function aktuellerBenutzer(): Promise<AngemeldeterBenutzer | null> {
  const store = await cookies();
  const userId = leseSitzung(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;

  // Die Verknuepfung zum Bauleiter-Datensatz kann fehlen, wenn der Benutzer
  // frueher angelegt wurde als der Bauleiter – etwa weil jemand erst spaeter
  // die Faehigkeit "Bauleitung" bekommen hat. Dann suchen wir sie einmal
  // ueber den Namen und merken sie uns.
  let siteManagerId = user.siteManagerId;
  if (!siteManagerId) {
    const passend = await prisma.siteManager.findFirst({
      where: { firstName: user.firstName, lastName: user.lastName, active: true },
    });
    if (passend) {
      siteManagerId = passend.id;
      await prisma.user.update({ where: { id: user.id }, data: { siteManagerId } });
    }
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as Rolle,
    siteManagerId,
  };
}

// ---------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------

/**
 * Wer darf was.
 *
 * Die Liste ist kurz und absichtlich keine Matrix: Was hier nicht steht,
 * darf jeder angemeldete Benutzer. Planen, Stammdaten pflegen, Gewerke
 * anlegen und den Abgleich anstossen gehoert zur taeglichen Arbeit aller
 * drei Bauleiter – da etwas zu sperren, kostet nur Rueckfragen.
 */
export const RECHTE = {
  /** Einstellungen aendern (Schluessel, Secrets, Konfiguration). */
  einstellungenAendern: ['ADMIN'],
  /** Systemansicht: Datenbestand, Backups, Demo-Daten entfernen. */
  system: ['ADMIN'],
  /** Vollstaendiges Aenderungsprotokoll ueber alle Baustellen. */
  protokoll: ['ADMIN', 'LEITUNG'],
  /** Benutzer anlegen und Rollen vergeben. */
  benutzerverwaltung: ['ADMIN'],
} as const satisfies Record<string, readonly Rolle[]>;

export type Recht = keyof typeof RECHTE;

export function darf(benutzer: { role: Rolle } | null, recht: Recht): boolean {
  if (!benutzer) return false;
  return (RECHTE[recht] as readonly Rolle[]).includes(benutzer.role);
}

/**
 * Wirft, wenn der Angemeldete das Recht nicht hat.
 *
 * Bewusst serverseitig: Eine Oberfläche, die einen Knopf versteckt, ist eine
 * Bequemlichkeit, keine Absicherung. Wer die Adresse kennt, ruft sie direkt
 * auf – hier wird es entschieden.
 */
export async function verlange(recht: Recht): Promise<AngemeldeterBenutzer> {
  const benutzer = await aktuellerBenutzer();
  if (!benutzer) {
    throw new ApiError('Nicht angemeldet.', 401);
  }
  if (!darf(benutzer, recht)) {
    throw new ApiError('Dafür fehlt Ihnen die Berechtigung.', 403);
  }
  return benutzer;
}
