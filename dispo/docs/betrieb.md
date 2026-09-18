# Betrieb

Was läuft, ohne dass jemand darauf drückt – und wie man es wieder herstellt.

## Zeitpläne

Zwei Aufträge laufen in der Datenbank (Supabase, Erweiterungen `pg_cron` und
`pg_net`). Sie stehen nicht in den Prisma-Migrationen, weil es diese
Erweiterungen auf einer normalen Postgres-Installation nicht gibt und jede
lokale Migration daran scheitern würde. Deshalb stehen sie hier – sonst weiß
in einem Jahr niemand mehr, dass es sie gibt.

Nachsehen, was eingerichtet ist:

```sql
select jobid, jobname, schedule, active from cron.job;
select jobid, status, start_time, return_message
from cron.job_run_details order by start_time desc limit 20;
```

Die Antwort der App steht in `net._http_response` – `status_code` 200 heißt,
dass sie den Auftrag wirklich ausgeführt hat. Ein `succeeded` in
`cron.job_run_details` heißt nur, dass der Anruf abgesetzt wurde.

### Abgleich mit „Das Programm" – alle zehn Minuten

```sql
select cron.schedule('dispo-abgleich', '*/10 * * * *', $$
  select net.http_post(
    url     := 'https://dispo.mrumbau.de/api/integrations/das-programm/sync',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-dispo-cron', (select value from dispo.settings where key = 'cronToken')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
```

### Sicherung nach Box – jede Nacht

```sql
select cron.schedule('dispo-sicherung', '15 1 * * *', $$
  select net.http_post(
    url     := 'https://dispo.mrumbau.de/api/sicherung',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-dispo-cron', (select value from dispo.settings where key = 'cronToken')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
```

`15 1 * * *` ist UTC – im Sommer 03:15, im Winter 02:15 deutscher Zeit. Die
Uhrzeit ist bewusst krumm: Zur vollen Stunde starten überall Aufträge.

Der Ausweis (`cronToken`) steht in `dispo.settings`. Die Datenbank hat ihn
selbst erzeugt (Migration `20260918110000_zeitplan_geheimnis`); er steht
nirgends sonst. Wer ihn ersetzen will, löscht die Zeile – beim nächsten
Deployment entsteht ein neuer.

## Sicherung nach Box

Jede Nacht legt die App den kompletten Stand als lesbare JSON-Datei in
**MRumbau / Dispo-Sicherung** ab, eine Datei je Tag. Box hebt ältere
Fassungen desselben Tages ohnehin auf.

Nicht in der Datei: Kennwort-Hashes und alles aus `settings`, dessen
Schlüssel auf `token`, `secret`, `geheimnis` oder `passwort` endet. Eine
Sicherung landet in einem Ordner, in den Kollegen schauen können.

### Einrichten

Die App braucht ein eigenes Box-Konto – ein persönliches Anmelden gibt es
nachts um drei nicht.

