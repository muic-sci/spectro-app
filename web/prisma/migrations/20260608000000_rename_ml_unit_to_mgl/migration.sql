-- "mL" is a volume, not a concentration — the intended unit was "mg/L".
-- Rename it in any existing experiments (the value is a free-text column, so a
-- data update is all that's needed; no schema change).
UPDATE "Experiment" SET "unit" = 'mg/L' WHERE "unit" = 'mL';
