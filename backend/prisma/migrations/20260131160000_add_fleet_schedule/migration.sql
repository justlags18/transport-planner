-- CreateTable
CREATE TABLE "FleetSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lorryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    CONSTRAINT "FleetSchedule_lorryId_fkey" FOREIGN KEY ("lorryId") REFERENCES "Lorry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FleetSchedule_lorryId_idx" ON "FleetSchedule"("lorryId");

-- CreateIndex
CREATE INDEX "FleetSchedule_startAt_idx" ON "FleetSchedule"("startAt");
