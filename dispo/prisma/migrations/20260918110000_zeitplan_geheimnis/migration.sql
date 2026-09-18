-- Ausweis fuer den Abgleich, der ohne Menschen laeuft.
--
-- Der Zeitplan weckt die App alle zehn Minuten ueber HTTP. Er hat keine
-- Sitzung, muss sich also anders ausweisen. Das Geheimnis erzeugt die
-- Datenbank selbst und behaelt es fuer sich: So steht es weder im
-- Repository noch in einem Chatverlauf, und es muss niemand von Hand
-- irgendwo eintragen.
--
-- Wer es ersetzen will, loescht die Zeile - beim naechsten Deployment
-- entsteht eine neue. Der Zeitplan liest sie bei jedem Lauf frisch.
INSERT INTO "settings" ("key", "value", "updatedAt")
-- gen_random_uuid() bringt Postgres selbst mit; gen_random_bytes() braucht
-- pgcrypto, das nicht in jeder Installation liegt. Zwei UUIDs ohne
-- Bindestriche sind 64 Zeichen und rund 240 zufaellige Bit - mehr als genug
-- fuer einen Ausweis, der nur einen Abgleich anstoesst.
SELECT 'cronToken',
       replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
       now()
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'cronToken');
