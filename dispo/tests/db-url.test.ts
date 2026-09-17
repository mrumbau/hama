/**
 * Die Datenbankadresse wird vor dem Verbinden korrigiert. Das ist ein
 * Eingriff in eine Einstellung, die jemand von Hand gesetzt hat – also muss
 * jede Regel einzeln belegt sein, besonders die Fälle, in denen NICHTS
 * passieren darf.
 */
import { describe, expect, it } from 'vitest';
import { ohneGeheimnis, pooltauglicheUrl } from '@/lib/db-url';

const BASIS = 'postgresql://user:geheim@aws-0-eu-central-1.pooler.supabase.com';

describe('Supabase-Pooler', () => {
  it('holt die Anwendung vom Session- auf den Transaction-Pooler', () => {
    const r = pooltauglicheUrl(`${BASIS}:5432/postgres?schema=dispo`);
    const url = new URL(r.url);

    expect(url.port).toBe('6543');
    expect(url.searchParams.get('pgbouncer')).toBe('true');
    expect(url.searchParams.get('connection_limit')).toBe('1');
    // Das Schema darf dabei nicht verlorengehen – sonst landet die App in
    // `public` und damit in fremden Tabellen.
    expect(url.searchParams.get('schema')).toBe('dispo');
    expect(r.angepasst).toBe(true);
  });

  it('lässt eine bereits richtige Adresse unangetastet', () => {
    const richtig = `${BASIS}:6543/postgres?schema=dispo&pgbouncer=true&connection_limit=1`;
    const r = pooltauglicheUrl(richtig);

    expect(r.url).toBe(richtig);
    expect(r.angepasst).toBe(false);
    expect(r.hinweis).toBeNull();
  });

  it('respektiert ein selbst gesetztes connection_limit', () => {
    const r = pooltauglicheUrl(`${BASIS}:6543/postgres?pgbouncer=true&connection_limit=5`);
    expect(new URL(r.url).searchParams.get('connection_limit')).toBe('5');
  });

  it('ergänzt nur das Fehlende', () => {
    const r = pooltauglicheUrl(`${BASIS}:6543/postgres`);
    expect(r.hinweis).toContain('pgbouncer=true');
    expect(r.hinweis).not.toContain('6543');
  });
});

describe('Alles andere bleibt, wie es ist', () => {
  it('fasst eine eigene Postgres-Installation nicht an', () => {
    // Wer selbst hostet, hat auf 5432 eine ganz normale Datenbank – da wäre
    // ein Umbiegen auf 6543 schlicht falsch.
    const eigen = 'postgresql://dispo:pw@db.intern.mrumbau.de:5432/dispo';
    expect(pooltauglicheUrl(eigen)).toEqual({ url: eigen, angepasst: false, hinweis: null });
  });

  it('fasst localhost nicht an', () => {
    const lokal = 'postgresql://postgres@127.0.0.1:5432/dispo';
    expect(pooltauglicheUrl(lokal).angepasst).toBe(false);
  });

  it('reicht Unlesbares unverändert durch', () => {
    expect(pooltauglicheUrl('kein-url-string').url).toBe('kein-url-string');
    expect(pooltauglicheUrl(undefined).url).toBe('');
  });
});

describe('Anzeige', () => {
  it('zeigt Host und Datenbank, aber niemals das Passwort', () => {
    const anzeige = ohneGeheimnis(`${BASIS}:6543/postgres?schema=dispo`);
    expect(anzeige).toBe('aws-0-eu-central-1.pooler.supabase.com:6543/postgres');
    expect(anzeige).not.toContain('geheim');
  });
});
