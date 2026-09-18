-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('NEU', 'TERMINIERUNG_ERFORDERLICH', 'GEPLANT', 'BESTAETIGT', 'IN_AUSFUEHRUNG', 'UNTERBROCHEN', 'WARTEN_AUF_KUNDE', 'WARTEN_AUF_MATERIAL', 'WARTEN_AUF_SUB', 'FERTIG', 'ABNAHME', 'ERLEDIGT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('NIEDRIG', 'NORMAL', 'HOCH', 'KRITISCH');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('NICHT_ERFORDERLICH', 'OFFEN', 'TEILWEISE', 'VOLLSTAENDIG');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('OFFEN', 'ANGEFRAGT', 'BESTAETIGT', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "TrafficLight" AS ENUM ('GRUEN', 'GELB', 'ROT', 'GRAU');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('MITARBEITER', 'BAULEITER', 'SUBUNTERNEHMER', 'UNBESETZT');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('GEPLANT', 'BESTAETIGT', 'ABGESAGT', 'ERLEDIGT');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('MANUELL', 'DAS_PROGRAMM', 'TELEFON_3CX', 'OUTLOOK', 'AUTOMATISCH', 'SEED');

-- CreateEnum
CREATE TYPE "ChangeReason" AS ENUM ('KUNDE', 'MR_UMBAU', 'BAULEITER', 'MITARBEITER', 'SUBUNTERNEHMER', 'MATERIAL', 'LIEFERANT', 'KRANKHEIT', 'URLAUB', 'BAUSTELLENVORLEISTUNG', 'TECHNISCHE_URSACHE', 'WETTER', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('NEU', 'IN_PRUEFUNG', 'ERLEDIGT');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('EINGEHEND', 'AUSGEHEND', 'UNBEKANNT');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('TERMIN_AENDERUNG', 'STATUS_AENDERUNG', 'MATERIAL_AENDERUNG', 'KUNDENBESTAETIGUNG', 'RUECKRUF', 'NOTIZ', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('OFFEN', 'UEBERNOMMEN', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('EMPFANGEN', 'VERARBEITET', 'FEHLER', 'IGNORIERT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NIE_GELAUFEN', 'ERFOLGREICH', 'FEHLER', 'LAEUFT');

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_managers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563eb',
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "phone" TEXT,
    "profession" TEXT,
    "weeklyHours" INTEGER,
    "driversLicense" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_trades" (
    "employeeId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,

    CONSTRAINT "employee_trades_pkey" PRIMARY KEY ("employeeId","tradeId")
);

-- CreateTable
CREATE TABLE "subcontractors" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "crewSize" INTEGER,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_trades" (
    "subcontractorId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,

    CONSTRAINT "subcontractor_trades_pkey" PRIMARY KEY ("subcontractorId","tradeId")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "erpId" TEXT,
    "orderNumber" TEXT,
    "projectNumber" TEXT,
    "customerName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "street" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "primarySiteManagerId" TEXT,
    "secondarySiteManagerId" TEXT,
    "plannedStart" DATE,
    "plannedEnd" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'NEU',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "materialStatus" "MaterialStatus" NOT NULL DEFAULT 'OFFEN',
    "customerConfirmed" "ConfirmationStatus" NOT NULL DEFAULT 'OFFEN',
    "trafficLightOverride" "TrafficLight",
    "internalNotes" TEXT,
    "specialNotes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_notes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    "source" "Source" NOT NULL DEFAULT 'MANUELL',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "employeeId" TEXT,
    "siteManagerId" TEXT,
    "subcontractorId" TEXT,
    "placeholderLabel" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'GEPLANT',
    "source" "Source" NOT NULL DEFAULT 'MANUELL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'EINGEHEND',
    "callerNumber" TEXT,
    "calledNumber" TEXT,
    "contactNumber" TEXT,
    "durationSeconds" INTEGER,
    "callId" TEXT,
    "agentName" TEXT,
    "customerName" TEXT,
    "projectId" TEXT,
    "candidateProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transcript" TEXT,
    "summary" TEXT,
    "aiNotes" TEXT,
    "actionItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordingUrl" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'NEU',
    "source" "Source" NOT NULL DEFAULT 'TELEFON_3CX',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "communicationId" TEXT,
    "projectId" TEXT,
    "assignmentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "currentValue" JSONB,
    "proposedValue" JSONB,
    "reason" "ChangeReason" NOT NULL DEFAULT 'SONSTIGES',
    "reasonText" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OFFEN',
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "source" "Source" NOT NULL DEFAULT 'TELEFON_3CX',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" "Source" NOT NULL DEFAULT 'MANUELL',
    "reason" "ChangeReason",
    "reasonText" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warning_dismissals" (
    "id" TEXT NOT NULL,
    "warningKey" TEXT NOT NULL,
    "note" TEXT,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warning_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'NIE_GELAUFEN',
    "lastSyncAt" TIMESTAMP(3),
    "lastMessage" TEXT,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'EMPFANGEN',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "communicationId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "trades_name_key" ON "trades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "site_managers_shortCode_key" ON "site_managers"("shortCode");

-- CreateIndex
CREATE INDEX "site_managers_active_idx" ON "site_managers"("active");

-- CreateIndex
CREATE UNIQUE INDEX "employees_shortCode_key" ON "employees"("shortCode");

-- CreateIndex
CREATE INDEX "employees_active_idx" ON "employees"("active");

-- CreateIndex
CREATE INDEX "subcontractors_active_idx" ON "subcontractors"("active");

-- CreateIndex
CREATE UNIQUE INDEX "projects_erpId_key" ON "projects"("erpId");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_plannedStart_idx" ON "projects"("plannedStart");

-- CreateIndex
CREATE INDEX "projects_primarySiteManagerId_idx" ON "projects"("primarySiteManagerId");

-- CreateIndex
CREATE INDEX "project_notes_projectId_createdAt_idx" ON "project_notes"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "assignments_projectId_idx" ON "assignments"("projectId");

-- CreateIndex
CREATE INDEX "assignments_startDate_endDate_idx" ON "assignments"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "assignments_employeeId_startDate_idx" ON "assignments"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "assignments_subcontractorId_startDate_idx" ON "assignments"("subcontractorId", "startDate");

-- CreateIndex
CREATE INDEX "assignments_siteManagerId_startDate_idx" ON "assignments"("siteManagerId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "communications_callId_key" ON "communications"("callId");

-- CreateIndex
CREATE INDEX "communications_status_occurredAt_idx" ON "communications"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "communications_projectId_idx" ON "communications"("projectId");

-- CreateIndex
CREATE INDEX "change_requests_status_createdAt_idx" ON "change_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_createdAt_idx" ON "audit_log"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_projectId_createdAt_idx" ON "audit_log"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "warning_dismissals_warningKey_key" ON "warning_dismissals"("warningKey");

-- CreateIndex
CREATE UNIQUE INDEX "sync_state_provider_key" ON "sync_state"("provider");

-- CreateIndex
CREATE INDEX "integration_events_provider_receivedAt_idx" ON "integration_events"("provider", "receivedAt");

-- AddForeignKey
ALTER TABLE "employee_trades" ADD CONSTRAINT "employee_trades_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_trades" ADD CONSTRAINT "employee_trades_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_trades" ADD CONSTRAINT "subcontractor_trades_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_trades" ADD CONSTRAINT "subcontractor_trades_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_primarySiteManagerId_fkey" FOREIGN KEY ("primarySiteManagerId") REFERENCES "site_managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_secondarySiteManagerId_fkey" FOREIGN KEY ("secondarySiteManagerId") REFERENCES "site_managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_siteManagerId_fkey" FOREIGN KEY ("siteManagerId") REFERENCES "site_managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
