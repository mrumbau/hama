/**
 * Wer die Fähigkeit „Bauleitung“ trägt, ist Bauleiter.
 *
 * In „Das Programm“ gibt es Benutzer (die Projektleiter sein können) und
 * Mitarbeiter – zwei getrennte Listen. Die Dispo führt beides zusammen:
 * Bauleiter hängen an Projekten, Mitarbeiter stehen auf der Plantafel.
 *
 * Bekommt ein Mitarbeiter die Fähigkeit „Bauleitung“, reicht es nicht, ihn
 * auf der Tafel umzusortieren – er muss auch am Projekt auswählbar sein.
 * Dafür braucht er einen Bauleiter-Datensatz. Der wird hier angelegt und
 * über die ERP-ID mit dem Mitarbeiter verknüpft, damit aus einer Person
 * nicht zwei Zeilen werden.
 */
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';
import { uniqueShortCode } from '@/server/resource-schemas';

export const BAULEITUNG_FAEHIGKEIT = 'bauleitung';

/**
 * Sorgt dafür, dass es zu diesem Mitarbeiter einen Bauleiter gibt – oder
 * eben keinen mehr, wenn die Fähigkeit wieder entfernt wurde.
 *
 * Ein bestehender Bauleiter wird nie gelöscht: an ihm hängen Projekte und
 * Einsätze. Er wird nur inaktiv gesetzt.
 */
export async function pflegeBauleitung(
  employeeId: string,
): Promise<'angelegt' | 'stillgelegt' | null> {
  const mitarbeiter = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { trades: { include: { trade: true } } },
  });
  if (!mitarbeiter) return null;

  const leitetBau = mitarbeiter.trades.some(
    (t) => t.trade.name.trim().toLowerCase() === BAULEITUNG_FAEHIGKEIT,
  );

  const vorhanden = await prisma.siteManager.findFirst({
    where: {
      OR: [
        ...(mitarbeiter.erpId ? [{ erpId: mitarbeiter.erpId }] : []),
        { firstName: mitarbeiter.firstName, lastName: mitarbeiter.lastName },
      ],
    },
  });

  /*
   * Gibt es zu dieser Person ein Benutzerkonto, haengen wir es an den
   * Bauleiter-Datensatz. Davon haengt ab, welche Baustellen in „Offene
   * Punkte" als seine gelten - und das gilt auch dann, wenn der Bauleiter
   * schon vorher da war. Genau dieser Fall ist frueher durchgerutscht.
   */
  const verknuepfeBenutzer = (siteManagerId: string) =>
    prisma.user.updateMany({
      where: {
        firstName: mitarbeiter.firstName,
        lastName: mitarbeiter.lastName,
        siteManagerId: null,
      },
      data: { siteManagerId },
    });

  if (leitetBau) {
    if (vorhanden) {
      await verknuepfeBenutzer(vorhanden.id);
      if (vorhanden.active) return null;
      await prisma.siteManager.update({ where: { id: vorhanden.id }, data: { active: true } });
      return 'angelegt';
    }

    const angelegt = await prisma.siteManager.create({
      data: {
        erpId: mitarbeiter.erpId,
        firstName: mitarbeiter.firstName,
        lastName: mitarbeiter.lastName,
        shortCode: await uniqueShortCode(
          `${mitarbeiter.firstName[0] ?? ''}${mitarbeiter.lastName[0] ?? ''}`,
        ),
        phone: mitarbeiter.phone,
      },
    });
    await verknuepfeBenutzer(angelegt.id);

    await writeAudit({
      entityType: 'site_manager',
      entityId: angelegt.id,
      action: 'created',
      label: `Als Bauleiter übernommen: ${mitarbeiter.firstName} ${mitarbeiter.lastName}`,
      note: 'Fähigkeit „Bauleitung“ gesetzt.',
    });
    return 'angelegt';
  }

  // Fähigkeit weg: nur stilllegen, nie löschen – Projekte hängen daran.
  if (vorhanden?.active) {
    await prisma.siteManager.update({ where: { id: vorhanden.id }, data: { active: false } });
    await writeAudit({
      entityType: 'site_manager',
      entityId: vorhanden.id,
      action: 'updated',
      label: `Nicht mehr als Bauleiter geführt: ${mitarbeiter.firstName} ${mitarbeiter.lastName}`,
      note: 'Fähigkeit „Bauleitung“ entfernt. Bestehende Zuordnungen bleiben.',
    });
    return 'stillgelegt';
  }

  return null;
}

/**
 * Dasselbe für alle auf einmal.
 *
 * Die Fähigkeit kann auf mehreren Wegen an eine Person kommen: von Hand in
 * der Mitarbeiterliste, beim Anlegen, oder aus „Das Programm". Sich darauf zu
 * verlassen, dass jeder dieser Wege daran denkt, hat schon einmal nicht
 * funktioniert. Deshalb wird nach jedem Abgleich einmal über alle gegangen –
 * das ist billig und kann nicht vergessen werden.
 *
 * Nur Nachholen, nie Stilllegen: Wer die Fähigkeit nicht (mehr) trägt, wird
 * hier nicht angefasst. Das entscheidet die Mitarbeiterliste, nicht der Sync.
 */
export async function gleicheBauleitungAb(): Promise<string[]> {
  const kandidaten = await prisma.employee.findMany({
    where: {
      active: true,
      trades: { some: { trade: { name: { equals: BAULEITUNG_FAEHIGKEIT, mode: 'insensitive' } } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });

  const neu: string[] = [];
  for (const k of kandidaten) {
    if ((await pflegeBauleitung(k.id)) === 'angelegt') {
      neu.push(`${k.firstName} ${k.lastName}`);
    }
  }
  return neu;
}
