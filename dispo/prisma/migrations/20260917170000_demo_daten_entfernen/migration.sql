-- Demo-Daten entfernen und die Markierung geradeziehen.
--
-- Die Markierung "isDemo" war in BEIDE Richtungen falsch geworden:
--
--   * Luigi Curatolo stand als Demo drin, traegt aber laengst eine echte
--     ID aus "Das Programm" - der Abgleich hatte ihn uebernommen, ohne die
--     alte Markierung zu loeschen. Ihn zu entfernen waere Datenverlust.
--   * Gerhard Pettkat war nicht als Demo markiert, traegt aber die ID "E-4"
--     aus dem Testbetrieb - ein Ueberbleibsel, das niemand braucht.
--
-- Verlaesslich ist nur die Herkunft: Echte IDs aus "Das Programm" sind
-- UUIDs. Alles andere (E-4, DP-10047, L-70301) stammt aus dem Mock.

-- 1) Was die echte Schnittstelle besitzt, ist keine Demo.
UPDATE "projects"       SET "isDemo" = false WHERE "erpId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "employees"      SET "isDemo" = false WHERE "erpId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "site_managers"  SET "isDemo" = false WHERE "erpId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "subcontractors" SET "isDemo" = false WHERE "erpId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- 2) Was eine Testbetriebs-ID traegt, ist Demo.
UPDATE "projects"       SET "isDemo" = true WHERE "erpId" IS NOT NULL AND "erpId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "employees"      SET "isDemo" = true WHERE "erpId" IS NOT NULL AND "erpId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "site_managers"  SET "isDemo" = true WHERE "erpId" IS NOT NULL AND "erpId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
UPDATE "subcontractors" SET "isDemo" = true WHERE "erpId" IS NOT NULL AND "erpId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- 3) Entfernen. Erst, was auf anderes zeigt, dann die Stammdaten.
DELETE FROM "assignments" WHERE "projectId" IN (SELECT "id" FROM "projects" WHERE "isDemo");
DELETE FROM "assignments" WHERE "employeeId"      IN (SELECT "id" FROM "employees"      WHERE "isDemo");
DELETE FROM "assignments" WHERE "siteManagerId"   IN (SELECT "id" FROM "site_managers"  WHERE "isDemo");
DELETE FROM "assignments" WHERE "subcontractorId" IN (SELECT "id" FROM "subcontractors" WHERE "isDemo");

DELETE FROM "communications"   WHERE "isDemo" OR "projectId" IN (SELECT "id" FROM "projects" WHERE "isDemo");
DELETE FROM "change_requests"  WHERE "projectId" IN (SELECT "id" FROM "projects" WHERE "isDemo");
DELETE FROM "project_notes"    WHERE "projectId" IN (SELECT "id" FROM "projects" WHERE "isDemo");

DELETE FROM "projects"       WHERE "isDemo";
DELETE FROM "employees"      WHERE "isDemo";
DELETE FROM "site_managers"  WHERE "isDemo";
DELETE FROM "subcontractors" WHERE "isDemo";
