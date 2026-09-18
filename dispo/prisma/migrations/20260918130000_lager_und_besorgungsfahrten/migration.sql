-- Zwei feste Eintraege auf der Plantafel: Lager und Besorgungsfahrten.
--
-- Beides sind keine Baustellen und stehen nicht in „Das Programm". Es sind
-- Orte, an denen die eigenen Leute Zeit verbringen: das Lager als interner
-- Arbeitsort, die Besorgungsfahrten als Sammelposten fuer „wer holt was".
-- Wer sie mitplanen kann, sieht auf einen Blick, wer wirklich frei ist.
--
-- Sie duerfen nicht geloescht und nicht umbenannt werden - deshalb tragen
-- sie einen festen Schluessel, an dem die App sie erkennt, statt sich auf
-- ihren Namen zu verlassen.
ALTER TABLE "projects" ADD COLUMN "internKey" TEXT;
CREATE UNIQUE INDEX "projects_internKey_key" ON "projects"("internKey");

INSERT INTO "projects" ("id", "internKey", "customerName", "name", "status", "priority",
                        "materialStatus", "customerConfirmed", "isDemo", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || v.schluessel),
  v.schluessel, 'MR Umbau (intern)', v.bezeichnung,
  'IN_AUSFUEHRUNG'::"ProjectStatus", 'NORMAL'::"Priority",
  'VOLLSTAENDIG'::"MaterialStatus", 'BESTAETIGT'::"ConfirmationStatus",
  false, now(), now()
FROM (VALUES
  ('LAGER',     'Lager'),
  ('BESORGUNG', 'Besorgungsfahrten')
) AS v(schluessel, bezeichnung)
WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."internKey" = v.schluessel);
