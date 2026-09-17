# MR Umbau – Dispo / Einsatzplanung

Interne Web-App für die operative Disposition der MR Umbau GmbH:
Plantafel, Ressourcenplanung, Baustellenübersicht, Änderungshistorie.

**Diese App ist kein ERP.** „Das Programm“ bleibt zuständig für Kunden,
Angebote, Aufträge, Rechnungen und alle kaufmännischen Projektstammdaten.
Diese App ist ausschließlich für Disposition und Einsatzplanung da.

---

## 1. Anwendung starten

**Voraussetzungen:** Node.js 20+, PostgreSQL 14+.

```bash
cd dispo
npm install

cp .env.example .env          # DATABASE_URL eintragen
npm run db:deploy             # Schema anlegen
npm run db:seed               # Demo-Daten (optional, klar als „Demo“ markiert)

npm run dev                   # Entwicklung  → http://localhost:3000
```

Produktivbetrieb:

```bash
npm run build
npm run db:deploy             # Migrationen anwenden
npm start                     # → http://localhost:3000
```

Beim Öffnen erscheint sofort die **Plantafel** – sie ist die Startseite.

### Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm start` | Produktionsbuild und -start |
| `npm run typecheck` | TypeScript prüfen |
| `npm test` | Unit- und API-Tests (Vitest) |
| `npm run db:deploy` | Migrationen anwenden (Ersteinrichtung und Produktion) |
| `npm run db:migrate` | Neue Migration erzeugen (nur bei Schemaänderungen) |
| `npm run db:seed` | Demo-Daten neu aufsetzen |
| `npm run db:studio` | Daten im Prisma Studio ansehen |

---

## 2. Wo die Datenbank liegt

Eine einzige **PostgreSQL**-Datenbank, adressiert über `DATABASE_URL`
(Migrationen laufen über `DIRECT_DATABASE_URL`, siehe Abschnitt 6).
Es gibt keine zweite Datenhaltung, keine Dateiablage, keinen Cache-Dienst –
alles Operative liegt in dieser Datenbank.

Das Schema steht in [`prisma/schema.prisma`](prisma/schema.prisma),
die Migrationen in `prisma/migrations/`. Kernstruktur:

| Tabelle | Inhalt |
|---|---|
| `projects` | Baustellen (ERP-Daten + Dispo-Felder) |
| `assignments` | **Einsätze** – die zentrale Struktur: eine Ressource, ein Zeitraum, ein Projekt |
| `employees`, `site_managers`, `subcontractors` | Ressourcen |
| `trades` + Verknüpfungstabellen | Gewerke / Qualifikationen |
| `communications` | Telefonate (3CX) |
| `change_requests` | Änderungsvorschläge – wirksam erst nach „Übernehmen“ |
| `audit_log` | Vollständige Änderungshistorie |
| `project_notes` | Dispo-Notizen |
| `warning_dismissals` | Abgehakte offene Punkte |
| `sync_state`, `integration_events` | Zustand und Roh-Eingang der Integrationen |

Zwei bewusste Entscheidungen:

* **Ein Einsatz = eine Ressource.** Mehrere Personen auf einer Baustelle sind
  mehrere Einsätze. Das macht Drag & Drop, Konflikterkennung und die
  Ressourcenansicht trivial statt kompliziert.
* **Ampel und Warnungen werden berechnet, nicht gespeichert.** Gespeicherte
  Ampeln veralten in dem Moment, in dem sich ein Einsatz ändert. Persistiert
  wird nur eine bewusste manuelle Übersteuerung
  (`projects.trafficLightOverride`) und das Abhaken eines offenen Punkts.

---

## 3. Backups

Die gesamte Disposition ist ein Datenbank-Dump:

```bash
mkdir -p backups
pg_dump "$DATABASE_URL" -Fc -f "backups/dispo-$(date +%F).dump"
```

