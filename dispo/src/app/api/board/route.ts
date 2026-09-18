import { handler, ok } from '@/server/api';
import { loadBoard, type BoardFilters } from '@/server/board';
import { resolveRange, type BoardRange } from '@/lib/board-range';
import { todayIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function list(params: URLSearchParams, key: string): string[] | undefined {
  const raw = params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .filter(Boolean);
  return raw.length ? raw : undefined;
}

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const anchor = params.get('datum') || todayIso();
  const range = (params.get('zeitraum') as BoardRange) || 'woche';
  const { from, to } = resolveRange(range, anchor);

  const filters: BoardFilters = {
    siteManagerIds: list(params, 'bauleiter'),
    statuses: list(params, 'status'),
    employeeIds: list(params, 'mitarbeiter'),
    subcontractorIds: list(params, 'sub'),
    trafficLights: list(params, 'ampel'),
    city: params.get('ort') || undefined,
    onlyProblems: params.get('nurProbleme') === '1',
    query: params.get('q') || undefined,
    includeClosed: params.get('abgeschlossen') === '1',
    nurAktuell: params.get('aktuell') === '1',
  };

  const board = await loadBoard(from, to, filters);
  return ok(board);
});
