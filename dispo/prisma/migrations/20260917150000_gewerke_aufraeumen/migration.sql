-- Gewerke von der SUB-Kennzeichnung befreien.
--
-- In "Das Programm" steht die Taetigkeit als
--   "Taetigkeit: Subunternehmer - Trockenbau und Innenausbau"
-- Das Wort "Subunternehmer" ist die Kennzeichnung, nicht das Gewerk. Unbesehen
-- uebernommen entstehen daraus Faehigkeiten wie "Subunternehmer - Trockenbau",
-- die in den Stammdaten nichts zu suchen haben. Hier werden sie auf das
-- eigentliche Gewerk zurueckgefuehrt und mit einem vorhandenen zusammengelegt.

-- 1) Zielnamen bestimmen und fehlende Gewerke anlegen.
CREATE TEMP TABLE gewerk_umzug AS
SELECT
  t."id" AS alt_id,
  t."name" AS alt_name,
  NULLIF(
    regexp_replace(
      regexp_replace(t."name", '^\s*(sub|subunternehmer|subunternehmen|nachunternehmer)\s*[–—:-]\s*', '', 'i'),
      '[\s–—-]+$', ''
    ),
    ''
  ) AS neu_name
FROM "trades" t
WHERE t."name" ~* '^\s*(sub|subunternehmer|subunternehmen|nachunternehmer)\s*[–—:-]';

INSERT INTO "trades" ("id", "name", "color", "sortOrder", "createdAt", "updatedAt")
SELECT DISTINCT ON (u.neu_name)
  md5(random()::text || clock_timestamp()::text), u.neu_name, '#64748b', 100, now(), now()
FROM gewerk_umzug u
WHERE u.neu_name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "trades" z WHERE lower(z."name") = lower(u.neu_name));

-- 2) Zuordnungen umhaengen (Duplikate verwerfen).
INSERT INTO "subcontractor_trades" ("subcontractorId", "tradeId")
SELECT DISTINCT st."subcontractorId", z."id"
FROM "subcontractor_trades" st
JOIN gewerk_umzug u ON u.alt_id = st."tradeId"
JOIN "trades" z ON lower(z."name") = lower(u.neu_name)
WHERE u.neu_name IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "employee_trades" ("employeeId", "tradeId")
SELECT DISTINCT et."employeeId", z."id"
FROM "employee_trades" et
JOIN gewerk_umzug u ON u.alt_id = et."tradeId"
JOIN "trades" z ON lower(z."name") = lower(u.neu_name)
WHERE u.neu_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3) Die verunreinigten Gewerke entfernen (Zuordnungen haengen per Cascade).
DELETE FROM "trades" t USING gewerk_umzug u WHERE t."id" = u.alt_id;

DROP TABLE gewerk_umzug;

-- 4) Steuernde Faehigkeiten sicherstellen.
--    "Buero" blendet eine Person von der Plantafel aus, "Bauleitung" stellt
--    sie zu den Bauleitern.
INSERT INTO "trades" ("id", "name", "color", "sortOrder", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), v.name, v.color, v.reihenfolge, now(), now()
FROM (VALUES ('Büro', '#94a3b8', 900), ('Bauleitung', '#7c3aed', 1)) AS v(name, color, reihenfolge)
WHERE NOT EXISTS (SELECT 1 FROM "trades" z WHERE lower(z."name") = lower(v.name));
