/**
 * Zod-Schemata der Stammdaten.
 *
 * Bewusst ausserhalb der Route-Dateien: Next.js erlaubt in `route.ts` nur
 * Route-Handler als Exports.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const employeeSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist ein Pflichtfeld.').max(80),
  lastName: z.string().min(1, 'Nachname ist ein Pflichtfeld.').max(80),
  shortCode: z.string().max(10).optional(),
  phone: z.string().max(60).nullish(),
  profession: z.string().max(80).nullish(),
  weeklyHours: z.coerce.number().int().min(0).max(80).nullish(),
  driversLicense: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
  active: z.boolean().optional(),
  tradeIds: z.array(z.string()).optional(),
});

export const siteManagerSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist ein Pflichtfeld.').max(80),
  lastName: z.string().min(1, 'Nachname ist ein Pflichtfeld.').max(80),
  shortCode: z.string().max(10).optional(),
  phone: z.string().max(60).nullish(),
  email: z.string().max(160).nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Farbe muss als #RRGGBB angegeben werden.')
    .optional(),
  note: z.string().max(2000).nullish(),
  active: z.boolean().optional(),
});

/**
 * Schnellanlage (Master-Prompt Abschnitt 36): Pflichtfeld ist ausschliesslich
 * der Firmenname. Alles andere ist optional und kann spaeter ergaenzt werden.
 */
export const subcontractorSchema = z.object({
  companyName: z.string().min(1, 'Firmenname ist ein Pflichtfeld.').max(200),
  contactName: z.string().max(120).nullish(),
  phone: z.string().max(60).nullish(),
  email: z.string().max(160).nullish(),
  street: z.string().max(200).nullish(),
  zip: z.string().max(16).nullish(),
  city: z.string().max(120).nullish(),
  note: z.string().max(2000).nullish(),
  active: z.boolean().optional(),
  preferred: z.boolean().optional(),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  crewSize: z.coerce.number().int().min(0).max(999).nullish(),
  tradeIds: z.array(z.string()).optional(),
  /** Gewerk als Freitext – wird bei Bedarf automatisch angelegt. */
  tradeName: z.string().max(80).nullish(),
});

/** Kuerzel muss ueber Mitarbeiter und Bauleiter hinweg eindeutig sein. */
export async function uniqueShortCode(base: string) {
  const clean = (base || 'XX').toUpperCase().slice(0, 8);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? clean : `${clean}${i + 1}`;
    const [e, m] = await Promise.all([
      prisma.employee.findUnique({ where: { shortCode: candidate } }),
      prisma.siteManager.findUnique({ where: { shortCode: candidate } }),
    ]);
    if (!e && !m) return candidate;
  }
  return `${clean}${Date.now().toString().slice(-4)}`;
}
