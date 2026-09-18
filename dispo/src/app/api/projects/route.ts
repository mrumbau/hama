import { handler, ok, parseBody } from '@/server/api';
import { createProject, projectInputSchema } from '@/server/projects';
import { loadBoard } from '@/server/board';
import { addDays, todayIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * Projektliste inklusive berechneter Ampel. Nutzt bewusst dieselbe
 * Datenquelle wie die Plantafel, damit Ampel und Warnungen ueberall
 * identisch aussehen.
 */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const today = todayIso();
  const board = await loadBoard(addDays(today, -60), addDays(today, 120), {
    query: params.get('q') || undefined,
    statuses:
      params
        .getAll('status')
        .flatMap((s) => s.split(','))
        .filter(Boolean) || undefined,
    siteManagerIds:
      params
        .getAll('bauleiter')
        .flatMap((s) => s.split(','))
        .filter(Boolean) || undefined,
    trafficLights:
      params
        .getAll('ampel')
        .flatMap((s) => s.split(','))
        .filter(Boolean) || undefined,
    onlyProblems: params.get('nurProbleme') === '1',
    // Abgeschlossenes ist standardmaessig aus dem Weg. Wer danach sucht,
    // schaltet es ein - andersherum steht die Liste voll mit Angeboten, die
    // nie zum Auftrag geworden sind.
    includeClosed: params.get('abgeschlossen') === '1',
  });

  /*
   * Lager, Besorgungsfahrten, Urlaub und Krank sind keine Projekte. Sie
   * gehoeren auf die Plantafel, aber nicht in die Projektliste und erst
   * recht nicht in „Projekt finden" - dort sucht man Baustellen aus „Das
   * Programm", nicht die eigenen Sammelzeilen.
   */
  return ok({
    projects: board.projects.filter((p) => !p.internKey),
    assignments: board.assignments,
  });
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, projectInputSchema);
  const project = await createProject(input);
  return ok({ project, message: `Projekt „${project.name}“ wurde angelegt.` }, { status: 201 });
});
