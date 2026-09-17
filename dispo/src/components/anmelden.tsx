'use client';
/**
 * Anmeldung.
 *
 * Zwei Zustände in einem Formular: anmelden und – beim ersten Mal – ein
 * Passwort setzen. Ein eigener Einladungsversand wäre für drei Personen
 * mehr Apparat als Nutzen; stattdessen gibt es einen Einrichtungscode, den
 * der Betrieb einmal weitergibt.
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardHat, LogIn } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function AnmeldeFormular() {
  const router = useRouter();
  const params = useSearchParams();
  const weiter = params.get('weiter') || '/plantafel';

  const [modus, setModus] = React.useState<'anmelden' | 'einrichten'>('anmelden');
  const [email, setEmail] = React.useState('');
  const [passwort, setPasswort] = React.useState('');
  const [code, setCode] = React.useState('');
  const [fehler, setFehler] = React.useState<string | null>(null);
  const [laeuft, setLaeuft] = React.useState(false);

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setLaeuft(true);
    try {
      if (modus === 'anmelden') {
        await api.post('/api/auth/login', { email, passwort });
      } else {
        await api.post('/api/auth/passwort', {
          email,
          einrichtungscode: code,
          neuesPasswort: passwort,
        });
      }
      router.push(weiter);
      router.refresh();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.';
      // Der Server sagt ausdrücklich, wenn noch kein Passwort gesetzt ist –
      // dann führen wir direkt dorthin, statt den Benutzer raten zu lassen.
      if (/noch kein Passwort/i.test(text)) {
        setModus('einrichten');
        setFehler('Für dieses Konto ist noch kein Passwort gesetzt. Bitte jetzt eines vergeben.');
      } else {
        setFehler(text);
      }
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <HardHat className="size-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold leading-tight">MR Umbau Disposition</h1>
            <p className="text-2xs text-muted-foreground">
              {modus === 'anmelden' ? 'Bitte anmelden.' : 'Passwort zum ersten Mal vergeben.'}
            </p>
          </div>
        </div>

        <form onSubmit={absenden} className="space-y-3">
          <Field label="E-Mail">
            <Input
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vorname@mrumbau.de"
            />
          </Field>

          {modus === 'einrichten' ? (
            <Field label="Einrichtungscode" hint="Einmalig, vom Betrieb erhalten.">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          ) : null}

          <Field
            label={modus === 'anmelden' ? 'Passwort' : 'Neues Passwort'}
            hint={modus === 'einrichten' ? 'Mindestens 10 Zeichen.' : undefined}
          >
            <Input
              type="password"
              autoComplete={modus === 'anmelden' ? 'current-password' : 'new-password'}
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
            />
          </Field>

          {fehler ? <p className="text-xs text-ampel-rot">{fehler}</p> : null}

          <Button type="submit" className="w-full" disabled={laeuft}>
            <LogIn />{' '}
            {laeuft ? 'Einen Moment …' : modus === 'anmelden' ? 'Anmelden' : 'Passwort setzen'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setModus((m) => (m === 'anmelden' ? 'einrichten' : 'anmelden'));
            setFehler(null);
          }}
          className="mt-4 w-full text-center text-2xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {modus === 'anmelden'
            ? 'Zum ersten Mal hier? Passwort vergeben.'
            : 'Zurück zur Anmeldung'}
        </button>
      </div>
    </main>
  );
}
