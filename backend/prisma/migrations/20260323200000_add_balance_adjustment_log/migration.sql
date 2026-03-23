-- CreateTable
CREATE TABLE "BalanceAdjustmentLog" (
    "id" SERIAL NOT NULL,
    "patientId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceAdjustmentLog_patientId_idx" ON "BalanceAdjustmentLog"("patientId");

-- CreateIndex
CREATE INDEX "BalanceAdjustmentLog_createdById_idx" ON "BalanceAdjustmentLog"("createdById");

-- AddForeignKey
ALTER TABLE "BalanceAdjustmentLog" ADD CONSTRAINT "BalanceAdjustmentLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustmentLog" ADD CONSTRAINT "BalanceAdjustmentLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
