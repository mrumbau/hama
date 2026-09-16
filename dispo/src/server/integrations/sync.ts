/**
 * Projekt-Synchronisation mit „Das Programm“ (Master-Prompt Abschnitt 17).
 *
 * Sync-Regeln:
 *   ERP führend      → Kunde, Anschrift, Auftrags-/Projektnummer, Projektname
 *   Dispo-App führend → Bauleiter, Status, Ampel, Material, Einsätze, Notizen
 *
 * Deshalb wird beim Update nur die ERP-Spalte überschrieben. Termine werden
 * nur dann übernommen, wenn die Dispo-App noch keine eigenen gesetzt hat –
 * sonst würde eine telefonisch vereinbarte Verschiebung stillschweigend
 * zurückgesetzt.
 */
import { prisma } from '@/lib/db';
import { isoToDbDate, dbDateToIso } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import { writeAudit } from '@/server/audit';
import { getErpProvider } from './index';
import type { ErpProject } from './erp-provider';

export interface SyncResult {
  provider: string;
  created: number;
  updated: number;
  skipped: number;
  conflicts: string[];
  message: string;
}

export async function syncProjects(): Promise<SyncResult> {
  const provider = getErpProvider();

  await prisma.syncState.upsert({
    where: { provider: 'das-programm' },
    update: { status: 'LAEUFT' },
    create: { provider: 'das-programm', status: 'LAEUFT' },
  });

  try {
    const [erpProjects, managers] = await Promise.all([
      provider.getProjects(),
      prisma.siteManager.findMany(),
    ]);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const conflicts: string[] = [];

    for (const erp of erpProjects) {
      const existing = await prisma.project.findUnique({ where: { erpId: erp.erpId } });

      // Bauleiter nur zuordnen, wenn der Name eindeutig passt.
      const matchedManager =
        erp.siteManagerName
          ? managers.find(
              (m) => fullName(m).toLowerCase() === erp.siteManagerName!.trim().toLowerCase(),
            )
          : undefined;

      // --- ERP-geführte Felder ---
      const erpFields = {
        orderNumber: erp.orderNumber,
        projectNumber: erp.projectNumber,
        customerName: erp.customerName,
        name: erp.name,
        street: erp.street,
        zip: erp.zip,
        city: erp.city,
        contactName: erp.contactName,
        contactPhone: erp.contactPhone,
        contactEmail: erp.contactEmail,
      };

      if (!existing) {
        const project = await prisma.project.create({
          data: {
            erpId: erp.erpId,
            ...erpFields,
            primarySiteManagerId: matchedManager?.id ?? null,
            plannedStart: erp.plannedStart ? isoToDbDate(erp.plannedStart) : null,
            plannedEnd: erp.plannedEnd ? isoToDbDate(erp.plannedEnd) : null,
            status: erp.plannedStart ? 'GEPLANT' : 'TERMINIERUNG_ERFORDERLICH',
          },
        });
        created++;
        await writeAudit({
          entityType: 'project',
          entityId: project.id,
          projectId: project.id,
          action: 'created',
          label: 'Projekt aus Das Programm übernommen',
          newValue: { erpId: erp.erpId, ...erpFields },
          source: 'DAS_PROGRAMM',
        });
        continue;
      }

      const changes: Record<string, { old: unknown; next: unknown }> = {};
      for (const [key, value] of Object.entries(erpFields)) {
        const current = (existing as unknown as Record<string, unknown>)[key];
        if ((current ?? null) !== (value ?? null)) changes[key] = { old: current, next: value };
      }

      // Termine nur ergänzen, nie überschreiben.
      const data: Record<string, unknown> = { ...erpFields };
      if (erp.plannedStart && !existing.plannedStart) {
        data.plannedStart = isoToDbDate(erp.plannedStart);
        changes.plannedStart = { old: null, next: erp.plannedStart };
      } else if (
        erp.plannedStart &&
        existing.plannedStart &&
        dbDateToIso(existing.plannedStart) !== erp.plannedStart
      ) {
        // Abweichung melden, aber die Dispo-Planung gewinnt.
        conflicts.push(
          `${erp.orderNumber ?? erp.erpId}: ERP-Beginn ${erp.plannedStart}, Dispo-Beginn ` +
            `${dbDateToIso(existing.plannedStart)} – Dispo-Termin wurde beibehalten.`,
        );
      }
      if (erp.plannedEnd && !existing.plannedEnd) {
        data.plannedEnd = isoToDbDate(erp.plannedEnd);
      }
      if (!existing.primarySiteManagerId && matchedManager) {
        data.primarySiteManagerId = matchedManager.id;
        changes.primarySiteManagerId = { old: null, next: matchedManager.id };
      }

      if (Object.keys(changes).length === 0) {
        skipped++;
        continue;
      }

      await prisma.project.update({ where: { id: existing.id }, data });
      updated++;
      await writeAudit({
        entityType: 'project',
        entityId: existing.id,
        projectId: existing.id,
        action: 'synced',
        label: 'Projektdaten aus Das Programm aktualisiert',
        oldValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.old])),
        newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.next])),
        source: 'DAS_PROGRAMM',
      });
    }

    const message =
      `${created} neu, ${updated} aktualisiert, ${skipped} unverändert.` +
      (conflicts.length ? ` ${conflicts.length} Termin-Abweichung(en) gemeldet.` : '');

    await prisma.syncState.update({
      where: { provider: 'das-programm' },
      data: {
        status: 'ERFOLGREICH',
        lastSyncAt: new Date(),
        lastMessage: message,
        itemsCreated: created,
        itemsUpdated: updated,
        itemsSkipped: skipped,
      },
    });

    return { provider: provider.name, created, updated, skipped, conflicts, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unbekannter Fehler beim Sync.';
    await prisma.syncState.update({
      where: { provider: 'das-programm' },
      data: { status: 'FEHLER', lastMessage: message, lastSyncAt: new Date() },
    });
    throw e;
  }
}
