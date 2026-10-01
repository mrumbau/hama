import { handler, ok } from '@/server/api';
import { ladeAlleBauzeitenplaene } from '@/server/bauzeitenplan';

export const dynamic = 'force-dynamic';

/**
 * Alle Bauzeitenpläne auf einmal – für die Übersichtsseite.
 *
 * Lesen darf jeder Angemeldete. Geändert wird nach wie vor je Baustelle über
 * `/api/projects/[id]/bauzeitenplan`, mit der Rechteprüfung dort: Eine zweite
 * Schreibroute wäre eine zweite Stelle, an der das Recht geprüft werden muss,
 * und damit eine Stelle, an der es irgendwann fehlt.
 */
export const GET = handler(async () => {
  return ok({ baustellen: await ladeAlleBauzeitenplaene() });
});
