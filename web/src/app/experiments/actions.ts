"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/auth-helpers";
import { signOut } from "@/auth";
import {
  createExperiment,
  deleteExperiment,
  regenerateJoinToken,
} from "@/lib/experiments";
import { EXPERIMENT_MODES, LASER_CHANNELS, lightForMode, normalizeUnit } from "@/lib/experiment-meta";
import { SpectralConstants } from "@/lib/analysis";
import type { ExperimentMode } from "@/generated/prisma/enums";

const MODE_VALUES = new Set(EXPERIMENT_MODES.map((m) => m.value));

/** State returned to the L1 form (useActionState) on validation failure. */
export type NewExperimentState = {
  error?: string;
  values?: { name?: string };
};

/**
 * L1 — create an experiment from the setup form, then go to pairing (L2).
 * Returns a state object on validation error; on success it redirects (which
 * throws and never returns).
 */
export async function createExperimentAction(
  _prev: NewExperimentState,
  formData: FormData,
): Promise<NewExperimentState> {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Please name your experiment." };
  }
  if (name.length > 80) {
    return { error: "That name is a bit long — keep it under 80 characters.", values: { name } };
  }

  const modeRaw = String(formData.get("mode") ?? "");
  const mode = (MODE_VALUES.has(modeRaw as ExperimentMode)
    ? modeRaw
    : EXPERIMENT_MODES[0].value) as ExperimentMode;
  // The reference light is paired 1:1 with the mode (see lightForMode), so it's
  // no longer a separate form field — derive it from the chosen mode.
  const lightType = lightForMode(mode);

  // Concentration unit is global to the experiment, chosen once here.
  const unit = normalizeUnit(formData.get("unit"));

  let laserWavelengths: number[] | undefined;
  if (lightType === "laser") {
    const { visibleMin, visibleMax } = SpectralConstants;
    const parsed = LASER_CHANNELS.map((c) => Number(formData.get(`laser_${c.key}`)));
    if (!parsed.every((w) => Number.isFinite(w) && w >= visibleMin && w <= visibleMax)) {
      return {
        error: `Enter each laser's wavelength in nm (${visibleMin}–${visibleMax}).`,
        values: { name },
      };
    }
    laserWavelengths = parsed;
  }

  const experiment = await createExperiment({ userId, name, mode, lightType, unit, laserWavelengths });
  redirect(`/experiments/${experiment.id}/pair`);
}

/** L2 — mint a fresh join code (used when the current one has expired). */
export async function regenerateJoinTokenAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await regenerateJoinToken(id, userId);
  revalidatePath(`/experiments/${id}/pair`);
}

/** L0 — delete an experiment from the list. */
export async function deleteExperimentAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteExperiment(id, userId);
  revalidatePath("/experiments");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
