-- CreateEnum
CREATE TYPE "ExperimentMode" AS ENUM ('beerLambert');

-- CreateEnum
CREATE TYPE "ReferenceLight" AS ENUM ('fluorescent');

-- CreateEnum
CREATE TYPE "SpectrumOrientation" AS ENUM ('horizontal', 'vertical');

-- CreateEnum
CREATE TYPE "WorkflowStep" AS ENUM ('experimentSetup', 'cameraRoiSetup', 'calibration', 'blank', 'standards', 'absorbanceReview', 'unknown', 'results');

-- CreateEnum
CREATE TYPE "SpectralImageRole" AS ENUM ('calibration', 'blank', 'standard', 'unknown');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "image" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mode" "ExperimentMode" NOT NULL DEFAULT 'beerLambert',
    "lightType" "ReferenceLight" NOT NULL DEFAULT 'fluorescent',
    "currentStep" "WorkflowStep" NOT NULL DEFAULT 'experimentSetup',
    "joinToken" TEXT,
    "joinTokenExpires" TIMESTAMP(3),
    "pendingCapture" JSONB,
    "roi" JSONB,
    "orientation" "SpectrumOrientation" NOT NULL DEFAULT 'horizontal',
    "calibration" JSONB,
    "lambdaMax" DOUBLE PRECISION,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpectralImage" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "role" "SpectralImageRole" NOT NULL,
    "url" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intensityProfile" JSONB,

    CONSTRAINT "SpectralImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standard" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "concentration" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "imageId" TEXT,
    "absorbanceSpectrum" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Standard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unknown" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "imageId" TEXT,
    "absorbanceSpectrum" JSONB,
    "absorbanceAtLambdaMax" DOUBLE PRECISION,
    "determinedConcentration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unknown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_joinToken_key" ON "Experiment"("joinToken");

-- CreateIndex
CREATE INDEX "Experiment_userId_idx" ON "Experiment"("userId");

-- CreateIndex
CREATE INDEX "SpectralImage_experimentId_idx" ON "SpectralImage"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Standard_imageId_key" ON "Standard"("imageId");

-- CreateIndex
CREATE INDEX "Standard_experimentId_idx" ON "Standard"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Unknown_imageId_key" ON "Unknown"("imageId");

-- CreateIndex
CREATE INDEX "Unknown_experimentId_idx" ON "Unknown"("experimentId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpectralImage" ADD CONSTRAINT "SpectralImage_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standard" ADD CONSTRAINT "Standard_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standard" ADD CONSTRAINT "Standard_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "SpectralImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unknown" ADD CONSTRAINT "Unknown_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unknown" ADD CONSTRAINT "Unknown_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "SpectralImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
