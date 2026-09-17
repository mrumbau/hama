/**
 * Abgleich mit „Das Programm“ (Master-Prompt Abschnitt 17).
 *
 * Sync-Regeln:
 *   ERP führend       → Kunde, Anschrift, Projekt-/Auftragsnummer, Projektname,
 *                       Existenz von Mitarbeitern und Subunternehmern
 *   Dispo-App führend → Einsätze, Ampel, Material, Kundenbestätigung, Notizen,
 *                       Historie und der Fortschritt der Ausführung
 *
 * Der Abgleich läuft nur in eine Richtung: aus dem ERP herein. Zurück
 * schreiben kann die Schnittstelle bei Projekten nicht.
 */
import { prisma } from '@/lib/db';
import { isoToDbDate, dbDateToIso } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import type { ProjectStatusKey } from '@/lib/labels';
import { writeAudit } from '@/server/audit';
import { getErpProvider } from './index';
import {
  entscheideStatus,
  istSubunternehmer,
  kuerzel,
  leseAnsprechpartner,
  leseGewerke,
} from './mapping';

export interface SyncResult {
  provider: string;
  projekte: { neu: number; aktualisiert: number; unveraendert: number };
  mitarbeiter: { neu: number; aktualisiert: number };
  subunternehmer: { neu: number; aktualisiert: number; uebersprungen: number };
  hinweise: string[];
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
    const [erpProjekte, erpBenutzer, erpLieferanten] = await Promise.all([
      provider.getProjects(),
      provider.getEmployees(),
      provider.getSuppliers(),
    ]);

    const hinweise: string[] = [];

    // --- 1. Personen -----------------------------------------------------
    // Wer im ERP als Projektleiter hinterlegt ist, kommt als Bauleiter herein.
    const projektleiterIds = new Set(
      erpProjekte.map((p) => p.projectManagerErpId).filter((v): v is string => !!v),
    );

    const mitarbeiter = { neu: 0, aktualisiert: 0 };
    const bauleiterNachErpId = new Map<string, string>();

    for (const person of erpBenutzer) {
      const name = `${person.firstName} ${person.lastName}`.trim();
      if (!name) continue;

      if (projektleiterIds.has(person.erpId) || person.role?.toLowerCase().includes('bauleit')) {
        const vorhanden = await prisma.siteManager.findFirst({
          where: { firstName: person.firstName, lastName: person.lastName },
        });
        if (vorhanden) {
          bauleiterNachErpId.set(person.erpId, vorhanden.id);
          mitarbeiter.aktualisiert++;
        } else {
          const angelegt = await prisma.siteManager.create({
            data: {
              firstName: person.firstName,
              lastName: person.lastName,
              shortCode: await freiesKuerzel(kuerzel(person.firstName, person.lastName)),
              email: person.email,
              phone: person.phone,
            },
          });
          bauleiterNachErpId.set(person.erpId, angelegt.id);
          mitarbeiter.neu++;
          await writeAudit({
            entityType: 'site_manager',
            entityId: angelegt.id,
            action: 'created',
            label: `Bauleiter aus Das Programm übernommen: ${name}`,
            source: 'DAS_PROGRAMM',
          });
        }
        continue;
      }

      // Bürokräfte disponieren wir nicht mit.
      if (person.role && /büro|buero|office|verwaltung/i.test(person.role)) {
        hinweise.push(`${name} ist im ERP als „${person.role}" geführt und wurde übersprungen.`);
        continue;
      }

      const vorhanden = await prisma.employee.findFirst({
        where: { firstName: person.firstName, lastName: person.lastName },
      });
      if (vorhanden) {
        mitarbeiter.aktualisiert++;
      } else {
        const angelegt = await prisma.employee.create({
          data: {
            firstName: person.firstName,
            lastName: person.lastName,
            shortCode: await freiesKuerzel(kuerzel(person.firstName, person.lastName)),
            phone: person.phone,
          },
        });
        mitarbeiter.neu++;
        await writeAudit({
          entityType: 'employee',
          entityId: angelegt.id,
          action: 'created',
          label: `Mitarbeiter aus Das Programm übernommen: ${name}`,
          source: 'DAS_PROGRAMM',
        });
      }
    }