Wiederherstellen:

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists backups/dispo-2026-09-16.dump
```

Empfehlung: täglich per Cron, Aufbewahrung 30 Tage. Bei einem gehosteten
PostgreSQL (z. B. Supabase) reichen die dortigen automatischen Backups –
sie sollten dennoch mindestens einmal testweise zurückgespielt werden.

---

## 4. „Das Programm“ anbinden

Die gesamte ERP-Kommunikation läuft über **eine** Schnittstelle; der Rest der
Anwendung kennt das ERP nicht:

```ts
interface ErpProvider {
  healthCheck()
  getProjects()
  getProject(erpId)
  getEmployees()
  getSuppliers()
  setProjectStatus(erpId, status)   // einzige schreibende Operation
}
```

| Datei | Rolle |
|---|---|
| `src/server/integrations/erp-provider.ts` | Schnittstelle und Datenmodell |
| `src/server/integrations/mock-erp-provider.ts` | Testmodus, den echten Datensätzen nachgebildet |
| `src/server/integrations/das-programm-provider.ts` | Echte GraphQL-API |
| `src/server/integrations/mapping.ts` | Übersetzungsregeln (Status, SUB-Erkennung, Gewerke) |
| `src/server/integrations/sync.ts` | Abgleich in die Dispo-Datenbank |
| `src/server/integrations/writeback.ts` | Statusmeldung zurück ins ERP |

**Umschalten** – ohne Änderung am übrigen Code:

```bash
DISPO_ERP_PROVIDER="das-programm"
DAS_PROGRAMM_API_KEY="…"
# Die folgenden haben brauchbare Vorgaben und werden nur bei Abweichung gesetzt:
DAS_PROGRAMM_GRAPHQL_URL="https://app.das-programm.io/api/graphql"
DAS_PROGRAMM_AUTH_HEADER="Authorization"
DAS_PROGRAMM_AUTH_PREFIX="Bearer "
DAS_PROGRAMM_WRITEBACK="1"   # erlaubt das Zurückschreiben des Projektstatus
```

**Prüfen:** Einstellungen → Integrationen → *„Verbindung prüfen“*. Zeigt
Endpunkt, Header und die Antwort des Servers im Klartext – ein falscher
Auth-Header ist daran sofort zu erkennen.

**Auslösen:** Einstellungen → Integrationen → *„Projekte aus Das Programm
aktualisieren“*, oder `POST /api/integrations/das-programm/sync`. Für einen
automatischen Abgleich genügt ein Cron-Job auf diesen Endpunkt.

Gelesen wird über die dokumentierten Abfragen `projectSearch` / `project`,
`employeeSearch` / `employee` und `supplierSearch` / `supplier`. Listen und
Details werden gebündelt abgefragt (25 Datensätze je Anfrage), damit aus 200
Mitarbeitern nicht 200 Anfragen werden.

### Was übernommen wird

* **Projekte** – Kunde, Projekt- und Auftragsnummer, Projektleiter, Termine.
  Als Anschrift zählt die **Objektadresse** des Projekts, nicht die
  Rechnungsadresse des Kunden – die Dispo interessiert, wo gearbeitet wird.
* **Personen** – aus `employeeSearch`. Wer an mindestens einem Projekt als
  Projektleiter hängt, wird Bauleiter; alle anderen werden Mitarbeiter.
  Wer im ERP archiviert ist oder dessen Vertrag abgelaufen ist, wird in der
  Dispo **inaktiv gesetzt, nicht gelöscht** – sonst verschwände die Historie
  seiner Einsätze. Umgekehrt gilt: wer hier von Hand auf inaktiv gesetzt wurde,
  taucht beim nächsten Abgleich **nicht** wieder auf.
* **Subunternehmer** – „Das Programm“ kennt keine eigene Gruppe dafür. Ein
  Lieferant gilt als SUB, wenn im Kommentarfeld „Sub“, „Subunternehmer“ oder
  „Nachunternehmer“ als eigenes Wort steht. Das Gewerk wird aus der Zeile
  `Tätigkeit: …` gelesen, der Ansprechpartner aus `AP bei: …`.
  Die Wortgrenze ist Absicht: sonst würde „Substrat“ einen Gartenlieferanten
  zum Subunternehmer machen (dieser Fall ist getestet).

Zugeordnet wird über die **ERP-ID**, nicht über den Namen. Eine Korrektur der
Schreibweise oder eine Heirat legt deshalb keinen zweiten Datensatz an.
Gehaltsdaten werden bewusst nicht abgefragt – die Dispo hat dort nichts zu
suchen.

### Statusregeln

**Aus dem ERP in die Dispo** – läuft bei jedem Abgleich:

| Im ERP | In der Dispo |
|---|---|
| `closed`, `lost` | → **Erledigt** (setzt sich immer durch) |
| `invoice`, `waiting_for_payment` | → **Fertig** |
| `won`, `active` | → *Terminierung erforderlich*, **aber nur**, solange die Dispo noch nichts entschieden hat |
| `order_fulfillment` | bleibt unberührt – wie weit die Baustelle ist, weiß nur die Dispo |
| `new`, `quotation`, `sales` | → *Neu* |

Der Grundsatz dahinter: Ein Abschluss im ERP gilt. Alles andere darf eine
laufende Planung **nicht** zurückdrehen – sonst springt eine Baustelle, die
gerade in Ausführung ist, zurück auf „Terminierung erforderlich“, nur weil im
ERP jemand etwas gespeichert hat. Termine ergänzt der Abgleich, überschreibt
sie aber nie; Abweichungen werden gemeldet.

**Aus der Dispo ins ERP** – nur bei `DAS_PROGRAMM_WRITEBACK=1`, und nur in dem
Moment, in dem jemand den Status ändert:

| In der Dispo | Im ERP |
|---|---|
| **Erledigt** | → `closed` |
| **Fertig** | → `invoice` |
| **In Ausführung**, **Abnahme** | → `order_fulfillment` |
| alles andere (*geplant*, *warten auf Material* …) | nichts – das sind Planungsstände, die das ERP nichts angehen |

Drei Sicherungen dabei:

1. Geschrieben wird **ausschließlich** das Feld `status`, nichts sonst.
2. Nur **vorwärts**. Steht im ERP schon eine Rechnung, schiebt ein versehentlich
   zurückgesetzter Dispo-Status das Projekt dort nicht zurück in die
   Auftragsabwicklung. Ein unbekannter ERP-Status wird nie überschrieben.
3. Ein Fehler im ERP **blockiert die Dispo nicht**. Gespeichert ist gespeichert;
   der Versuch steht mit Begründung in der Projekt-Historie, und die
   Rückmeldung nach dem Speichern sagt, ob es angekommen ist.

> **Voraussetzung im Arbeitsablauf:** Die Übernahme hängt an Projekten. Zu
> jedem Auftrag muss in „Das Programm“ ein Projekt existieren, sonst taucht
> er in der Plantafel nicht auf.

## 5. 3CX anbinden

Die Architektur ist vollständig vorbereitet; es fehlt nur die Zustellung.

**Endpoint:** `POST /api/integrations/3cx/events`

```json
{
  "callId": "3cx-4711",
  "occurredAt": "2026-09-16T14:42:00Z",
  "direction": "EINGEHEND",
  "callerNumber": "+49 8024 998877",
  "calledNumber": "+49 89 1234567-11",
  "durationSeconds": 392,
  "agentName": "Carsten Reuter",
  "customerName": "Daniel Kufner",
  "summary": "Kunde möchte den Montagetermin auf Donnerstag verschieben.",
  "transcript": "…",
  "actionItems": ["Termin verschieben"],
  "recordingUrl": "https://3cx.example/recording/4711"
}
```

**Absicherung:** Ist `THREECX_WEBHOOK_SECRET` gesetzt, muss der Aufrufer den
Rohbody per HMAC-SHA256 signieren und als `x-dispo-signature` mitsenden
(`<hex>` oder `sha256=<hex>`):

```bash
BODY='{"callId":"…"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$THREECX_WEBHOOK_SECRET" -r | cut -d' ' -f1)
curl -X POST https://dispo.example/api/integrations/3cx/events \
     -H "Content-Type: application/json" -H "x-dispo-signature: $SIG" -d "$BODY"
