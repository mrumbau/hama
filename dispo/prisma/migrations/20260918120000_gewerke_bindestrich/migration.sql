-- Altlasten mit haengendem Bindestrich einsammeln.
--
-- „Bau- und Renovierungsarbeiten" zerfaellt beim Lesen zu „Bau-" und
-- „Renovierungsarbeiten". Der Leser schneidet den Bindestrich inzwischen ab,
-- aber was davor entstanden ist, steht noch da: „Parkett-" neben „Parkett",
-- „Putz-" neben „Putz". Zwei Kacheln fuer dasselbe Gewerk.
--
-- Zusammengefuehrt wird nur, wo es das saubere Gegenstueck schon gibt.
-- Sonst wird bloss der Bindestrich entfernt.

-- 1. Zuordnungen auf das saubere Gewerk umhaengen.
UPDATE "subcontractor_trades" st
   SET "tradeId" = sauber."id"
  FROM "trades" schmutzig
  JOIN "trades" sauber
    ON lower(sauber."name") = lower(rtrim(schmutzig."name", ' -–—'))
   AND sauber."id" <> schmutzig."id"
 WHERE st."tradeId" = schmutzig."id"
   AND schmutzig."name" ~ '[-–—]\s*$'
   -- Zuordnung nicht doppelt anlegen, der Primaerschluessel verbietet es.
   AND NOT EXISTS (
     SELECT 1 FROM "subcontractor_trades" x
      WHERE x."subcontractorId" = st."subcontractorId" AND x."tradeId" = sauber."id"
   );

UPDATE "employee_trades" et
   SET "tradeId" = sauber."id"
  FROM "trades" schmutzig
  JOIN "trades" sauber
    ON lower(sauber."name") = lower(rtrim(schmutzig."name", ' -–—'))
   AND sauber."id" <> schmutzig."id"
 WHERE et."tradeId" = schmutzig."id"
   AND schmutzig."name" ~ '[-–—]\s*$'
   AND NOT EXISTS (
     SELECT 1 FROM "employee_trades" x
      WHERE x."employeeId" = et."employeeId" AND x."tradeId" = sauber."id"
   );

-- 2. Was jetzt niemand mehr traegt und ein sauberes Gegenstueck hat, faellt weg.
DELETE FROM "trades" schmutzig
 WHERE schmutzig."name" ~ '[-–—]\s*$'
   AND EXISTS (
     SELECT 1 FROM "trades" sauber
      WHERE lower(sauber."name") = lower(rtrim(schmutzig."name", ' -–—'))
        AND sauber."id" <> schmutzig."id"
   )
   AND NOT EXISTS (SELECT 1 FROM "subcontractor_trades" st WHERE st."tradeId" = schmutzig."id")
   AND NOT EXISTS (SELECT 1 FROM "employee_trades" et WHERE et."tradeId" = schmutzig."id");

-- 3. Bleibt ein Bindestrich-Gewerk ohne Gegenstueck uebrig, wird es nur
--    sauber geschrieben - loeschen waere Datenverlust.
UPDATE "trades"
   SET "name" = rtrim("name", ' -–—'), "updatedAt" = now()
 WHERE "name" ~ '[-–—]\s*$'
   AND length(rtrim("name", ' -–—')) > 1
   AND NOT EXISTS (
     SELECT 1 FROM "trades" anderes
      WHERE lower(anderes."name") = lower(rtrim("trades"."name", ' -–—'))
        AND anderes."id" <> "trades"."id"
   );
