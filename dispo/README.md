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
npm run db:migrate            # Schema anlegen
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
| `npm run db:migrate` | Migration in der Entwicklung |
| `npm run db:deploy` | Migrationen produktiv anwenden |
| `npm run db:seed` | Demo-Daten neu aufsetzen |
| `npm run db:studio` | Daten im Prisma Studio ansehen |

---

## 2. Wo die Datenbank liegt

Eine einzige **PostgreSQL**-Datenbank, adressiert über `DATABASE_URL`.
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
  getProjects(): Promise<ErpProject[]>;
  getProject(erpId: string): Promise<ErpProject | null>;
}
```

| Datei | Rolle |
|---|---|
| `src/server/integrations/erp-provider.ts` | Schnittstelle und Datenmodell |
| `src/server/integrations/mock-erp-provider.ts` | Testmodus mit Beispielaufträgen |
| `src/server/integrations/das-programm-provider.ts` | Echte API |
| `src/server/integrations/sync.ts` | Abgleich in die Dispo-Datenbank |

**Umschalten** – ohne eine einzige Änderung am übrigen Code:

```bash
DISPO_ERP_PROVIDER="das-programm"
DAS_PROGRAMM_BASE_URL="https://…"
DAS_PROGRAMM_API_KEY="…"
```

Anzupassen bleibt nur `mapProject()` in `das-programm-provider.ts` – dort
werden die tatsächlichen Feldnamen der ERP-Antwort zugeordnet.

**Auslösen:** Einstellungen → Integrationen → *„Projekte aus Das Programm
aktualisieren“*, oder `POST /api/integrations/das-programm/sync`. Für eine
automatische Synchronisation genügt ein Cron-Job auf diesen Endpoint.

### Sync-Regeln

| Führend | Felder |
|---|---|
| **ERP** | Kunde, Anschrift, Auftrags- und Projektnummer, Projektname, Ansprechpartner |
| **Dispo-App** | Einsätze, Bauleiterzuordnung, Status, Ampel, Materialstatus, Kundenbestätigung, Notizen, Historie |

Termine werden aus dem ERP nur **ergänzt**, nie überschrieben: Weicht der
ERP-Termin von der Dispo-Planung ab, gewinnt die Dispo-Planung und der Sync
meldet die Abweichung. Eine telefonisch vereinbarte Verschiebung darf nicht
stillschweigend zurückgesetzt werden.

---

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
| `DATABASE_URL` | **ja** | PostgreSQL-Verbindung |
| `DISPO_ERP_PROVIDER` | nein | `mock` (Standard) oder `das-programm` |
| `DAS_PROGRAMM_BASE_URL` | bei echter API | Basis-URL des ERP |
| `DAS_PROGRAMM_API_KEY` | bei echter API | API-Schlüssel |
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
