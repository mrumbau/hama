-- Wer „Bauleitung" traegt, ist Bauleiter - auch rueckwirkend.
--
-- Die Regel gab es schon, sie griff aber nur beim Aendern eines
-- Mitarbeiters. Wer die Faehigkeit ueber „Das Programm" oder beim Anlegen
-- bekam, blieb ohne Bauleiter-Datensatz und war am Projekt nicht waehlbar.
-- Der Code stoesst den Abgleich jetzt an allen Stellen an; diese Migration
-- holt nach, was bisher liegen geblieben ist.
--
-- Kuerzel muessen ueber Mitarbeiter UND Bauleiter hinweg eindeutig sein -
-- die App haelt sich daran, die Datenbank prueft es nur je Tabelle. Deshalb
-- werden sie hier in Schleifen vergeben statt in einem INSERT ... SELECT.

DO $$
DECLARE
  person   RECORD;
  basis    TEXT;
  kandidat TEXT;
  lauf     INT;
  neue_id  TEXT;
BEGIN
  -- 1. Die vier Bauleiter muessen in der Mitarbeiterliste stehen, sonst kann
  --    dort niemand ihre Faehigkeiten pflegen. Philipp ist bereits da.
  FOR person IN
    SELECT * FROM (VALUES
      ('Marlon',  'Tschon'),
      ('Carsten', 'Reuter'),
      ('Gerhard', 'Pettkat')
    ) AS v("firstName", "lastName")
    WHERE NOT EXISTS (
      SELECT 1 FROM "employees" e
       WHERE e."firstName" = v."firstName" AND e."lastName" = v."lastName"
    )
  LOOP
    basis    := upper(left(person."firstName", 1) || left(person."lastName", 1));
    kandidat := basis;
    lauf     := 1;
    WHILE EXISTS (SELECT 1 FROM "employees"     WHERE "shortCode" = kandidat)
       OR EXISTS (SELECT 1 FROM "site_managers" WHERE "shortCode" = kandidat) LOOP
      lauf     := lauf + 1;
      kandidat := basis || lauf::text;
    END LOOP;

    INSERT INTO "employees" ("id", "firstName", "lastName", "shortCode", "active", "isDemo", "createdAt", "updatedAt")
    VALUES (
      md5(random()::text || clock_timestamp()::text || person."lastName"),
      person."firstName", person."lastName", kandidat, true, false, now(), now()
    );
  END LOOP;

  -- 2. Die Faehigkeit „Bauleitung" bei allen vieren setzen.
  INSERT INTO "employee_trades" ("employeeId", "tradeId")
  SELECT e."id", t."id"
    FROM "employees" e
    CROSS JOIN "trades" t
   WHERE lower(t."name") = 'bauleitung'
     AND (e."firstName", e."lastName") IN (
       ('Marlon', 'Tschon'), ('Carsten', 'Reuter'),
       ('Gerhard', 'Pettkat'), ('Philipp', 'Chama-Schmidt')
     )
  ON CONFLICT DO NOTHING;

  -- 3. Zu jedem aktiven Mitarbeiter mit dieser Faehigkeit einen Bauleiter
  --    anlegen - aber nur, wenn es ihn nicht laengst gibt. Gerhard Pettkat
  --    kommt aus dem ERP und ist bereits Bauleiter; er darf keine zweite
  --    Zeile bekommen.
  FOR person IN
    SELECT DISTINCT e."id", e."firstName", e."lastName", e."phone", e."erpId"
      FROM "employees" e
      JOIN "employee_trades" et ON et."employeeId" = e."id"
      JOIN "trades" t ON t."id" = et."tradeId" AND lower(t."name") = 'bauleitung'
     WHERE e."active"
       AND NOT EXISTS (
         SELECT 1 FROM "site_managers" m
          WHERE (m."firstName" = e."firstName" AND m."lastName" = e."lastName")
             OR (e."erpId" IS NOT NULL AND m."erpId" = e."erpId")
       )
  LOOP
    basis    := upper(left(person."firstName", 1) || left(person."lastName", 1));
    kandidat := basis;
    lauf     := 1;
    WHILE EXISTS (SELECT 1 FROM "employees"     WHERE "shortCode" = kandidat)
       OR EXISTS (SELECT 1 FROM "site_managers" WHERE "shortCode" = kandidat) LOOP
      lauf     := lauf + 1;
      kandidat := basis || lauf::text;
    END LOOP;

    neue_id := md5(random()::text || clock_timestamp()::text || person."id");
    INSERT INTO "site_managers" ("id", "erpId", "firstName", "lastName", "shortCode", "phone", "color", "active", "isDemo", "createdAt", "updatedAt")
    VALUES (
      neue_id, person."erpId", person."firstName", person."lastName",
      kandidat, person."phone", '#2563eb', true, false, now(), now()
    );
  END LOOP;
END $$;

-- 4. Stillgelegte Bauleiter, die die Faehigkeit tragen, wieder aktivieren.
UPDATE "site_managers" m
   SET "active" = true, "updatedAt" = now()
 WHERE NOT m."active"
   AND EXISTS (
     SELECT 1
       FROM "employees" e
       JOIN "employee_trades" et ON et."employeeId" = e."id"
       JOIN "trades" t ON t."id" = et."tradeId" AND lower(t."name") = 'bauleitung'
      WHERE e."active"
        AND e."firstName" = m."firstName" AND e."lastName" = m."lastName"
   );

-- 5. Benutzerkonten an ihren Bauleiter haengen. Davon haengt ab, welche
--    Baustellen in „Offene Punkte" als seine eigenen gelten.
UPDATE "users" u
   SET "siteManagerId" = m."id", "updatedAt" = now()
  FROM "site_managers" m
 WHERE u."siteManagerId" IS NULL
   AND m."firstName" = u."firstName" AND m."lastName" = u."lastName";
