/**
 * Anmeldung und Rechte.
 *
 * Die heiklen Stellen: Ein gefälschtes Cookie darf nicht durchkommen, ein
 * abgelaufenes auch nicht, und ein Bauleiter darf nicht an die Einstellungen –
 * auch nicht, wenn er die Adresse direkt aufruft.
 */
import { describe, expect, it } from 'vitest';
import { baueSitzung, darf, hashePasswort, leseSitzung, passwortStimmt } from '@/server/auth';

describe('Passwörter', () => {
  it('erkennt das richtige Passwort', async () => {
    const hash = await hashePasswort('ein-gutes-passwort');
    expect(await passwortStimmt('ein-gutes-passwort', hash)).toBe(true);
  });

  it('weist ein falsches ab', async () => {
    const hash = await hashePasswort('ein-gutes-passwort');
    expect(await passwortStimmt('ein-gutes-passwor', hash)).toBe(false);
    expect(await passwortStimmt('', hash)).toBe(false);
  });

  it('speichert zweimal dasselbe Passwort unterschiedlich', async () => {
    // Gleiches Passwort, anderes Salz – sonst verrät die Datenbank, wer
    // dasselbe Passwort benutzt.
    const a = await hashePasswort('gleich');
    const b = await hashePasswort('gleich');
    expect(a).not.toBe(b);
    expect(await passwortStimmt('gleich', a)).toBe(true);
    expect(await passwortStimmt('gleich', b)).toBe(true);
  });

  it('stürzt bei kaputtem Hash nicht ab', async () => {
    expect(await passwortStimmt('egal', 'unsinn')).toBe(false);
    expect(await passwortStimmt('egal', '')).toBe(false);
  });
});

describe('Sitzungs-Cookie', () => {
  it('liest die eigene Sitzung wieder', () => {
    const cookie = baueSitzung('user-1');
    expect(leseSitzung(cookie)).toBe('user-1');
  });

  it('weist eine veränderte Benutzer-ID ab', () => {
    // Der klassische Angriff: ID im Cookie austauschen.
    const cookie = baueSitzung('user-1');
    const gefaelscht = cookie.replace('user-1', 'user-2');
    expect(leseSitzung(gefaelscht)).toBeNull();
  });

  it('weist eine veränderte Laufzeit ab', () => {
    const cookie = baueSitzung('user-1', 1000);
    const [id, , sig] = cookie.split('.');
    expect(leseSitzung(`${id}.99999999999999.${sig}`)).toBeNull();
  });

  it('weist eine abgelaufene Sitzung ab', () => {
    const cookie = baueSitzung('user-1', 0);
    // Acht Tage später – die Sitzung gilt sieben.
    expect(leseSitzung(cookie, 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it('weist Unsinn ab, statt zu werfen', () => {
    expect(leseSitzung(undefined)).toBeNull();
    expect(leseSitzung('')).toBeNull();
    expect(leseSitzung('a.b')).toBeNull();
    expect(leseSitzung('a.b.c.d')).toBeNull();
  });
});

describe('Rechte', () => {
  const admin = { role: 'ADMIN' as const };
  const leitung = { role: 'LEITUNG' as const };
  const bauleiter = { role: 'BAULEITER' as const };

  it('lässt nur die Verwaltung an die Einstellungen', () => {
    expect(darf(admin, 'einstellungenAendern')).toBe(true);
    expect(darf(leitung, 'einstellungenAendern')).toBe(false);
    expect(darf(bauleiter, 'einstellungenAendern')).toBe(false);
  });

  it('zeigt das Änderungsprotokoll der Verwaltung und der Leitung', () => {
    expect(darf(admin, 'protokoll')).toBe(true);
    expect(darf(leitung, 'protokoll')).toBe(true);
    expect(darf(bauleiter, 'protokoll')).toBe(false);
  });

  it('hält die Systemansicht bei der Verwaltung', () => {
    expect(darf(admin, 'system')).toBe(true);
    expect(darf(leitung, 'system')).toBe(false);
  });

  it('gibt niemandem ohne Anmeldung etwas', () => {
    expect(darf(null, 'protokoll')).toBe(false);
    expect(darf(null, 'einstellungenAendern')).toBe(false);
  });
});
