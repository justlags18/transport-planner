-- CreateTable
CREATE TABLE "DeliveryLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "destinationKey" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerPrefDeliveryLocation" (
    "customerPrefId" TEXT NOT NULL,
    "deliveryLocationId" TEXT NOT NULL,

    PRIMARY KEY ("customerPrefId", "deliveryLocationId"),
    CONSTRAINT "CustomerPrefDeliveryLocation_customerPrefId_fkey" FOREIGN KEY ("customerPrefId") REFERENCES "CustomerPref" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerPrefDeliveryLocation_deliveryLocationId_fkey" FOREIGN KEY ("deliveryLocationId") REFERENCES "DeliveryLocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeliveryLocation_destinationKey_idx" ON "DeliveryLocation"("destinationKey");

-- CreateIndex
CREATE INDEX "CustomerPrefDeliveryLocation_deliveryLocationId_idx" ON "CustomerPrefDeliveryLocation"("deliveryLocationId");