1. In der [Box Developer Console](https://app.box.com/developers/console) eine
   neue App anlegen: **Eigene App (Custom App) → Serverauthentifizierung
   (Client Credentials Grant)**.

2. Reiter **Konfiguration**:
   - *App-Zugriffsebene*: **Nur App-Zugriff** (App Access Only). Mehr braucht
     es nicht – die App bekommt ein eigenes Dienstkonto, und Zugriff auf
     unsere Ordner bekommt sie in Schritt 4 als eingeladener Mitarbeiter.
     „App- + Enterprise-Zugriff" gäbe ihr Zugriff auf alle Benutzer der Firma.
   - *Anwendungsbereiche*: **Alle in Box gespeicherten Dateien und Ordner
     lesen und schreiben**.
   - *Zusätzliche Konfiguration* (`as-user`-Header, Benutzerzugriffstoken):
     nichts ankreuzen. Beides brauchen wir nicht, und beides zieht eine
     weitergehende Genehmigung nach sich.
   - **Speichern**.

3. Reiter **Autorisierung** → **Überprüfen und einreichen**. Das ist der
   Schritt, ohne den die App kein Token bekommt: Sie schickt eine Anfrage an
   den Box-Administrator, der sie dann in der Admin Console unter *Apps →
   Benutzerdefinierte Apps-Verwaltung* freigibt. Bei uns ist das dieselbe
   Person – die Mail kommt also an einen selbst zurück.

   Gibt es den Reiter nicht, ist das kein Beinbruch: Dann hat dieses Konto
   keine Enterprise-Verwaltung, und die App darf sofort. Einfach weitermachen
   und in Schritt 6 ausprobieren – die App sagt, woran es liegt.

4. Das Dienstkonto der App als **Bearbeiter** auf den Ordner
   *Dispo-Sicherung* einladen. Es heißt `AutomationUser_…@boxdevedition.com`
   und steht im Reiter *Allgemeine Einstellungen* unter
   *Dienstkonto-Informationen*. Das ist der eigentliche Zugriff – den nimmt
   man mit einem Klick wieder weg, und die App kommt an nichts anderes heran.

5. In Vercel (Projekt `mr-umbau-dispo`, Environment *Production*) eintragen:

   | Variable            | Wert                                    | Typ    |
   | ------------------- | --------------------------------------- | ------ |
   | `BOX_CLIENT_ID`     | Konfiguration → OAuth 2.0-Zugangsdaten   | normal |
   | `BOX_CLIENT_SECRET` | ebenda (nur mit 2FA am Konto sichtbar)   | Secret |
   | `BOX_SUBJECT_ID`    | Enterprise-ID, siehe unten               | normal |
   | `BOX_SUBJECT_TYPE`  | `enterprise` (Vorgabe, kann entfallen)   | normal |
   | `BOX_ORDNER_ID`     | `419334081556`                           | normal |

   Die **Enterprise-ID** steht in der Admin Console unter *Konto &
   Abrechnung → Kontoinformationen*. Es ist eine reine Zahlenfolge, nicht die
   Client-ID.

6. Neu ausliefern, dann in den Einstellungen auf **Jetzt sichern** drücken.
   Klappt es, liegt die Datei sofort im Ordner.

Fehlt etwas, sagt die App beim Sichern genau, welche Variable fehlt, statt
stillschweigend nichts zu tun. Kommt eine Antwort von Box zurück, steht sie
im Wortlaut da – lange Zeichenketten werden vorher gekürzt, damit kein Token
in der Meldung landet. Die beiden häufigsten:

- *„Grant credentials are invalid"* – meist die falsche `BOX_SUBJECT_ID`
  (Client-ID statt Enterprise-ID) oder die App ist noch nicht freigegeben.
- *403 beim Hochladen* – die App ist freigegeben, aber das Dienstkonto sitzt
  noch nicht auf dem Ordner (Schritt 4).

### Prüfen

- In den Einstellungen steht, wann zuletzt gesichert wurde und wie viele
  Datensätze drin waren.
- **Sicherung herunterladen** gibt dieselbe Datei direkt aus – ohne Box, auch
  wenn Box gerade klemmt.

## Zurückspielen

Eine Sicherung, die noch nie jemand zurückgespielt hat, ist eine Vermutung.
Der Weg ist absichtlich eine Kommandozeile und kein Knopf.

```bash
# Trockenlauf – sagt, was passieren würde, schreibt nichts
node scripts/sicherung-einspielen.mjs dispo-sicherung-2026-09-18.json

# Ernstfall
DATABASE_URL="…" node scripts/sicherung-einspielen.mjs datei.json --wirklich
```

Geschrieben wird nur in leere Tabellen. In eine laufende Datenbank
zurückspielen hieße, zwei Stände ineinanderlaufen zu lassen – hinterher
könnte niemand sagen, welcher gilt.

Kennwörter sind nicht Teil der Sicherung. Nach dem Zurückspielen meldet man
sich über Microsoft an wie vorher.

## Umgebungen

`dispo` ist die Produktion, `dispo_test` gehört den Vorschauen und der
Entwicklung. Welches Schema gilt, entscheidet `VERCEL_ENV` in
`src/lib/db-url.ts` – nicht eine Einstellung, die jemand vergessen kann.