```

**Verarbeitung:**

1. Das Rohereignis wird **immer zuerst** gespeichert (`integration_events`) –
   nichts geht verloren, auch wenn die Weiterverarbeitung scheitert.
2. Zuordnung: Auftragsnummer → Telefonnummer → Ansprechpartner → Kundenname.
   Genau ein laufendes Projekt → wird vorgeschlagen. Mehrere Projekte → die
   App entscheidet **nicht** selbst, sondern fragt nach.
3. Aus Zusammenfassung/Transkript entsteht ein **Änderungsvorschlag**.
4. Erst nach *„Übernehmen“* wird ein Termin tatsächlich geändert.

**Ohne echte Anlage testen:** Kommunikation → *„3CX-Testanruf simulieren“*
(oder `POST /api/integrations/3cx/simulate`).

### AI-Änderungserkennung

Ohne API-Key läuft eine **regelbasierte Erkennung** (Wochentage,
Schlüsselwörter) – offline, deterministisch und für die typischen Sätze
ausreichend. Ist `ANTHROPIC_API_KEY` gesetzt, kommt zusätzlich eine
Claude-Analyse hinzu; schlägt sie fehl, greift still die Heuristik.

**Die AI ändert niemals Daten.** Sie erzeugt ausschließlich Vorschläge.

---

## 6. Environment Variables

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `DATABASE_URL` | **ja** | PostgreSQL-Verbindung. Einzige Pflichtvariable. Bei einer Supabase-Pooler-Adresse zieht die App Port und Parameter selbst auf den Transaction-Pooler (6543, `pgbouncer=true`, `connection_limit=1`) – über eine Sitzungsverbindung fällt sie unter Last mit `EMAXCONNSESSION` aus. Andere Hosts bleiben unangetastet. |
| `DIRECT_DATABASE_URL` | nein | Verbindung für Migrationen. Fehlt sie, wird sie aus `DATABASE_URL` abgeleitet (Port 6543 → 5432). Nur nötig, wenn Ihr Anbieter das anders regelt. |
| `DISPO_SEED_ON_DEPLOY` | nein | `1` erzwingt Demo-Daten. Ohne die Variable werden sie nur in eine **leere** Datenbank eingespielt. |
| `DISPO_ERP_PROVIDER` | nein | `mock` (Standard) oder `das-programm` |
| `DAS_PROGRAMM_API_KEY` | bei echter API | API-Schlüssel |
| `DAS_PROGRAMM_GRAPHQL_URL` | nein | Endpunkt. Standard `https://app.das-programm.io/api/graphql` |
| `DAS_PROGRAMM_AUTH_HEADER` / `_AUTH_PREFIX` | nein | Standard `Authorization` und `Bearer ` |
| `DAS_PROGRAMM_WRITEBACK` | nein | `1` erlaubt der Dispo, den Projektstatus im ERP zu setzen |
| `THREECX_WEBHOOK_SECRET` | empfohlen | HMAC-Secret des 3CX-Webhooks |
| `ANTHROPIC_API_KEY` | nein | schaltet die AI-Analyse zu |
| `DISPO_AI_MODEL` | nein | Modell-ID (Standard `claude-opus-5`) |
| `DISPO_BASIC_AUTH_USER` / `_PASSWORD` | nein | einfacher Zugriffsschutz, falls öffentlich erreichbar |

