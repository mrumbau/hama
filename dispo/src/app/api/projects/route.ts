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
    statuses: params.getAll('status').flatMap((s) => s.split(',')).filter(Boolean) || undefined,
    siteManagerIds:
      params.getAll('bauleiter').flatMap((s) => s.split(',')).filter(Boolean) || undefined,
    trafficLights: params.getAll('ampel').flatMap((s) => s.split(',')).filter(Boolean) || undefined,
    onlyProblems: params.get('nurProbleme') === '1',
    includeClosed: params.get('abgeschlossen') !== '0',
  });

  return ok({ projects: board.projects, assignments: board.assignments });
});

export const POST = handler(async (request: Request) => {
  const input = await parseBody(request, projectInputSchema);
  const project = await createProject(input);
  return ok({ project, message: `Projekt „${project.name}“ wurde angelegt.` }, { status: 201 });
});
