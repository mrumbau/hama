-- Was von Hand geaendert wurde, gewinnt gegen den Abgleich.
--
-- Bisher hat jeder Lauf den Firmennamen bedingungslos ueberschrieben: Wer
-- „Lechmann" zu „Lachmann" korrigiert hatte, fand nach dem naechsten
-- Abgleich wieder „Lechmann" vor. Telefon und Anschrift waren schon richtig
-- gebaut - sie fuellen nur Luecken. Der Name war die Ausnahme.
--
-- Hier merkt sich jeder Datensatz, welche Felder ein Mensch gesetzt hat.
-- Der Abgleich laesst genau die in Ruhe und fuellt weiterhin alles andere.
ALTER TABLE "subcontractors" ADD COLUMN "manuelleFelder" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "employees"      ADD COLUMN "manuelleFelder" TEXT[] NOT NULL DEFAULT '{}';