Alle Secrets werden ausschließlich serverseitig gelesen. Es gibt keine
`NEXT_PUBLIC_*`-Variable und keinen Schlüssel im Frontend.

### Zugriff in Version 1

Version 1 hat **bewusst keine Benutzerverwaltung**: ein Disponent, ein Zugang.
Ist die App öffentlich erreichbar, aktivieren `DISPO_BASIC_AUTH_USER` und
`DISPO_BASIC_AUTH_PASSWORD` einen einfachen serverseitigen Riegel
(`src/middleware.ts`). Der 3CX-Webhook ist davon ausgenommen – er hat seine
eigene Signaturprüfung. Das ersetzt keine Rechteverwaltung.

### Deployment (z. B. Vercel)

Die App ist eine gewöhnliche Next.js-Anwendung und lässt sich überall
betreiben, wo Node läuft. Für Vercel ist alles vorbereitet:

* `npm run vercel-build` wendet vor dem Build die Migrationen an
  (`scripts/deploy-prepare.mjs`). Das muss dort geschehen, weil die
  Buildumgebung die Datenbank erreicht.
* Nötig ist im Projekt genau eine Variable: `DATABASE_URL`. Demo-Daten legt
  der Build selbsttätig an, solange die Datenbank leer ist.
* **Serverlos zwingend den Transaction-Pooler benutzen.** Jeder Funktions-
  aufruf öffnet eine eigene Verbindung. Über eine Sitzungsverbindung
  (Port 5432) bleiben die offen, und nach 15 gleichzeitigen Aufrufen
  antwortet die Datenbank nur noch mit
  `FATAL: (EMAXCONNSESSION) max clients reached in session mode`.
  Port 6543 plus `pgbouncer=true&connection_limit=1` gibt jede Verbindung
  sofort wieder frei.
