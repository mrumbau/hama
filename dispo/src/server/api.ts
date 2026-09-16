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

/** Umschliesst einen Route-Handler und uebersetzt Fehler in saubere Antworten. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return fail(e.message, e.status, e.extra);
      console.error('[api]', e);
      const message = e instanceof Error ? e.message : 'Unbekannter Serverfehler.';
      return fail(message, 500);
    }
  };
}
