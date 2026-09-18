'use client';
/**
 * Wer ist angemeldet und was darf er?
 *
 * Eine einzige Abfrage, die überall genutzt wird. Die Oberfläche blendet
 * danach Knöpfe aus – das ist Bequemlichkeit, nicht Sicherheit: Entschieden
 * wird jede Berechtigung serverseitig.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface IchAntwort {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'ADMIN' | 'LEITUNG' | 'BAULEITER';
    siteManagerId: string | null;
  } | null;
  rechte: {
    einstellungenAendern: boolean;
    system: boolean;
    protokoll: boolean;
    benutzerverwaltung: boolean;
  } | null;
}

export function useIch() {
  return useQuery({
    queryKey: ['ich'],
    queryFn: () => api.get<IchAntwort>('/api/auth/ich'),
    staleTime: 5 * 60 * 1000,
  });
}

export const ROLLE_LABEL: Record<NonNullable<IchAntwort['user']>['role'], string> = {
  ADMIN: 'Verwaltung',
  LEITUNG: 'Leitung',
  BAULEITER: 'Bauleitung',
};
