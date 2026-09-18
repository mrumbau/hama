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
   neue App anlegen: **Custom App → Server Authentication (Client Credentials
   Grant)**.
2. Unter *Configuration → Application Scopes*: **Write all files and folders
   stored in Box** setzen.
3. Unter *Configuration → App Access Level*: **App Access Only** genügt.
4. Speichern. Dann muss ein Box-Administrator die App unter *Admin Console →
   Apps → Custom Apps Manager* freigeben. Ohne diesen Schritt bekommt die App
   kein Token.
5. Das Dienstkonto der App (`AutomationUser_…@boxdevedition.com`, steht in der
   Console unter *General Settings → Service Account Info*) als **Editor** auf
   den Ordner *Dispo-Sicherung* einladen. Das ist der eigentliche Zugriff –
   ihn nimmt man einem Klick wieder weg.
6. In Vercel (Projekt `mr-umbau-dispo`, Environment *Production*) eintragen:

   | Variable            | Wert                                        | Typ    |
   | ------------------- | ------------------------------------------- | ------ |
   | `BOX_CLIENT_ID`     | aus der App                                 | normal |
   | `BOX_CLIENT_SECRET` | aus der App                                 | Secret |
   | `BOX_SUBJECT_ID`    | Enterprise-ID (Admin Console → Account Info) | normal |
   | `BOX_SUBJECT_TYPE`  | `enterprise` (Vorgabe, kann entfallen)       | normal |
   | `BOX_ORDNER_ID`     | `419334081556`                               | normal |

7. Neu ausliefern, dann in den Einstellungen auf **Jetzt sichern** drücken.
   Klappt es, liegt die Datei sofort im Ordner.

Fehlt etwas, sagt die App beim Sichern genau, welche Variable fehlt, statt
stillschweigend nichts zu tun.

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
