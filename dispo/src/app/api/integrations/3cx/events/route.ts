import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail, handler, ok } from '@/server/api';
import { ingestThreeCxEvent, threeCxEventSchema } from '@/server/integrations/threecx';

export const dynamic = 'force-dynamic';

/**
 * 3CX-Ereigniseingang (Master-Prompt Abschnitt 18).
 *
 * Absicherung (Abschnitt 32): Ist `THREECX_WEBHOOK_SECRET` gesetzt, muss der
 * Aufrufer den Body per HMAC-SHA256 signieren und als `x-dispo-signature`
 * mitsenden. Ohne gesetztes Secret ist der Endpoint nur für vertrauenswürdige
 * Netze gedacht und protokolliert das deutlich.
 */
export const POST = handler(async (request: Request) => {
  const secret = process.env.THREECX_WEBHOOK_SECRET;
  const bodyText = await request.text();

  if (secret) {
    const provided = request.headers.get('x-dispo-signature') ?? '';
    if (!isValidSignature(bodyText, secret, provided)) {
      return fail('Ungültige Signatur.', 401);
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[3cx] THREECX_WEBHOOK_SECRET ist nicht gesetzt – der Webhook ist ungeschützt.',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return fail('Ungültiger Request-Body (kein JSON).', 400);
  }

  const parsed = threeCxEventSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(`Ungültiges 3CX-Ereignis: ${parsed.error.errors[0]?.message ?? ''}`, 422, {
      issues: parsed.error.errors,
    });
  }

  const result = await ingestThreeCxEvent(parsed.data);
  return ok(result, { status: result.duplicate ? 200 : 201 });
});

function isValidSignature(body: string, secret: string, provided: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  // Akzeptiert "sha256=<hex>" ebenso wie den nackten Hex-Wert.
  const candidate = provided.startsWith('sha256=') ? provided.slice(7) : provided;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
