-- Bauleiter gehoeren nicht in die Mitarbeiterliste.
--
-- Die vorige Migration hat Marlon Tschon, Carsten Reuter und Gerhard Pettkat
-- als Mitarbeiter angelegt, damit man dort ihre Faehigkeiten ankreuzen kann.
-- Das war der falsche Schluss: Die drei sind in „Das Programm" Projektleiter,
-- keine Mitarbeiter - der Abgleich hat ihren Bauleiter-Datensaetzen inzwischen
-- die ERP-Kennungen verpasst und sie damit bestaetigt. Sie stehen dort
-- richtig und in der Mitarbeiterliste falsch.
--
-- Entfernt werden deshalb nur Zeilen, die diese Migration selbst erzeugt
-- haben kann, und das muss alles zugleich zutreffen:
--   * keine ERP-Kennung (also nicht aus „Das Programm" uebernommen),
--   * keine Einsaetze (es geht keine Historie verloren),
--   * traegt ausschliesslich „Bauleitung" als Faehigkeit,
--   * es gibt bereits einen Bauleiter-Datensatz zu dieser Person.
-- Ein echter Mitarbeiter erfuellt das nicht. Philipp Chama-Schmidt kommt aus
-- „Das Programm" und behaelt seine Mitarbeiterzeile; dass er nicht mehr in
-- der Liste auftaucht, entscheidet die Anzeige, nicht die Datenbank.
DELETE FROM "employees" e
 WHERE e."erpId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM "assignments" a WHERE a."employeeId" = e."id")
   AND EXISTS (
     SELECT 1 FROM "employee_trades" et
       JOIN "trades" t ON t."id" = et."tradeId"
      WHERE et."employeeId" = e."id" AND lower(t."name") = 'bauleitung'
   )
   AND NOT EXISTS (
     SELECT 1 FROM "employee_trades" et
       JOIN "trades" t ON t."id" = et."tradeId"
      WHERE et."employeeId" = e."id" AND lower(t."name") <> 'bauleitung'
   )
   AND EXISTS (
     SELECT 1 FROM "site_managers" m
      WHERE m."firstName" = e."firstName" AND m."lastName" = e."lastName"
   );
