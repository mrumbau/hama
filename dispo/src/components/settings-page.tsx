'use client';
/**
 * Einstellungen: Integrationen, Gewerke, Datenbestand, Änderungsprotokoll.
 * Version 1 hat bewusst keine Benutzerverwaltung.
 */
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, Plug, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useTrades } from '@/lib/queries';
import { useIch } from '@/lib/ich';
import { formatDateTime } from '@/lib/dates';
import { SOURCE_LABEL, type SourceKey } from '@/lib/labels';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';

interface SettingsResponse {
  settings: Record<string, string>;
  sync: {
    provider: string;
    status: string;
    lastSyncAt: string | null;
    lastMessage: string | null;
    itemsCreated: number;
    itemsUpdated: number;
  }[];
  stats: {
    projects: number;
    demoProjects: number;
    employees: number;
    subcontractors: number;
    assignments: number;
    auditEntries: number;
    communications: number;
  };
  env: {
    erpProvider: string;
    threeCxConfigured: boolean;
    aiConfigured: boolean;
    database: string;
    microsoftKonfiguriert: boolean;
    microsoftUmleitung: string;
    microsoftGeheimnis: 'wert' | 'id-statt-wert' | 'zu-kurz' | null;
  };
}

interface ErpVerbindung {
  provider: string;
  health: { ok: boolean; message: string };
  diagnose:
    | {
        name: string;
        header: string;
        prefix: string;
        ok: boolean;
        status: number | null;
        antwort: string;
      }[]
    | null;
  konfiguration: {
    endpunkt: string;
    schluesselGesetzt: boolean;
    authHeader: string;
    zurueckschreiben: boolean;
  };
}

const TABS = [
  { value: 'integrationen', label: 'Integrationen' },
  { value: 'gewerke', label: 'Gewerke' },
  { value: 'benutzer', label: 'Benutzer' },
  { value: 'protokoll', label: 'Änderungsprotokoll' },
  { value: 'system', label: 'System' },
] as const;

export function SettingsPage() {
  const [tab, setTab] = React.useState('integrationen');
  const { data: ich } = useIch();
  const rechte = ich?.rechte;

  // Tabs, die nicht jeder sehen soll. Ausgeblendet ist kein Schutz – jede
  // dieser Ansichten prüft ihre Berechtigung auch auf dem Server.
  const sichtbar = TABS.filter((t) => {
    if (t.value === 'protokoll') return rechte?.protokoll ?? false;
    if (t.value === 'system') return rechte?.system ?? false;
    if (t.value === 'benutzer') return rechte?.benutzerverwaltung ?? false;
    return true;
  });

  React.useEffect(() => {
    if (!sichtbar.some((t) => t.value === tab)) setTab('integrationen');
  }, [sichtbar, tab]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Einstellungen"
        description="Integrationen, Stammdaten und Protokoll. Version 1 arbeitet ohne Benutzerverwaltung."
      >
        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList>
            {sichtbar.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="integrationen">
            <IntegrationsTab />
          </TabsContent>
          <TabsContent value="gewerke">
            <TradesTab />
          </TabsContent>
          <TabsContent value="benutzer">
            <BenutzerTab />
          </TabsContent>
          <TabsContent value="protokoll">
            <AuditTab />
          </TabsContent>
          <TabsContent value="system">
            <SystemTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsResponse>('/api/settings'),
  });
}

function IntegrationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useSettings();

  // Verbindungstest: der einzige Weg, Endpunkt und Schlüssel von der
  // laufenden App aus zu prüfen – lokal ist „Das Programm" nicht erreichbar.
  const verbindung = useQuery({
    queryKey: ['erp-verbindung'],
    queryFn: () => api.get<ErpVerbindung>('/api/integrations/das-programm/sync'),
    enabled: false,
    retry: false,
  });

  const sync = useMutation({
    mutationFn: () =>
      api.post<{ message: string; hinweise: string[] }>('/api/integrations/das-programm/sync', {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({
        title: `Synchronisation abgeschlossen: ${res.message}`,
        description: res.hinweise[0],
        tone: 'success',
        duration: 8000,
      });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const simulate = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/integrations/3cx/simulate', {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      queryClient.invalidateQueries({ queryKey: ['warnings'] });
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  const erpState = data?.sync.find((s) => s.provider === 'das-programm');

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Das Programm (ERP)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Führend für Kunde, Anschrift, Auftrags- und Projektnummer. Die Dispo-App bleibt führend
            für Planung, Ampel und Historie.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Betriebsart</dt>
              <dd>
                <Badge variant={data?.env.erpProvider === 'mock' ? 'gelb' : 'gruen'}>
                  {data?.env.erpProvider === 'mock' ? 'Mock (Testmodus)' : 'Echte API'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Letzter Sync</dt>
              <dd className="tabular-nums">
                {erpState?.lastSyncAt ? formatDateTime(erpState.lastSyncAt) : 'nie'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Ergebnis</dt>
              <dd className="text-right">{erpState?.lastMessage ?? '–'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={sync.isPending ? 'animate-spin' : ''} /> Projekte aus Das
              Programm aktualisieren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => verbindung.refetch()}
              disabled={verbindung.isFetching}
            >
              <Plug className={verbindung.isFetching ? 'animate-pulse' : ''} /> Verbindung prüfen
            </Button>
          </div>

          {verbindung.data ? (
            <div className="space-y-1 rounded-md border bg-muted/40 p-2 text-2xs">
              <div className="flex items-center gap-2">
                <Badge variant={verbindung.data.health.ok ? 'gruen' : 'rot'}>
                  {verbindung.data.health.ok ? 'Verbunden' : 'Kein Zugriff'}
                </Badge>
                <span className="text-muted-foreground">{verbindung.data.health.message}</span>
              </div>
              <div className="text-muted-foreground">
                Endpunkt: <code>{verbindung.data.konfiguration.endpunkt}</code> · Header:{' '}
                <code>{verbindung.data.konfiguration.authHeader}</code> · Schlüssel:{' '}
                {verbindung.data.konfiguration.schluesselGesetzt ? 'gesetzt' : 'fehlt'} ·
                Zurückschreiben: {verbindung.data.konfiguration.zurueckschreiben ? 'ein' : 'aus'}
              </div>
              {verbindung.data.diagnose ? (
                <AuthDiagnose ergebnisse={verbindung.data.diagnose} />
              ) : null}
            </div>
          ) : null}

          <p className="text-2xs text-muted-foreground">
            Umschalten auf die echte API über <code>DISPO_ERP_PROVIDER=das-programm</code> plus{' '}
            <code>DAS_PROGRAMM_API_KEY</code>. Der Status wandert nur zurück ins ERP, wenn{' '}
            <code>DAS_PROGRAMM_WRITEBACK=1</code> gesetzt ist.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3CX-Telefonanlage</CardTitle>
          <p className="text-xs text-muted-foreground">
            Empfängt Gesprächsdaten unter <code>POST /api/integrations/3cx/events</code>.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Webhook-Signatur</dt>
              <dd>
                <Badge variant={data?.env.threeCxConfigured ? 'gruen' : 'gelb'}>
                  {data?.env.threeCxConfigured ? 'Aktiv' : 'Kein Secret gesetzt'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">AI-Änderungserkennung</dt>
              <dd>
                <Badge variant={data?.env.aiConfigured ? 'gruen' : 'grau'}>
                  {data?.env.aiConfigured ? 'Claude aktiv' : 'Regelbasiert'}
                </Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Telefonate erfasst</dt>
              <dd className="tabular-nums">{data?.stats.communications ?? 0}</dd>
            </div>
          </dl>
          <Button
            size="sm"
            variant="outline"
            onClick={() => simulate.mutate()}
            disabled={simulate.isPending}
          >
            3CX-Testanruf simulieren
          </Button>
          <p className="text-2xs text-muted-foreground">
            Der Webhook verlangt bei gesetztem <code>THREECX_WEBHOOK_SECRET</code> eine
            HMAC-SHA256-Signatur im Header <code>x-dispo-signature</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TradesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: trades } = useTrades();
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState('#64748b');

  const add = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/trades', { name, color }),
    onSuccess: (res) => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  return (
    <div className="max-w-2xl space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Gewerke &amp; Qualifikationen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Werden von Mitarbeitern (Qualifikation) und Subunternehmern (Gewerk) gemeinsam genutzt.
            Die Farbe kennzeichnet SUB-Einsätze in der Plantafel.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) add.mutate();
            }}
          >
            <Field label="Neues Gewerk" className="flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Estrich"
              />
            </Field>
            <Field label="Farbe">
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 p-1"
              />
            </Field>
            <Button type="submit" disabled={!name.trim() || add.isPending}>
              <Plus /> Hinzufügen
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {trades?.map((t) => (
              <span
                key={t.id}
                className="rounded border px-2 py-0.5 text-xs"
                style={{ borderColor: t.color, color: t.color }}
              >
                {t.name}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab() {
  const [query, setQuery] = React.useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', query],
    queryFn: () =>
      api.get<{
        entries: {
          id: string;
          label: string;
          action: string;
          entityType: string;
          createdAt: string;
          source: SourceKey;
          reasonText: string | null;
          note: string | null;
          projectLabel: string | null;
        }[];
      }>(`/api/audit?limit=200${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Protokoll durchsuchen …"
          className="h-8 w-64 text-xs"
        />
        <span className="text-2xs text-muted-foreground">
          {data?.entries.length ?? 0} Einträge (neueste zuerst)
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Zeitpunkt</th>
                <th className="px-3 py-2 font-semibold">Vorgang</th>
                <th className="px-3 py-2 font-semibold">Projekt</th>
                <th className="px-3 py-2 font-semibold">Quelle</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-1.5 text-2xs tabular-nums text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {e.label}
                    {e.reasonText ? (
                      <span className="block text-2xs text-muted-foreground">
                        Grund: {e.reasonText}
                      </span>
                    ) : null}
                    {e.note ? (
                      <span className="block text-2xs text-muted-foreground">{e.note}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-2xs text-muted-foreground">
                    {e.projectLabel ?? '–'}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline">{SOURCE_LABEL[e.source] ?? e.source}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface MicrosoftPruefung {
  eingerichtet: boolean;
  erfolg: boolean;
  meldung: string;
  geheimnis: 'wert' | 'id-statt-wert' | 'zu-kurz' | null;
  umleitung: string;
}

function SystemTab() {
  const { data } = useSettings();

  // Wie beim ERP: der einzige Weg, die hinterlegten Zugangsdaten von der
  // laufenden App aus zu pruefen, statt Microsofts Rohtext zu deuten.
  const msPruefung = useQuery({
    queryKey: ['microsoft-pruefung'],
    queryFn: () => api.get<MicrosoftPruefung>('/api/auth/microsoft/pruefen'),
    enabled: false,
    retry: false,
  });

  return (
    <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Database className="size-4" /> Datenbestand
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-xs">
            {[
              ['Projekte', data?.stats.projects, `davon ${data?.stats.demoProjects ?? 0} Demo`],
              ['Mitarbeiter', data?.stats.employees],
              ['Subunternehmer', data?.stats.subcontractors],
              ['Einsätze', data?.stats.assignments],
              ['Telefonate', data?.stats.communications],
              ['Protokolleinträge', data?.stats.auditEntries],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">{label as string}</dt>
                <dd className="tabular-nums">
                  {String(value ?? 0)}
                  {hint ? (
                    <span className="ml-1 text-2xs text-muted-foreground">({hint as string})</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          <DemoEntfernen />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <ShieldAlert className="size-4" /> Zugriff
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          {/*
            Die Umleitungs-URI zum Abschreiben. Sie haengt an der Adresse,
            unter der die App laeuft – wer sie falsch eintraegt, bekommt von
            Microsoft eine Fehlermeldung, die nicht sagt, welche erwartet wird.
          */}
          <div className="mb-3 space-y-1 rounded-md border bg-muted/40 p-2 text-2xs">
            <p className="flex items-center gap-1.5 font-medium">
              Microsoft-Anmeldung
              <Badge variant={data?.env.microsoftKonfiguriert ? 'gruen' : 'grau'}>
                {data?.env.microsoftKonfiguriert ? 'eingerichtet' : 'nicht eingerichtet'}
              </Badge>
            </p>
            <p className="text-muted-foreground">
              Umleitungs-URI für die App-Registrierung:
              <br />
              <code className="break-all">{data?.env.microsoftUmleitung ?? '–'}</code>
            </p>
            {/*
              Der haeufigste Einrichtungsfehler: In Entra stehen „Wert" und
              „Geheimnis-ID" nebeneinander, aber nur der Wert ist kurz nach dem
              Anlegen sichtbar. Wer spaeter nachschaut, kopiert die ID – und
              Microsoft antwortet dann nur mit AADSTS7000215.
            */}
            {data?.env.microsoftGeheimnis === 'id-statt-wert' && (
              <p className="text-destructive">
                In <code>MICROSOFT_CLIENT_SECRET</code> steht eine GUID. Das ist die Geheimnis-ID,
                gebraucht wird die Spalte „Wert" aus „Zertifikate &amp; Geheimnisse".
              </p>
            )}
            {data?.env.microsoftGeheimnis === 'zu-kurz' && (
              <p className="text-destructive">
                Das hinterlegte <code>MICROSOFT_CLIENT_SECRET</code> ist auffällig kurz – vermutlich
                beim Kopieren abgeschnitten.
              </p>
            )}

            <Button
              size="sm"
              variant="outline"
              className="mt-1"
              onClick={() => msPruefung.refetch()}
              disabled={msPruefung.isFetching}
            >
              <Plug className={msPruefung.isFetching ? 'animate-pulse' : ''} /> Microsoft-Anmeldung
              prüfen
            </Button>

            {msPruefung.data ? (
              <div className="flex items-start gap-2">
                <Badge variant={msPruefung.data.erfolg ? 'gruen' : 'rot'}>
                  {msPruefung.data.erfolg ? 'Zugang in Ordnung' : 'Kein Zugang'}
                </Badge>
                <span className="text-muted-foreground">{msPruefung.data.meldung}</span>
              </div>
            ) : null}
          </div>

          <p>
            Version 1 hat bewusst keine Benutzerverwaltung: ein Disponent, ein Zugang, maximale
            Geschwindigkeit.
          </p>
          <p>
            Ist die App öffentlich erreichbar, lässt sich über <code>DISPO_BASIC_AUTH_USER</code>{' '}
            und <code>DISPO_BASIC_AUTH_PASSWORD</code> ein einfacher serverseitiger Schutz
            aktivieren. Das ersetzt keine Rechteverwaltung.
          </p>
          <p>
            Datenbank: <code>{data?.env.database ?? '–'}</code>
          </p>
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Download className="size-4" /> Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <p>
            Die gesamte Disposition liegt in einer PostgreSQL-Datenbank. Ein Backup ist ein Dump:
          </p>
          <pre className="overflow-auto rounded bg-muted p-2 text-2xs">
            pg_dump &quot;$DATABASE_URL&quot; -Fc -f backups/dispo-$(date +%F).dump
          </pre>
          <p>Wiederherstellen:</p>
          <pre className="overflow-auto rounded bg-muted p-2 text-2xs">
            pg_restore -d &quot;$DATABASE_URL&quot; --clean --if-exists
            backups/dispo-2026-09-16.dump
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Ergebnis der Header-Suche.
 *
 * Findet sich eine Variante, die durchgeht, steht hier genau, was in die
 * Umgebungsvariablen gehört. Scheitern alle mit derselben Meldung, liegt es
 * nicht am Header – dann ist der Schlüssel selbst das Problem, und auch das
 * soll dastehen statt „Verbindung fehlgeschlagen".
 */
function AuthDiagnose({ ergebnisse }: { ergebnisse: NonNullable<ErpVerbindung['diagnose']> }) {
  const treffer = ergebnisse.find((e) => e.ok);

  if (treffer) {
    return (
      <div className="mt-2 space-y-1 border-t pt-2">
        <p className="font-medium">
          Diese Variante funktioniert: <code>{treffer.name}</code>
        </p>
        <p className="text-muted-foreground">
          Dafür in Vercel setzen: <code>DAS_PROGRAMM_AUTH_HEADER={treffer.header}</code>
          {treffer.prefix ? (
            <>
              {' '}
              und <code>DAS_PROGRAMM_AUTH_PREFIX={treffer.prefix}</code>
            </>
          ) : (
            <>
              {' '}
              und <code>DAS_PROGRAMM_AUTH_PREFIX</code> auf leer
            </>
          )}
          . Danach neu deployen.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1 border-t pt-2">
      <p className="font-medium">Keine der üblichen Header-Formen wurde akzeptiert:</p>
      <ul className="space-y-0.5">
        {ergebnisse.map((e) => (
          <li key={e.name} className="text-muted-foreground">
            <code>{e.name}</code> → {e.status ?? 'kein Kontakt'} {e.antwort}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Antworten alle gleich, liegt es nicht am Header, sondern am Schlüssel selbst.
      </p>
    </div>
  );
}

/**
 * Demo-Daten entfernen.
 *
 * Luigi, Max Muster und die Beispielbaustellen waren nützlich, solange die
 * App vorgeführt wurde. Sobald echte Aufträge darin stehen, weiß man bei
 * jeder Zeile nicht mehr, ob sie echt ist. Gelöscht wird ausschließlich, was
 * als Demo markiert ist – aus „Das Programm" übernommene Datensätze tragen
 * diese Markierung nie und können hier nicht versehentlich mitgehen.
 */
function DemoEntfernen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: ich } = useIch();
  const [sicher, setSicher] = React.useState(false);

  const { data } = useQuery({
    queryKey: ['demo'],
    queryFn: () => api.get<{ offen: number }>('/api/demo'),
  });

  const entfernen = useMutation({
    mutationFn: () => api.delete<{ message: string }>('/api/demo'),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      setSicher(false);
      toast({ title: res.message, tone: 'success', duration: 8000 });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  if (!data) return null;
  // Löschen ist Systemsache. Wer es nicht darf, sieht den Knopf nicht –
  // der Server würde ihn ohnehin abweisen.
  if (!ich?.rechte?.system) return null;

  if (data.offen === 0) {
    return (
      <p className="mt-3 border-t pt-2 text-2xs text-muted-foreground">
        Keine Demo-Daten vorhanden – die App arbeitet ausschließlich mit echten Daten.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-2">
      <p className="text-2xs text-muted-foreground">
        {data.offen} Demo-Datensätze sind noch vorhanden. Sie stammen aus der Vorführung und gehören
        nicht in den laufenden Betrieb.
      </p>
      {sicher ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => entfernen.mutate()}
            disabled={entfernen.isPending}
          >
            <Trash2 /> {entfernen.isPending ? 'Wird entfernt …' : 'Endgültig entfernen'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSicher(false)}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setSicher(true)}>
          <Trash2 /> Demo-Daten entfernen
        </Button>
      )}
    </div>
  );
}

/**
 * Benutzerverwaltung – nur für die Verwaltung.
 *
 * Passwörter vergibt ausschließlich diese Stelle. Damit kommt der Betrieb in
 * jedes Konto, auch wenn jemand ausfällt oder seines vergisst; ein
 * Selbstbedienungs-Weg gäbe es nicht, ohne genau das aufzugeben.
 */
function BenutzerTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [neuesPasswort, setNeuesPasswort] = React.useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['benutzer'],
    queryFn: () =>
      api.get<{
        users: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          role: 'ADMIN' | 'LEITUNG' | 'BAULEITER';
          active: boolean;
          hatPasswort: boolean;
          lastLoginAt: string | null;
          siteManagerId: string | null;
        }[];
      }>('/api/benutzer'),
  });

  const aendern = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      api.patch<{ message: string }>(`/api/benutzer/${id}`, patch),
    onSuccess: (res, variablen) => {
      queryClient.invalidateQueries({ queryKey: ['benutzer'] });
      setNeuesPasswort((v) => ({ ...v, [variablen.id]: '' }));
      toast({ title: res.message, tone: 'success' });
    },
    onError: (e: Error) => toast({ title: e.message, tone: 'error' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ShieldAlert className="size-4" /> Benutzer
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Wer hereindarf und was er darf. Passwörter werden hier vergeben – niemand setzt sich
          selbst eines.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data?.users ?? []).map((u) => (
          <div key={u.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.firstName} {u.lastName}
                  {!u.active ? (
                    <Badge variant="rot" className="ml-2">
                      inaktiv
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-2xs text-muted-foreground">
                  {u.email}
                  {u.lastLoginAt
                    ? ` · zuletzt angemeldet ${formatDateTime(u.lastLoginAt)}`
                    : ' · noch nie angemeldet'}
                  {u.siteManagerId ? '' : ' · nicht mit einem Bauleiter verknüpft'}
                </p>
              </div>
              <Select
                value={u.role}
                onChange={(e) => aendern.mutate({ id: u.id, role: e.target.value })}
                className="h-8 w-auto text-xs"
                aria-label="Rolle"
              >
                <option value="ADMIN">Verwaltung</option>
                <option value="LEITUNG">Leitung</option>
                <option value="BAULEITER">Bauleitung</option>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => aendern.mutate({ id: u.id, active: !u.active })}
              >
                {u.active ? 'Stilllegen' : 'Aktivieren'}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Field
                label="Neues Passwort"
                hint="Mindestens 10 Zeichen."
                className="min-w-[14rem] flex-1"
              >
                <Input
                  type="text"
                  value={neuesPasswort[u.id] ?? ''}
                  onChange={(e) => setNeuesPasswort((v) => ({ ...v, [u.id]: e.target.value }))}
                  placeholder={u.hatPasswort ? '••••••••••' : 'noch keines gesetzt'}
                  className="h-8 text-xs"
                />
              </Field>
              <Button
                size="sm"
                disabled={(neuesPasswort[u.id] ?? '').length < 10}
                onClick={() => aendern.mutate({ id: u.id, neuesPasswort: neuesPasswort[u.id] })}
              >
                Setzen
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
