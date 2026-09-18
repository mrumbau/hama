-- Urlaub und Krank als feste Zeilen der Plantafel.
--
-- Abwesenheit ist kein eigenes Datenmodell, sondern dasselbe wie ein
-- Einsatz: Die Person ist an diesen Tagen belegt. Genau das will man auf
-- der Tafel sehen - wer im Urlaub ist, ist nicht verplanbar, und die App
-- soll ihn beim Doppelbelegen genauso anmeckern wie bei zwei Baustellen.
--
-- Deshalb zwei weitere feste Eintraege statt einer neuen Tabelle. Man zieht
-- den Monteur in die Zeile „Urlaub" und die Kante ueber zwei Wochen - fertig.
-- Was fuer Lager und Besorgungsfahrten gilt, gilt auch hier: nicht
-- loeschbar, nicht umbenennbar, nur Notizen.
INSERT INTO "projects" ("id", "internKey", "customerName", "name", "status", "priority",
                        "materialStatus", "customerConfirmed", "isDemo", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || v.schluessel),
  v.schluessel, 'MR Umbau (intern)', v.bezeichnung,
  'IN_AUSFUEHRUNG'::"ProjectStatus", 'NORMAL'::"Priority",
  'NICHT_ERFORDERLICH'::"MaterialStatus", 'BESTAETIGT'::"ConfirmationStatus",
  false, now(), now()
FROM (VALUES
  ('URLAUB', 'Urlaub'),
  ('KRANK',  'Krank / Abwesend')
) AS v(schluessel, bezeichnung)
WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."internKey" = v.schluessel);
