import { handler, ok } from '@/server/api';
import { entferneDemoDaten, zaehleDemoDaten } from '@/server/demo';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  return ok({ offen: await zaehleDemoDaten() });
});

/** „Demo-Daten entfernen“ – löscht ausschließlich, was als Demo markiert ist. */
export const DELETE = handler(async () => {
  const e = await entferneDemoDaten();
  const message =
    e.gesamt === 0
      ? 'Es sind keine Demo-Daten mehr vorhanden.'
      : `Entfernt: ${e.projekte} Baustellen, ${e.einsaetze} Einsätze, ${e.mitarbeiter} Mitarbeiter, ` +
        `${e.bauleiter} Bauleiter, ${e.subunternehmer} Subunternehmer.`;
  return ok({ ...e, message });
});
