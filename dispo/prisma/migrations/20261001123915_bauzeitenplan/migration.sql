-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "scheduleUnit" TEXT NOT NULL DEFAULT 'WOCHE';

-- CreateTable
CREATE TABLE "schedule_phases" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tradeId" TEXT,
    "label" TEXT,
    "subcontractorId" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_phases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_phases_projectId_startDate_idx" ON "schedule_phases"("projectId", "startDate");

-- AddForeignKey
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_phases" ADD CONSTRAINT "schedule_phases_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
