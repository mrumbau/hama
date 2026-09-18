import { z } from 'zod';
import { handler, ok, parseBody } from '@/server/api';
import { computeWarnings } from '@/server/warnings';
import { prisma } from '@/lib/db';
import { aktuellerBenutzer, darf } from '@/server/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const benutzer = await aktuellerBenutzer();

  /*
   * Jeder sieht seine eigenen Baustellen - das war die Vorgabe.
   *
   * „Alles sehen" darf nur, wer ohnehin ueber alle Baustellen schaut:
   * Geschaeftsfuehrung und Leitung. Frueher genuegte dafuer ein `?alle=1`
   * in der Adresszeile, und ein Bauleiter ohne verknuepften
   * Bauleiter-Datensatz bekam sogar ungefragt alles zu sehen, weil ohne
   * Verknuepfung nicht gefiltert wurde. Beides ist zu.
   */
  const darfAllesSehen = darf(benutzer, 'alleOffenenPunkte');
  const eigene = benutzer?.siteManagerId ?? null;

  /*
   * Auch Leitung und Geschaeftsfuehrung sehen zuerst ihre eigenen
   * Baustellen - „jeder nur seine offenen Punkte zu seinen Baustellen".
   * Nur wer gar keine eigenen hat, weil zu seinem Konto kein Bauleiter
   * gehoert, bekommt den Gesamtblick; ihm waere sonst die Seite leer.
   */
  const alle = darfAllesSehen && (params.get('alle') === '1' || !eigene);

  if (!alle && !eigene) {
    // Kein Bauleiter-Datensatz, also auch keine eigenen Baustellen. Lieber
    // nichts zeigen als versehentlich alles.
    return ok({
      warnings: [],
      nurEigene: true,
      hinweis: darfAllesSehen
        ? null
        : 'Zu diesem Konto ist kein Bauleiter hinterlegt. Bitte in den Einstellungen verknüpfen lassen.',
    });
  }

  const warnings = await computeWarnings({
    includeDismissed: params.get('erledigte') === '1',
    siteManagerId: alle ? null : eigene,
  });
  return ok({ warnings, nurEigene: !alle, darfAllesSehen });
});

/** Einen offenen Punkt abhaken bzw. wieder aktivieren. */
export const POST = handler(async (request: Request) => {
  const input = await parseBody(
    request,
    z.object({
      warningKey: z.string().min(1),
      dismissed: z.boolean(),
      note: z.string().max(500).nullish(),
    }),
  );

  if (input.dismissed) {
    await prisma.warningDismissal.upsert({
      where: { warningKey: input.warningKey },
      update: { note: input.note ?? null, dismissedAt: new Date() },
      create: { warningKey: input.warningKey, note: input.note ?? null },
    });
    return ok({ message: 'Punkt als erledigt markiert.' });
  }

  await prisma.warningDismissal.deleteMany({ where: { warningKey: input.warningKey } });
  return ok({ message: 'Punkt wieder geöffnet.' });
});
