-- Stabile IDs aus "Das Programm" auf Personen und Subunternehmern.
-- Ohne sie laeuft der Abgleich ueber den Namen und bricht, sobald dort
-- jemand einen Tippfehler korrigiert oder heiratet.
ALTER TABLE "employees" ADD COLUMN "erpId" TEXT;
ALTER TABLE "site_managers" ADD COLUMN "erpId" TEXT;
ALTER TABLE "subcontractors" ADD COLUMN "erpId" TEXT;

CREATE UNIQUE INDEX "employees_erpId_key" ON "employees"("erpId");
CREATE UNIQUE INDEX "site_managers_erpId_key" ON "site_managers"("erpId");
CREATE UNIQUE INDEX "subcontractors_erpId_key" ON "subcontractors"("erpId");
