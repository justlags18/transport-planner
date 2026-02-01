-- AlterTable
ALTER TABLE "Consignment" ADD COLUMN "deliveryLocationId" TEXT;

-- CreateIndex
CREATE INDEX "Consignment_deliveryLocationId_idx" ON "Consignment"("deliveryLocationId");
