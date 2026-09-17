-- Warum ein Subunternehmer nicht nach "Das Programm" uebertragen wurde.
-- Ohne diese Spalte verschwindet ein fehlgeschlagener Uebertrag stillschweigend.
ALTER TABLE "subcontractors" ADD COLUMN "erpFehler" TEXT;
