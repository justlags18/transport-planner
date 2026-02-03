-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN "postcode" TEXT;

-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN "lat" REAL;

-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN "lng" REAL;

-- AlterTable
ALTER TABLE "DeliveryLocation" ADD COLUMN "geoUpdatedAt" DATETIME;

-- CreateIndex
CREATE INDEX "DeliveryLocation_postcode_idx" ON "DeliveryLocation"("postcode");
