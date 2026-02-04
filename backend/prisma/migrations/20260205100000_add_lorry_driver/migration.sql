-- AlterTable
ALTER TABLE "Lorry" ADD COLUMN "driverId" TEXT;

-- CreateIndex
CREATE INDEX "Lorry_driverId_idx" ON "Lorry"("driverId");
