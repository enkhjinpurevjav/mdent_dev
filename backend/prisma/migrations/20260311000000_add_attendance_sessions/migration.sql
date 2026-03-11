-- AlterTable: Add geolocation fields to Branch
ALTER TABLE "Branch" ADD COLUMN "geoLat" DOUBLE PRECISION;
ALTER TABLE "Branch" ADD COLUMN "geoLng" DOUBLE PRECISION;
ALTER TABLE "Branch" ADD COLUMN "geoRadiusM" INTEGER NOT NULL DEFAULT 150;

-- CreateTable: AttendanceSession
CREATE TABLE "AttendanceSession" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION NOT NULL,
    "checkInLng" DOUBLE PRECISION NOT NULL,
    "checkInAccuracyM" INTEGER NOT NULL,
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutAccuracyM" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_userId_checkInAt_idx" ON "AttendanceSession"("userId", "checkInAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_branchId_checkInAt_idx" ON "AttendanceSession"("branchId", "checkInAt");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