    // --- 2. Subunternehmer ----------------------------------------------
    const subs = { neu: 0, aktualisiert: 0, uebersprungen: 0 };

    for (const lieferant of erpLieferanten) {
      if (!istSubunternehmer(lieferant)) {
        subs.uebersprungen++;
        continue;
      }

      const gewerke = leseGewerke(lieferant.comment);
      const tradeIds: string[] = [];
      for (const gewerkName of gewerke) {
        const trade = await prisma.trade.upsert({
          where: { name: gewerkName },
          update: {},
          create: { name: gewerkName },
        });
        tradeIds.push(trade.id);
      }

      const vorhanden = await prisma.subcontractor.findFirst({
        where: { companyName: lieferant.name },
      });

      if (vorhanden) {
        await prisma.subcontractor.update({
          where: { id: vorhanden.id },
          data: {
            phone: lieferant.phone ?? vorhanden.phone,
            email: lieferant.email ?? vorhanden.email,
            street: lieferant.street ?? vorhanden.street,
            zip: lieferant.zip ?? vorhanden.zip,
            city: lieferant.city ?? vorhanden.city,
            contactName: leseAnsprechpartner(lieferant.comment) ?? vorhanden.contactName,
          },
        });
        subs.aktualisiert++;
      } else {
        const angelegt = await prisma.subcontractor.create({
          data: {
            companyName: lieferant.name,
            contactName: leseAnsprechpartner(lieferant.comment),
            phone: lieferant.phone,
            email: lieferant.email,
            street: lieferant.street,
            zip: lieferant.zip,
            city: lieferant.city,
            trades: tradeIds.length ? { create: tradeIds.map((tradeId) => ({ tradeId })) } : undefined,
          },
        });
        subs.neu++;
        await writeAudit({
          entityType: 'subcontractor',
          entityId: angelegt.id,
          action: 'created',
          label: `Subunternehmer aus Das Programm übernommen: ${lieferant.name}`,
          newValue: { gewerke },
          source: 'DAS_PROGRAMM',
        });
      }
    }

    // --- 3. Projekte ------------------------------------------------------
    const projekte = { neu: 0, aktualisiert: 0, unveraendert: 0 };

