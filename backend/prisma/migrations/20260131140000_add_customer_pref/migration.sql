-- CreateTable
CREATE TABLE "CustomerPref" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "customerKey" TEXT,
    "deliveryType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CustomerPref_deliveryType_idx" ON "CustomerPref"("deliveryType");

-- CreateIndex
CREATE INDEX "CustomerPref_customerKey_idx" ON "CustomerPref"("customerKey");
