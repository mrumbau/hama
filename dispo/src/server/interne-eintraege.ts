/**
 * Lager und Besorgungsfahrten – die beiden festen Zeilen der Plantafel.
 *
 * Beides sind keine Baustellen und stehen nicht in „Das Programm". Es sind
 * Orte, an denen die eigenen Leute Zeit verbringen: das Lager als interner
 * Arbeitsort, die Besorgungsfahrten als Sammelposten für „wer holt was".
 * Wer sie mitplanen kann, sieht auf einen Blick, wer wirklich frei ist.
 *
 * Sie erkennt die App an einem festen Schlüssel, nicht am Namen – ein Name
 * ließe sich ändern, und dann wäre die Zeile eine gewöhnliche Baustelle.
 */
import { prisma } from '@/lib/db';
import { ApiError } from '@/server/api';

export type InternerSchluessel = 'LAGER' | 'BESORGUNG';

/**
 * Was an einem festen Eintrag geändert werden darf.
 *
 * Bei den Besorgungsfahrten sind es ausdrücklich nur Notizen – dort steht,
 * was besorgt werden soll. Alles andere (Kunde, Anschrift, Bauleiter,
 * Bauzeit, Status) ergibt für einen Sammelposten keinen Sinn und würde nur
 * eine Baustelle vortäuschen, die es nicht gibt.
 */
const ERLAUBT: Record<InternerSchluessel, readonly string[]> = {
  LAGER: ['internalNotes', 'specialNotes'],
  BESORGUNG: ['internalNotes', 'specialNotes'],
};

export const INTERNE_NAMEN: Record<InternerSchluessel, string> = {
  LAGER: 'Lager',
  BESORGUNG: 'Besorgungsfahrten',
};

/**
 * Prüft eine Änderung an einem Projekt.
 *
 * Für gewöhnliche Projekte passiert nichts. Für die festen Einträge wird
 * alles zurückgewiesen, was über Notizen hinausgeht – mit einem Satz, der
 * sagt warum, statt eines stummen Fehlschlags.
 */
export function pruefeAenderung(
  internKey: string | null,
  eingabe: Record<string, unknown>,
): void {
  if (!internKey) return;
  const schluessel = internKey as InternerSchluessel;
  const erlaubt = ERLAUBT[schluessel] ?? [];

  const verboten = Object.entries(eingabe)
    .filter(([feld, wert]) => wert !== undefined && !erlaubt.includes(feld))
    .map(([feld]) => feld);

  if (verboten.length === 0) return;

  throw new ApiError(
    `„${INTERNE_NAMEN[schluessel] ?? internKey}" ist ein fester Eintrag der Plantafel. ` +
      'Hier lassen sich nur Notizen ändern.',
    409,
  );
}

/** Feste Einträge werden nie gelöscht – sie sollen immer da sein. */
export function pruefeLoeschen(internKey: string | null): void {
  if (!internKey) return;
  const name = INTERNE_NAMEN[internKey as InternerSchluessel] ?? internKey;
  throw new ApiError(`„${name}" gehört fest zur Plantafel und kann nicht gelöscht werden.`, 409);
}

/** Der feste Eintrag zu einem Schlüssel, falls vorhanden. */
export function interneEintraege() {
  return prisma.project.findMany({ where: { NOT: { internKey: null } } });
}
