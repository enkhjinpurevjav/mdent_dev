-- AlterTable: add imagingPct to DoctorCommissionConfig
ALTER TABLE "DoctorCommissionConfig" ADD COLUMN "imagingPct" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable: add meta to InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN "meta" JSONB;

-- CreateTable: NurseCommissionConfig
CREATE TABLE "NurseCommissionConfig" (
    "id" SERIAL NOT NULL,
    "nurseId" INTEGER NOT NULL,
    "imagingPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NurseCommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NurseCommissionConfig_nurseId_key" ON "NurseCommissionConfig"("nurseId");

-- CreateIndex
CREATE INDEX "NurseCommissionConfig_nurseId_idx" ON "NurseCommissionConfig"("nurseId");

-- AddForeignKey
ALTER TABLE "NurseCommissionConfig" ADD CONSTRAINT "NurseCommissionConfig_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
