-- CreateTable
CREATE TABLE "Barter" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "limitAmount" INTEGER NOT NULL,
    "spentAmount" INTEGER NOT NULL DEFAULT 0,
    "remainingAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Barter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarterUsage" (
    "id" SERIAL NOT NULL,
    "barterId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "encounterId" INTEGER NOT NULL,
    "amountUsed" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "usedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarterUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barter_code_key" ON "Barter"("code");

-- CreateIndex
CREATE INDEX "BarterUsage_barterId_idx" ON "BarterUsage"("barterId");

-- CreateIndex
CREATE INDEX "BarterUsage_invoiceId_idx" ON "BarterUsage"("invoiceId");

-- CreateIndex
CREATE INDEX "BarterUsage_encounterId_idx" ON "BarterUsage"("encounterId");

-- CreateIndex
CREATE INDEX "BarterUsage_patientId_idx" ON "BarterUsage"("patientId");

-- AddForeignKey
ALTER TABLE "BarterUsage" ADD CONSTRAINT "BarterUsage_barterId_fkey" FOREIGN KEY ("barterId") REFERENCES "Barter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterUsage" ADD CONSTRAINT "BarterUsage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterUsage" ADD CONSTRAINT "BarterUsage_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarterUsage" ADD CONSTRAINT "BarterUsage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
