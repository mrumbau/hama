/**
 * Kleine Helfer fuer die API-Routen. Einheitliche Fehlerform, damit das
 * Frontend nie raten muss.
 */
import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError('Ungültiger Request-Body (kein JSON).', 400);
  }
  try {
    return schema.parse(raw);
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.errors[0];
      throw new ApiError(
        `Ungültige Eingabe${first ? ` bei „${first.path.join('.')}“: ${first.message}` : ''}.`,
        422,
        { issues: e.errors },
      );
    }
    throw e;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface HandlerOptionen {
  /**
   * Diese Route darf ohne gueltige Sitzung antworten.
   *
   * Nur fuer die wenigen, die es muessen: die Anmeldung selbst, die Frage
   * "wer bin ich", die Versionsauskunft und die beiden Wege, die sich mit
   * einem eigenen Ausweis melden (Zeitplan, 3CX-Webhook). Jede andere Route
   * verlangt eine Sitzung - ohne dass jemand daran denken muss.
   */
  offen?: boolean;
}

/**
 * Umschliesst einen Route-Handler: einheitliche Fehlerform - und der
 * Riegel vor der Tuer.
 *
 * Die Middleware kann den Riegel nicht stellen. Sie laeuft in der
 * Edge-Laufzeit, kommt dort weder an die Datenbank noch an die Unterschrift
 * der Sitzung und konnte deshalb nur pruefen, OB ein Cookie mitkommt - nicht,
 * ob er echt ist. Ein frei erfundener Wert kam damit durch, und jede Route,
 * die nicht von sich aus nachfragte, hat geantwortet.
 *
 * Deshalb steht die Pruefung hier: an der einen Stelle, durch die jede
 * API-Route ohnehin laeuft. Wer eine neue Route baut, bekommt den Riegel
 * geschenkt, statt ihn vergessen zu koennen.
 */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
  optionen: HandlerOptionen = {},
) {
  return async (...args: A): Promise<Response> => {
    try {
      if (!optionen.offen) {
        // Erst hier laden, sonst zoege api.ts die halbe Serverwelt in die
        // Edge-Laufzeit der Middleware.
        const { aktuellerBenutzer } = await import('./auth');
        if (!(await aktuellerBenutzer())) return fail('Nicht angemeldet.', 401);
      }
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status, e.extra);
      console.error('[api]', e);
      const message = e instanceof Error ? e.message : 'Unbekannter Serverfehler.';
      return fail(message, 500);
    }
  };
}