    for (const erp of erpProjekte) {
      const vorhanden = await prisma.project.findUnique({ where: { erpId: erp.erpId } });
      const bauleiterId = erp.projectManagerErpId
        ? (bauleiterNachErpId.get(erp.projectManagerErpId) ?? null)
        : null;

      // Vom ERP geführte Felder.
      const erpFelder = {
        orderNumber: erp.orderNumber,
        projectNumber: erp.referenceNumber,
        customerName: erp.customerName,
        name: erp.name,
        street: erp.street,
        zip: erp.zip,
        city: erp.city,
        contactName: erp.contactName,
        contactPhone: erp.contactPhone,
        contactEmail: erp.contactEmail,
      };

      if (!vorhanden) {
        const status = entscheideStatus(erp.status, 'NEU');
        const angelegt = await prisma.project.create({
          data: {
            erpId: erp.erpId,
            ...erpFelder,
            primarySiteManagerId: bauleiterId,
            plannedStart: erp.plannedStart ? isoToDbDate(erp.plannedStart) : null,
            plannedEnd: erp.plannedEnd ? isoToDbDate(erp.plannedEnd) : null,
            status: (status.neuerStatus ?? 'TERMINIERUNG_ERFORDERLICH') as never,
          },
        });
        projekte.neu++;
        await writeAudit({
          entityType: 'project',
          entityId: angelegt.id,
          projectId: angelegt.id,
          action: 'created',
          label: 'Projekt aus Das Programm übernommen',
          newValue: { erpId: erp.erpId, ...erpFelder },
          source: 'DAS_PROGRAMM',
        });
        continue;
      }

      const aenderungen: Record<string, { alt: unknown; neu: unknown }> = {};
      for (const [feld, wert] of Object.entries(erpFelder)) {
        const aktuell = (vorhanden as unknown as Record<string, unknown>)[feld];
        if ((aktuell ?? null) !== (wert ?? null)) aenderungen[feld] = { alt: aktuell, neu: wert };
      }

      const daten: Record<string, unknown> = { ...erpFelder };

      // Status: nur übernehmen, wenn er die Dispo-Planung nicht zurückdreht.
      const status = entscheideStatus(erp.status, vorhanden.status as ProjectStatusKey);
      if (status.neuerStatus) {
        daten.status = status.neuerStatus;
        aenderungen.status = { alt: vorhanden.status, neu: status.neuerStatus };
      }

      // Termine nur ergänzen, nie überschreiben.
      if (erp.plannedStart && !vorhanden.plannedStart) {
        daten.plannedStart = isoToDbDate(erp.plannedStart);
        aenderungen.plannedStart = { alt: null, neu: erp.plannedStart };
      } else if (
        erp.plannedStart &&
        vorhanden.plannedStart &&
        dbDateToIso(vorhanden.plannedStart) !== erp.plannedStart
      ) {
        hinweise.push(
          `${erp.orderNumber ?? erp.referenceNumber ?? erp.erpId}: ERP-Beginn ${erp.plannedStart}, ` +
            `Dispo-Beginn ${dbDateToIso(vorhanden.plannedStart)} – Dispo-Termin beibehalten.`,
        );
      }
      if (erp.plannedEnd && !vorhanden.plannedEnd) daten.plannedEnd = isoToDbDate(erp.plannedEnd);
      if (!vorhanden.primarySiteManagerId && bauleiterId) {
        daten.primarySiteManagerId = bauleiterId;
        aenderungen.primarySiteManagerId = { alt: null, neu: bauleiterId };
      }

      if (Object.keys(aenderungen).length === 0) {
        projekte.unveraendert++;
        continue;
      }

      await prisma.project.update({ where: { id: vorhanden.id }, data: daten });
      projekte.aktualisiert++;
      await writeAudit({
        entityType: 'project',
        entityId: vorhanden.id,
        projectId: vorhanden.id,
        action: 'synced',
        label: aenderungen.status
          ? 'Status aus Das Programm übernommen'
          : 'Projektdaten aus Das Programm aktualisiert',
        oldValue: Object.fromEntries(Object.entries(aenderungen).map(([k, v]) => [k, v.alt])),
        newValue: Object.fromEntries(Object.entries(aenderungen).map(([k, v]) => [k, v.neu])),
        source: 'DAS_PROGRAMM',
        note: aenderungen.status ? status.grund : null,
      });
    }

    const message =
      `Projekte: ${projekte.neu} neu, ${projekte.aktualisiert} aktualisiert, ${projekte.unveraendert} unverändert. ` +
      `Personen: ${mitarbeiter.neu} neu. ` +
      `Subunternehmer: ${subs.neu} neu, ${subs.uebersprungen} Lieferanten übersprungen.`;

    await prisma.syncState.update({
      where: { provider: 'das-programm' },
      data: {
        status: 'ERFOLGREICH',
        lastSyncAt: new Date(),
        lastMessage: message,
        itemsCreated: projekte.neu + mitarbeiter.neu + subs.neu,
        itemsUpdated: projekte.aktualisiert + subs.aktualisiert,
        itemsSkipped: projekte.unveraendert + subs.uebersprungen,
      },
    });

    return { provider: provider.name, projekte, mitarbeiter, subunternehmer: subs, hinweise, message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unbekannter Fehler beim Sync.';
    await prisma.syncState.update({
      where: { provider: 'das-programm' },
      data: { status: 'FEHLER', lastMessage: message, lastSyncAt: new Date() },
    });
    throw e;
  }
}

/** Kürzel müssen über Mitarbeiter und Bauleiter hinweg eindeutig sein. */
async function freiesKuerzel(basis: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const kandidat = i === 0 ? basis : `${basis}${i + 1}`;
    const [e, m] = await Promise.all([
      prisma.employee.findUnique({ where: { shortCode: kandidat } }),
      prisma.siteManager.findUnique({ where: { shortCode: kandidat } }),
    ]);
    if (!e && !m) return kandidat;
  }
  return `${basis}${Date.now().toString().slice(-3)}`;
}
