/**
 * Einen Subunternehmer in „Das Programm“ anlegen.
 *
 * Dort gibt es keine eigene Gruppe für Subunternehmer – sie stehen unter den
 * Lieferanten und werden im Kommentarfeld gekennzeichnet. Genau diese
 * Kennzeichnung schreiben wir, und zwar in derselben Form, in der sie dort
 * gepflegt wird:
 *
 *   Subunternehmer – Trockenbau, Innenausbau
 *
 * Damit findet der Abgleich den Betrieb beim nächsten Lauf von selbst wieder
 * und liest die Gewerke daraus zurück.
 *
 * Ob die Schnittstelle das Anlegen überhaupt kann, verrät erst der Versuch.
 * Die Dokumentation zählt keine Lieferanten-Mutation auf – lag bei den
 * Argumentnamen aber schon daneben. Scheitert es, wird der Subunternehmer
 * trotzdem in der Dispo angelegt und der Grund festgehalten.
 */
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { getErpProvider } from './index';

export interface UebertragErgebnis {
  versucht: boolean;
  erfolg: boolean;
  erpId: string | null;
  nachricht: string;
}

/** Baut den Kommentar, den „Das Programm“ am Lieferanten führt. */
export function baueKommentar(gewerke: string[], notiz: string | null): string {
  const zeilen: string[] = [];
  zeilen.push(gewerke.length ? `Subunternehmer – ${gewerke.join(', ')}` : 'Subunternehmer');
  // Dieselbe Zeile, aus der der Abgleich die Gewerke wieder ausliest.
  if (gewerke.length) zeilen.push(`Tätigkeit: Subunternehmer – ${gewerke.join(', ')}`);
  if (notiz?.trim()) zeilen.push(notiz.trim());
  zeilen.push('Sub aktiv');
  return zeilen.join('\n');
}

export async function uebertrageSubAnErp(
  subcontractorId: string,
  daten: {
    companyName: string;
    street: string | null;
    zip: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    note: string | null;
    gewerke: string[];
  },
): Promise<UebertragErgebnis> {
  const provider = getErpProvider();

  if (!provider.createSupplier) {
    return {
      versucht: false,
      erfolg: false,
      erpId: null,
      nachricht: 'Der eingestellte ERP-Zugang kann keine Lieferanten anlegen.',
    };
  }

  // Hausnummer aus der Straße lösen – „Das Programm“ führt sie getrennt.
  const { strasse, hausnummer } = trenneHausnummer(daten.street);

  try {
    const angelegt = await provider.createSupplier({
      name: daten.companyName,
      street: strasse,
      houseNumber: hausnummer,
      zip: daten.zip,
      city: daten.city,
      phone: daten.phone,
      email: daten.email,
      comment: baueKommentar(daten.gewerke, daten.note),
    });

    await prisma.subcontractor.update({
      where: { id: subcontractorId },
      data: { erpId: angelegt.erpId, erpFehler: null },
    });

    await writeAudit({
      entityType: 'subcontractor',
      entityId: subcontractorId,
      action: 'synced',
      label: `In Das Programm als Lieferant angelegt${angelegt.referenceNumber ? ` (${angelegt.referenceNumber})` : ''}`,
      newValue: { erpId: angelegt.erpId },
      source: 'DAS_PROGRAMM',
    });

    return {
      versucht: true,
      erfolg: true,
      erpId: angelegt.erpId,
      nachricht: angelegt.referenceNumber
        ? `In Das Programm angelegt (${angelegt.referenceNumber}).`
        : 'In Das Programm angelegt.',
    };
  } catch (e) {
    const nachricht = e instanceof Error ? e.message : 'Unbekannter Fehler.';

    // Der Subunternehmer bleibt bestehen – nur der Übertrag fehlt, und das
    // steht ab jetzt an ihm dran.
    await prisma.subcontractor
      .update({ where: { id: subcontractorId }, data: { erpFehler: nachricht } })
      .catch(() => undefined);

    await writeAudit({
      entityType: 'subcontractor',
      entityId: subcontractorId,
      action: 'updated',
      label: 'Übertrag nach Das Programm fehlgeschlagen',
      source: 'DAS_PROGRAMM',
      note: nachricht,
    }).catch(() => undefined);

    return { versucht: true, erfolg: false, erpId: null, nachricht };
  }
}

/**
 * „Rosenstraße 12a“ → { strasse: 'Rosenstraße', hausnummer: '12a' }
 * Ohne erkennbare Hausnummer bleibt alles in der Straße stehen.
 */
export function trenneHausnummer(eingabe: string | null): {
  strasse: string | null;
  hausnummer: string | null;
} {
  if (!eingabe?.trim()) return { strasse: null, hausnummer: null };
  const treffer = /^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)$/.exec(
    eingabe.trim(),
  );
  if (!treffer) return { strasse: eingabe.trim(), hausnummer: null };
  return { strasse: treffer[1].trim(), hausnummer: treffer[2].replace(/\s+/g, '') };
}
