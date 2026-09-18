/**
 * Hilfen für die Integrationstests.
 *
 * Die Tests laufen gegen eine laufende Instanz (Standard: http://127.0.0.1:3100)
 * und legen ihre eigenen Datensätze an, die danach wieder entfernt werden.
 */
export const BASE_URL = process.env.DISPO_TEST_URL ?? 'http://127.0.0.1:3100';

export interface ApiResult<T> {
  status: number;
  body: T;
}

export async function call<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Cookie: await testSitzung() };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export const get = <T = unknown>(path: string) => call<T>('GET', path);
export const post = <T = unknown>(path: string, body: unknown) => call<T>('POST', path, body);
export const patch = <T = unknown>(path: string, body: unknown) => call<T>('PATCH', path, body);
export const del = <T = unknown>(path: string) => call<T>('DELETE', path);

// ---------------------------------------------------------------------------
// Anmeldung für die Tests
// ---------------------------------------------------------------------------

/**
 * Die Tests melden sich als Verwaltung an.
 *
 * Sie sprechen dieselbe Datenbank wie der Server, also wird ein Benutzer
 * angelegt (falls er fehlt) und ein Sitzungs-Cookie mit demselben Schlüssel
 * gebaut. Ein Umweg über das Anmeldeformular würde nur die Formularlogik
 * testen, nicht die Fachlogik dahinter.
 */
let sitzungCache: string | null = null;

async function testSitzung(): Promise<string> {
  if (sitzungCache) return sitzungCache;

  const { PrismaClient } = await import('@prisma/client');
  const { baueSitzung, SESSION_COOKIE } = await import('../src/server/auth');
  const prisma = new PrismaClient();
  try {
    const email = 'test-verwaltung@mrumbau.invalid';
    const user = await prisma.user.upsert({
      where: { email },
      update: { active: true, role: 'ADMIN' },
      create: { email, firstName: 'Test', lastName: 'Verwaltung', role: 'ADMIN' },
    });
    sitzungCache = `${SESSION_COOKIE}=${baueSitzung(user.id)}`;
    return sitzungCache;
  } finally {
    await prisma.$disconnect();
  }
}

/** Testdaten bekommen ein eindeutiges Präfix, damit nichts kollidiert. */
export const TAG = `TEST-${Date.now().toString().slice(-6)}`;

export function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function mondayOfNextWeek(): string {
  const d = new Date();
  const dow = d.getDay();
  const toMonday = dow === 0 ? 1 : 8 - dow;
  d.setDate(d.getDate() + toMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, day, 12);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 3CX-Webhook
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Liest das Webhook-Secret so, wie es auch der Server sieht. */
export function webhookSecret(): string {
  if (process.env.THREECX_WEBHOOK_SECRET) return process.env.THREECX_WEBHOOK_SECRET;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const match = /^THREECX_WEBHOOK_SECRET\s*=\s*"?([^"\n]*)"?/m.exec(env);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

export function sign(body: string, secret = webhookSecret()): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** POST auf den 3CX-Webhook – signiert wie eine echte Zustellung. */
export async function postSigned<T = unknown>(
  path: string,
  payload: unknown,
  options: { signature?: string } = {},
): Promise<ApiResult<T>> {
  const body = JSON.stringify(payload);
  const secret = webhookSecret();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['x-dispo-signature'] = options.signature ?? sign(body, secret);
  else if (options.signature) headers['x-dispo-signature'] = options.signature;

  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
