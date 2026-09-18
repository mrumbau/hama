-- Planvorschlaege: Bauleiter planen, die Leitung gibt frei.
--
-- Die Ressourcen sind begrenzt. Wer sie verteilt, muss einer sein - aber
-- die Bauleiter sollen trotzdem drei, vier Wochen vorausplanen koennen,
-- ohne auf das woechentliche Treffen zu warten. Beides geht, wenn ihre
-- Planung sichtbar als Vorschlag danebensteht statt als Zusage.
--
-- Dafuer braucht es dreierlei:
--   * einen Status "VORSCHLAG", der sich auf einen Blick unterscheidet,
--   * die Herkunft ("wer hat das angelegt?") - das konnte die App bisher
--     gar nicht beantworten, und ohne sie koennte ein Bauleiter fremde
--     Vorschlaege umbauen,
--   * einen Grund bei der Ablehnung, sonst kommt derselbe Vorschlag
--     naechste Woche wieder.
ALTER TYPE "AssignmentStatus" ADD VALUE IF NOT EXISTS 'VORSCHLAG' BEFORE 'GEPLANT';

ALTER TABLE "assignments" ADD COLUMN "createdById" TEXT;
ALTER TABLE "assignments" ADD COLUMN "ablehnungsgrund" TEXT;

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "assignments_status_createdById_idx" ON "assignments"("status", "createdById");
