/**
 * Abgleich mit „Das Programm“ (Master-Prompt Abschnitt 17).
 *
 * Sync-Regeln:
 *   ERP führend       → Kunde, Anschrift, Projekt-/Auftragsnummer, Projektname,
 *                       Existenz von Mitarbeitern und Subunternehmern
 *   Dispo-App führend → Einsätze, Ampel, Material, Kundenbestätigung, Notizen,
 *                       Historie und der Fortschritt der Ausführung
 *
 * Hereinlesen ist der Normalfall. Den Projektstatus schreibt die Dispo auch
 * zurück – aber nicht hier, sondern in dem Moment, in dem ihn jemand ändert
 * (siehe `writeback.ts`).
 */
import { prisma } from '@/lib/db';
import { isoToDbDate, dbDateToIso } from '@/lib/dates';
import { fullName } from '@/lib/utils';
import { erpStatusName, type ProjectStatusKey } from '@/lib/labels';
import { writeAudit } from '@/server/audit';
import { getErpProvider } from './index';
import {
  entscheideStatus,
  gehoertAufDieTafel,
  istGesperrt,
  istSubunternehmer,
  kuerzel,
  leseAnsprechpartner,
  leseGewerke,
} from './mapping';

export interface SyncResult {
  provider: string;
  projekte: { neu: number; aktualisiert: number; unveraendert: number };
  mitarbeiter: { neu: number; aktualisiert: number; ausgeschieden: number };
  subunternehmer: { neu: number; aktualisiert: number; uebersprungen: number; gesperrt: number };
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

    // Was der Provider beim Abruf gemeldet hat, gehört in denselben Bericht.
    const hinweise: string[] = [...(provider.hinweise ?? [])];

    // --- 1. Personen -----------------------------------------------------
    // Wer im ERP als Projektleiter an einem Projekt hängt, ist Bauleiter.
    // Achtung: `projectManagerId` zeigt auf einen Benutzer (Login), der
    // Personalstammsatz hat eine eigene ID – verglichen wird deshalb über
    // `userErpId`.
    const projektleiterIds = new Set(
      erpProjekte.map((p) => p.projectManagerErpId).filter((v): v is string => !!v),
    );

    const mitarbeiter = { neu: 0, aktualisiert: 0, ausgeschieden: 0 };
    /** Benutzer-ID des Projektleiters → Bauleiter-ID in der Dispo. */
    const bauleiterNachErpId = new Map<string, string>();

