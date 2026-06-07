-- Concentration unit becomes experiment-global (chosen once at setup) instead of
-- per-standard. Add Experiment.unit, backfill it from existing standards, then
-- drop Standard.unit.

-- Add the experiment-global concentration unit (default µM).
ALTER TABLE "Experiment" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'µM';

-- Backfill each experiment's unit from its earliest standard's unit (standards
-- in an experiment always shared a unit) before dropping the per-standard column.
UPDATE "Experiment" e
SET "unit" = sub."unit"
FROM (
  SELECT DISTINCT ON ("experimentId") "experimentId", "unit"
  FROM "Standard"
  WHERE "unit" IS NOT NULL AND "unit" <> ''
  ORDER BY "experimentId", "createdAt" ASC
) sub
WHERE sub."experimentId" = e."id";

-- Drop the now-redundant per-standard unit.
ALTER TABLE "Standard" DROP COLUMN "unit";
