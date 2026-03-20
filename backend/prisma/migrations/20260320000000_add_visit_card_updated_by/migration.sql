-- AlterTable
ALTER TABLE "VisitCard" ADD COLUMN "updatedById" INTEGER;

-- AddForeignKey
ALTER TABLE "VisitCard" ADD CONSTRAINT "VisitCard_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
