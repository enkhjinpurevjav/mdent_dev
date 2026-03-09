-- Add new values to the UserRole enum safely
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'sterilization';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'other';

-- Update admin@mdent.cloud to super_admin if it exists
UPDATE "User"
SET "role" = 'super_admin'::"UserRole"
WHERE "email" = 'admin@mdent.cloud'
  AND "role" = 'admin'::"UserRole";
