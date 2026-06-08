/**
 * React hook: load an experiment from the browser store, run the derived
 * analysis, and expose a `reload()` the wizard/report pages call after any
 * mutation. Replaces the server component's Prisma fetch + `revalidatePath`.
 *
 * Loading state is *derived* (the loaded record is tagged with the id it was read
 * for), so the effect only ever calls setState asynchronously — never a
 * synchronous cascading render.
 */
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readExperiment } from "@/lib/store/experiments";
import { deriveAnalysis, type DerivedAnalysis } from "@/lib/experiment-analysis";
import type { Experiment } from "@/lib/domain-types";

export interface UseExperiment {
  experiment: Experiment | null;
  derived: DerivedAnalysis | null;
  loading: boolean;
  /** True once the load for the current id finished and found nothing. */
  notFound: boolean;
  reload: () => Promise<void>;
}

interface Loaded {
  forId: string | null;
  experiment: Experiment | null;
}

export function useExperiment(id: string | null): UseExperiment {
  const [data, setData] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    const exp = id ? (await readExperiment(id)) ?? null : null;
    setData({ forId: id, experiment: exp });
  }, [id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const exp = id ? (await readExperiment(id)) ?? null : null;
      if (active) setData({ forId: id, experiment: exp });
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Derived loading: the stored record must be for the *current* id.
  const fresh = data != null && data.forId === id;
  const experiment = fresh ? data!.experiment : null;
  const loading = !fresh;
  const notFound = fresh && experiment == null;

  const derived = useMemo<DerivedAnalysis | null>(() => {
    if (!experiment) return null;
    return deriveAnalysis({
      mode: experiment.mode,
      unit: experiment.unit,
      calibration: experiment.calibration,
      lambdaMaxOverride: experiment.lambdaMax,
      images: experiment.images,
      standards: experiment.standards,
      unknowns: experiment.unknowns,
    });
  }, [experiment]);

  return { experiment, derived, loading, notFound, reload: load };
}
