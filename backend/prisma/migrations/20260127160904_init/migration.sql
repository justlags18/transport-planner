-- CreateTable
CREATE TABLE "Consignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerNameRaw" TEXT,
    "customerKey" TEXT,
    "destinationRaw" TEXT,
    "destinationKey" TEXT,
    "etaIso" TEXT,
    "status" TEXT,
    "palletsFromSite" INTEGER,
    "rawJson" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Lorry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "capacityPallets" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lorryId" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "Assignment_lorryId_fkey" FOREIGN KEY ("lorryId") REFERENCES "Lorry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PalletOverride" (
    "consignmentId" TEXT NOT NULL PRIMARY KEY,
    "pallets" INTEGER NOT NULL,
    CONSTRAINT "PalletOverride_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "customerKey" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "defaultPallets" INTEGER NOT NULL,
    "emailTo" TEXT,
    "emailTemplateSubject" TEXT,
    "emailTemplateBody" TEXT
);

-- CreateIndex
CREATE INDEX "Consignment_customerKey_idx" ON "Consignment"("customerKey");

-- CreateIndex
CREATE INDEX "Consignment_destinationKey_idx" ON "Consignment"("destinationKey");

-- CreateIndex
CREATE INDEX "Consignment_status_idx" ON "Consignment"("status");

-- CreateIndex
CREATE INDEX "Consignment_lastSeenAt_idx" ON "Consignment"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Lorry_name_idx" ON "Lorry"("name");

-- CreateIndex
CREATE INDEX "Assignment_lorryId_idx" ON "Assignment"("lorryId");

-- CreateIndex
CREATE INDEX "Assignment_consignmentId_idx" ON "Assignment"("consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_lorryId_consignmentId_key" ON "Assignment"("lorryId", "consignmentId");
