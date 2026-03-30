-- AlterEnum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'xray'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'xray';
  END IF;
END$$;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledByUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