* **Die Variable muss für alle Umgebungen gelten** – Production *und* Preview
  *und* Development. Vercel setzt beim Anlegen standardmäßig nur Production;
  Builds von einem Branch sind aber Preview-Builds und sehen die Variable
  dann nicht. Der Build bricht in dem Fall mit „DATABASE_URL ist nicht
  gesetzt" ab, obwohl der Wert im Projekt hinterlegt ist.
* **Root Directory** im Vercel-Projekt auf `dispo` setzen – die App liegt in
  einem Unterverzeichnis des Repositorys.
* `vercel.json` legt die Region auf `fra1` (Frankfurt) fest. Anwendung und
  Datenbank sollten am selben Ort stehen: jede Abfrage über den Atlantik
  kostet rund 100 ms, und die Plantafel stellt mehrere pro Aufruf.

Ist die Anwendung öffentlich erreichbar, sollte der Basic-Auth-Schutz gesetzt
sein. Es handelt sich um ein internes Werkzeug.

---

## 7. Was Version 2 bringt

Vorbereitet, aber bewusst **nicht** in Version 1 gebaut:

* **Benutzerverwaltung** – mehrere Disponenten, Bauleiter-Logins. Jede Mutation
  schreibt bereits ins Audit-Log; dort muss nur ein `actor` ergänzt werden.
* **Echte Das-Programm-API** – der Provider ist fertig, nur `mapProject()`
  fehlt. Zusätzlich automatischer Sync per Cron.
* **3CX produktiv** – Endpoint, Signaturprüfung, Zuordnung und Vorschlagslogik
  stehen; es fehlt die Zustellung aus der Anlage.
* **Outlook-/Microsoft-365-Kalender** – Einsätze als Termine spiegeln.
* **Push-Benachrichtigungen** bei roten Baustellen und neuen Telefonaten.
* **Mitarbeiter- und SUB-Ansicht** (nur lesend, ohne Lizenzkosten).
* **Automatische Kundenbestätigung** per E-Mail oder WhatsApp.
* **Materialtermine und Lieferanten** als eigene Ressourcenart.
* **Auswertungen** – „Warum wurde diese Baustelle dreimal verschoben?“ ist
  bereits beantwortbar: jede Verschiebung trägt einen strukturierten Grund.

Ausdrücklich **nicht** geplant: Angebote, Rechnungen, Zeiterfassung, Lohn,
Buchhaltung, DATEV, Lagerverwaltung. Das gehört ins ERP.

---

## 8. Aufbau

```
dispo/
├── prisma/            Datenmodell, Migrationen, Demo-Daten
├── src/
│   ├── app/           Seiten (App Router) und API-Routen
│   ├── components/    Oberfläche – plantafel/, project/, people/, communication/
│   ├── lib/           Datum, Labels, Typen, Datenbank-Client
│   ├── server/        Fachlogik: ampel, warnings, board, assignments,
│   │                  projects, audit, change-requests, integrations/
│   └── middleware.ts  optionaler Zugriffsschutz
└── tests/             Unit- und API-Tests, e2e/ Browser-Rauchtest
```

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS,
Radix UI, TanStack Query, dnd-kit, Prisma, PostgreSQL. Ein Monolith, keine
Microservices.

---

## 9. Tests

```bash
npm test                                    # Unit- + API-Tests
DISPO_TEST_URL=http://localhost:3000 \
  node tests/e2e/smoke.mjs                  # Drag & Drop, Undo, Kontextmenü
  node tests/e2e/mobile.mjs                 # Handy- und Tablet-Darstellung
```

Die API-Tests laufen gegen eine gestartete Instanz, legen eigene Datensätze
an und räumen hinter sich auf. Abgedeckt sind unter anderem: Mitarbeiter und
SUB zuweisen, Einsatz und ganzes Projekt verschieben, Doppelbelegung erzeugen
und bestätigen, Warnungen, Terminänderung übernehmen und ablehnen, Audit-Log,
Suche, Filter, 3CX-Demoevent samt Projektzuordnung und Änderungsvorschlag.
