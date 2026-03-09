-- Add shiftType column to DoctorSchedule with default 'AM'
ALTER TABLE "DoctorSchedule" ADD COLUMN "shiftType" TEXT NOT NULL DEFAULT 'AM';

-- Drop old unique constraint
ALTER TABLE "DoctorSchedule" DROP CONSTRAINT "DoctorSchedule_doctorId_branchId_date_key";

-- Add new unique constraint including shiftType
CREATE UNIQUE INDEX "DoctorSchedule_doctorId_branchId_date_shiftType_key" ON "DoctorSchedule"("doctorId", "branchId", "date", "shiftType");
