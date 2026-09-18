import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "Luigi Curatolo" -> "LC" */
export function initials(...parts: (string | null | undefined)[]) {
  return parts
    .filter(Boolean)
    .map((p) => p!.trim()[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Deterministische Farbe aus einem String (fuer SUB-Chips ohne Gewerksfarbe). */
export function colorFromString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 45%)`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds && seconds !== 0) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')} Min.`;
}

/** Telefonnummern fuer den Abgleich normalisieren: nur Ziffern, DE-Praefix. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = '00' + digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.startsWith('0049')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('49') && digits.length > 10) digits = '0' + digits.slice(2);
  if (!digits) return null;
  return digits;
}

/** Letzte n Stellen – robust gegen Durchwahl-/Formatunterschiede. */
export function phoneTail(raw: string | null | undefined, n = 7): string | null {
  const norm = normalizePhone(raw);
  if (!norm) return null;
  return norm.slice(-n);
}
