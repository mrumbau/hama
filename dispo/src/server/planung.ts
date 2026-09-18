/**
 * Wer darf was auf der Plantafel ändern?
 *
 * Die Ressourcen sind begrenzt. Wer sie verteilt, muss einer sein – sonst
 * schiebt der eine Bauleiter den Monteur weg, den der andere gerade fest
 * zugesagt hat. Gleichzeitig sollen die Bauleiter drei, vier Wochen
 * vorausplanen können, ohne auf das wöchentliche Treffen zu warten.
 *
 * Beides geht, wenn ihre Planung sichtbar als Vorschlag danebensteht statt
 * als Zusage:
 *
 *   Bauleiter legt an        → Vorschlag (grau, gestrichelt)
 *   Leitung nimmt an         → geplant
 *   Leitung/Bauleiter bestätigt → Termin (grünes T)
 *
 * Der eigene Vorschlag gehört dem, der ihn gemacht hat: Er darf ihn
 * beliebig umbauen und wieder wegwerfen. Angefasst wird nur, was schon
 * verbindlich ist – und das darf nur die Leitung.
 */
import type { AngemeldeterBenutzer } from '@/server/auth';
import { darf } from '@/server/auth';
import { ApiError } from '@/server/api';

export type EinsatzStatus = 'VORSCHLAG' | 'GEPLANT' | 'BESTAETIGT' | 'ABGESAGT' | 'ERLEDIGT';

export interface EinsatzHerkunft {
  status: EinsatzStatus;
  createdById: string | null;
}

/** Darf dieser Benutzer verbindlich planen? */
export function darfVerbindlichPlanen(benutzer: AngemeldeterBenutzer | null): boolean {
  return darf(benutzer, 'planungFreigeben');
}

/**
 * Welchen Status bekommt ein neu angelegter Einsatz?
 *
 * Bauleiter erzeugen Vorschläge, die Leitung erzeugt Planung. Ein Vorschlag
 * ist kein halber Einsatz – er ist eine Bitte, und als solche muss er
 * aussehen.
 */
export function statusBeimAnlegen(
  benutzer: AngemeldeterBenutzer | null,
  gewuenscht?: EinsatzStatus,
): EinsatzStatus {
  if (darfVerbindlichPlanen(benutzer)) return gewuenscht ?? 'GEPLANT';
  return 'VORSCHLAG';
}

/**
 * Darf dieser Benutzer diesen Einsatz ändern oder löschen?
 *
 * Bewusst nicht „Bauleiter dürfen gar nichts": Seinen eigenen Vorschlag
 * darf jeder zehnmal umbauen, das kostet niemanden etwas. Gesperrt ist nur,
 * was anderen gehört oder schon verbindlich ist.
 */
export function darfAendern(
  benutzer: AngemeldeterBenutzer | null,
  einsatz: EinsatzHerkunft,
): boolean {
  if (darfVerbindlichPlanen(benutzer)) return true;
  if (!benutzer) return false;
  return einsatz.status === 'VORSCHLAG' && einsatz.createdById === benutzer.id;
}

/** Dieselbe Regel, aber sie sagt auch, warum nicht. */
export function verlangeAenderungsrecht(
  benutzer: AngemeldeterBenutzer | null,
  einsatz: EinsatzHerkunft,
): void {
  if (darfAendern(benutzer, einsatz)) return;

  if (einsatz.status === 'VORSCHLAG') {
    throw new ApiError(
      'Das ist der Vorschlag von jemand anderem. Nur die Leitung kann ihn ändern.',
      403,
    );
  }
  throw new ApiError(
    'Dieser Einsatz ist schon verbindlich eingeplant. Ändern kann ihn nur die Leitung – ' +
      'bitte kurz Bescheid geben.',
    403,
  );
}

/**
 * Darf der Status so gesetzt werden?
 *
 * Ein Bauleiter darf seinen Vorschlag nicht selbst zum Termin erklären –
 * sonst wäre die ganze Freigabe eine Formalität, die man umgeht.
 */
export function verlangeStatusrecht(
  benutzer: AngemeldeterBenutzer | null,
  neuerStatus: EinsatzStatus | undefined,
): void {
  if (!neuerStatus || neuerStatus === 'VORSCHLAG') return;
  if (darfVerbindlichPlanen(benutzer)) return;
  throw new ApiError(
    'Aus einem Vorschlag macht erst die Leitung einen festen Termin.',
    403,
  );
}