    for (const person of erpBenutzer) {
      const name = `${person.firstName} ${person.lastName}`.trim();
      if (!name) continue;

      const istProjektleiter =
        (person.userErpId !== null && projektleiterIds.has(person.userErpId)) ||
        projektleiterIds.has(person.erpId) ||
        Boolean(person.role?.toLowerCase().includes('bauleit'));

      // Ausgeschiedene gehören von der Plantafel herunter – aber gelöscht
      // wird nichts, sonst verschwindet die Historie ihrer Einsätze.
      if (person.ausgeschieden) {
        const stillgelegt = await stillegen(person.erpId, person.firstName, person.lastName);
        if (stillgelegt) {
          mitarbeiter.ausgeschieden++;
          hinweise.push(`${name} ist im ERP ausgeschieden und wurde auf inaktiv gesetzt.`);
        }
        continue;
      }

      if (istProjektleiter) {
        const vorhanden =
          (await prisma.siteManager.findFirst({ where: { erpId: person.erpId } })) ??
          (await prisma.siteManager.findFirst({
            where: { firstName: person.firstName, lastName: person.lastName },
          }));
        if (vorhanden) {
          if (!vorhanden.erpId || vorhanden.isDemo) {
            await prisma.siteManager.update({
              where: { id: vorhanden.id },
              data: { erpId: person.erpId, isDemo: false },
            });
          }
          if (person.userErpId) bauleiterNachErpId.set(person.userErpId, vorhanden.id);
          bauleiterNachErpId.set(person.erpId, vorhanden.id);
          mitarbeiter.aktualisiert++;
        } else {
          const angelegt = await prisma.siteManager.create({
            data: {
              erpId: person.erpId,
              firstName: person.firstName,
              lastName: person.lastName,
              shortCode: await freiesKuerzel(kuerzel(person.firstName, person.lastName)),
              email: person.email,
              phone: person.phone,
            },
          });
          if (person.userErpId) bauleiterNachErpId.set(person.userErpId, angelegt.id);
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

      // Bürokräfte disponieren wir nicht mit, sofern das ERP die Funktion kennt.
      if (person.role && /büro|buero|office|verwaltung/i.test(person.role)) {
        hinweise.push(`${name} ist im ERP als „${person.role}" geführt und wurde übersprungen.`);
        continue;
      }

      const vorhanden =
        (await prisma.employee.findFirst({ where: { erpId: person.erpId } })) ??
        (await prisma.employee.findFirst({
          where: { firstName: person.firstName, lastName: person.lastName },
        }));
      if (vorhanden) {
        // `active` bleibt unangetastet: wer hier von Hand auf inaktiv gesetzt
        // wurde, soll nicht beim nächsten Sync wieder auftauchen.
        await prisma.employee.update({
          where: { id: vorhanden.id },
          data: { erpId: person.erpId, phone: person.phone ?? vorhanden.phone, isDemo: false },
        });
        mitarbeiter.aktualisiert++;
      } else {
        const angelegt = await prisma.employee.create({
          data: {
            erpId: person.erpId,
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
    const subs = { neu: 0, aktualisiert: 0, uebersprungen: 0, gesperrt: 0 };

    for (const lieferant of erpLieferanten) {
      if (!istSubunternehmer(lieferant)) {
        subs.uebersprungen++;
        continue;
      }

      // Gesperrte gehören nicht auf die Plantafel. Bereits übernommene
      // werden stillgelegt, nicht gelöscht – ihre Einsatzhistorie bleibt.
      if (istGesperrt(lieferant.comment)) {
        subs.gesperrt++;
        const betroffen = await prisma.subcontractor.updateMany({
          where: {
            OR: [{ erpId: lieferant.erpId }, { companyName: lieferant.name }],
            active: true,
          },
          data: { active: false },
        });
        if (betroffen.count > 0) {
          hinweise.push(`${lieferant.name} ist im ERP gesperrt und wurde auf inaktiv gesetzt.`);
        }
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

      const vorhanden =
        (await prisma.subcontractor.findFirst({ where: { erpId: lieferant.erpId } })) ??
        (await prisma.subcontractor.findFirst({ where: { companyName: lieferant.name } }));

      if (vorhanden) {
        await prisma.subcontractor.update({
          where: { id: vorhanden.id },
          data: {
            erpId: lieferant.erpId,
            isDemo: false,
            companyName: lieferant.name,
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
            erpId: lieferant.erpId,
            isDemo: false,
            companyName: lieferant.name,
            contactName: leseAnsprechpartner(lieferant.comment),
            phone: lieferant.phone,
            email: lieferant.email,
            street: lieferant.street,
            zip: lieferant.zip,
            city: lieferant.city,
            trades: tradeIds.length
              ? { create: tradeIds.map((tradeId) => ({ tradeId })) }
              : undefined,
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

    let nichtAufDerTafel = 0;

    for (const erp of erpProjekte) {
      const vorhanden = await prisma.project.findUnique({ where: { erpId: erp.erpId } });

      // Was nicht beauftragt ist, wird gar nicht erst angelegt. Sonst steht
      // die Plantafel voll mit Angeboten und Altbestand.
      if (!vorhanden && !gehoertAufDieTafel(erp.status)) {
        nichtAufDerTafel++;
        continue;
      }
      const bauleiterId = erp.projectManagerErpId
        ? (bauleiterNachErpId.get(erp.projectManagerErpId) ?? null)
        : null;

      // Vom ERP geführte Felder.
      const erpFelder = {
        // Ein Datensatz, den das ERP besitzt, ist keine Demo – auch dann
        // nicht, wenn er urspruenglich aus den Beispieldaten stammte und
        // spaeter zugeordnet wurde. Genau das war Luigi Curatolo passiert.
        isDemo: false,
        erpStatus: erp.status,
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

        // Verschwindet eine Baustelle von der Tafel, soll das im Bericht
        // stehen – sonst sucht jemand sie und findet sie nicht mehr.
        if (status.neuerStatus === 'ERLEDIGT') {
          hinweise.push(
            `${erp.referenceNumber ?? erp.erpId} (${erp.name}) ist im ERP „${erpStatusName(erp.status)}" ` +
              'und wurde von der Plantafel genommen.',
          );
        }
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
      `Projekte: ${projekte.neu} neu, ${projekte.aktualisiert} aktualisiert, ${projekte.unveraendert} unverändert` +
      (nichtAufDerTafel > 0 ? `, ${nichtAufDerTafel} nicht beauftragt` : '') +
      '. ' +
      `Personen: ${mitarbeiter.neu} neu` +
      (mitarbeiter.ausgeschieden > 0 ? `, ${mitarbeiter.ausgeschieden} ausgeschieden` : '') +
      '. ' +
      `Subunternehmer: ${subs.neu} neu` +
      (subs.gesperrt > 0 ? `, ${subs.gesperrt} gesperrt` : '') +
      `, ${subs.uebersprungen} Lieferanten übersprungen.`;

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

    return {
      provider: provider.name,
      projekte,
      mitarbeiter,
      subunternehmer: subs,
      hinweise,
      message,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unbekannter Fehler beim Sync.';
    await prisma.syncState.update({
      where: { provider: 'das-programm' },
      data: { status: 'FEHLER', lastMessage: message, lastSyncAt: new Date() },
    });
    throw e;
  }
}

/**
 * Setzt einen ausgeschiedenen Mitarbeiter inaktiv – egal ob er in der Dispo
 * als Monteur oder als Bauleiter geführt wird. Gibt zurück, ob sich etwas
 * geändert hat, damit der Sync-Bericht nicht bei jedem Lauf dasselbe meldet.
 */
async function stillegen(erpId: string, firstName: string, lastName: string): Promise<boolean> {
  const wo = { OR: [{ erpId }, { firstName, lastName }], active: true };
  const [e, b] = await Promise.all([
    prisma.employee.updateMany({ where: wo, data: { active: false } }),
    prisma.siteManager.updateMany({ where: wo, data: { active: false } }),
  ]);
  return e.count + b.count > 0;
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
