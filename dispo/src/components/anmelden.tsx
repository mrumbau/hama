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
import { Building2, HardHat, LogIn } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function AnmeldeFormular() {
  const router = useRouter();
  const params = useSearchParams();
  const weiter = params.get('weiter') || '/plantafel';

  const [email, setEmail] = React.useState('');
  const [passwort, setPasswort] = React.useState('');
  const [fehler, setFehler] = React.useState<string | null>(params.get('fehler'));
  const [laeuft, setLaeuft] = React.useState(false);

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setLaeuft(true);
    try {
      await api.post('/api/auth/login', { email, passwort });
      router.push(weiter);
      router.refresh();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
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
            <p className="text-2xs text-muted-foreground">Bitte anmelden.</p>
          </div>
        </div>

        {/*
          Microsoft zuerst: Wer ein Firmenkonto hat, braucht hier gar kein
          zweites Passwort. Der Knopf steht auch dann da, wenn die Anbindung
          noch nicht eingerichtet ist – dann sagt die App es beim Klick,
          statt die Möglichkeit zu verschweigen.
        */}
        <Button variant="outline" className="w-full" asChild>
          <a href={`/api/auth/microsoft?weiter=${encodeURIComponent(weiter)}`}>
            <Building2 /> Mit Microsoft-Konto anmelden
          </a>
        </Button>

        <div className="my-4 flex items-center gap-2">
          <span className="h-px flex-1 bg-border" />
          <span className="text-2xs text-muted-foreground">oder mit Passwort</span>
          <span className="h-px flex-1 bg-border" />
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

          <Field label="Passwort">
            <Input
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
            />
          </Field>

          {fehler ? <p className="text-xs text-ampel-rot">{fehler}</p> : null}

          <Button type="submit" className="w-full" disabled={laeuft}>
            <LogIn /> {laeuft ? 'Einen Moment …' : 'Anmelden'}
          </Button>
        </form>

        <p className="mt-4 text-center text-2xs text-muted-foreground">
          Passwort vergessen? Die Verwaltung vergibt ein neues.
        </p>
      </div>
    </main>
  );
}
