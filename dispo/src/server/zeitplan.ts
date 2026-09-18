/**
 * Weckrufe ohne Menschen.
 *
 * Der Zeitplan in der Datenbank ruft die App über HTTP. Er hat keine
 * Sitzung, also weist er sich mit einem Geheimnis aus, das die Datenbank
 * selbst erzeugt hat (Migration 20260918110000). Damit steht es weder im
 * Repository noch muss es jemand von Hand eintragen.
 */
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';

export const ZEITPLAN_HEADER = 'x-dispo-cron';

/** Kommt dieser Aufruf vom Zeitplan? */
export async function stammtVomZeitplan(mitgebracht: string | null | undefined): Promise<boolean> {
  const wert = mitgebracht?.trim();
  if (!wert) return false;

  const ausDerUmgebung = process.env.DISPO_CRON_TOKEN?.trim();
  if (ausDerUmgebung && zeitgleich(ausDerUmgebung, wert)) return true;

  const zeile = await prisma.setting.findUnique({ where: { key: 'cronToken' } });
  return Boolean(zeile?.value && zeitgleich(zeile.value.trim(), wert));
}

/**
 * Vergleich ohne Zeitverrat: Ein früher Abbruch beim ersten falschen
 * Zeichen lässt das Geheimnis Stück für Stück erraten.
 */
export function zeitgleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
