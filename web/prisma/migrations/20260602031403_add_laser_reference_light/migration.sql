-- AlterEnum
ALTER TYPE "ReferenceLight" ADD VALUE 'laser';

-- AlterEnum
ALTER TYPE "SpectralImageRole" ADD VALUE 'laser';

-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN     "laserWavelengths" JSONB;

-- AlterTable
ALTER TABLE "SpectralImage" ADD COLUMN     "laserWavelength" DOUBLE PRECISION;
