-- Die drei Bauleiter als Benutzer anlegen.
--
-- Ohne Passwort: Jeder vergibt es beim ersten Anmelden selbst, gegen den
-- Einrichtungscode aus DISPO_SETUP_CODE. So steht kein Startpasswort im
-- Repository und keines muss verschickt werden.
--
-- Die Rollen bilden ab, was besprochen wurde:
--   Marlon Tschon    - ADMIN     (Einstellungen aendern, System, Protokoll)
--   Carsten Reuter   - LEITUNG   (Protokoll, aber keine Systemansicht)
--   Philipp Schmidt  - BAULEITER (planen, Stammdaten, keine Einsicht ins Protokoll)
--
-- Verknuepft wird ueber den Namen mit dem vorhandenen Bauleiter-Datensatz -
-- davon haengt ab, welche Baustellen als "seine" gelten.
INSERT INTO "users" ("id", "email", "firstName", "lastName", "role", "siteManagerId", "active", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || v.email),
  v.email, v."firstName", v."lastName", v.rolle::"UserRole",
  (SELECT m."id" FROM "site_managers" m
    WHERE m."firstName" = v."firstName" AND m."lastName" = v."lastName"
    ORDER BY m."active" DESC LIMIT 1),
  true, now(), now()
FROM (VALUES
  ('mt@mrumbau.de',  'Marlon',  'Tschon',        'ADMIN'),
  ('cr@mrumbau.de',  'Carsten', 'Reuter',        'LEITUNG'),
  ('ps@mrumbau.de',  'Philipp', 'Chama-Schmidt', 'BAULEITER')
) AS v(email, "firstName", "lastName", rolle)
WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u."email" = v.email);
