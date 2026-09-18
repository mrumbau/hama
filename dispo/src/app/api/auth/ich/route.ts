import { handler, ok } from '@/server/api';
import { aktuellerBenutzer, darf } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** Wer bin ich und was darf ich? Die Oberfläche richtet sich danach. */
export const GET = handler(async () => {
  const user = await aktuellerBenutzer();
  if (!user) return ok({ user: null, rechte: null });

  return ok({
    user,
    rechte: {
      einstellungenAendern: darf(user, 'einstellungenAendern'),
      system: darf(user, 'system'),
      protokoll: darf(user, 'protokoll'),
      benutzerverwaltung: darf(user, 'benutzerverwaltung'),
    },
  });
});
