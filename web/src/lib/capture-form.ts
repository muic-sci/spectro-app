/**
 * Capture/re-extract persistence from a multipart FormData (server-only).
 *
 * This is the shared body behind BOTH transports:
 *   - the Route Handlers `POST /api/experiments/[id]/capture` + `/reextract`
 *     (what the browser actually calls — a plain `fetch`), and
 *   - the legacy Server Actions in app/experiments/[id]/actions.ts (kept as a
 *     deploy-skew fallback).
 *
 * Why the browser uploads via a Route Handler, not a Server Action: the large
 * multipart upload (full JPEG + ROI crop + packed JSON profile/calibration) is a
 * React Server *Function* invocation, and Cloudflare's managed WAF rule for
 * CVE-2025-55183 ("React — Leaking Server Functions") false-positives on it and
 * 403s the request at the edge. A Route Handler is an ordinary HTTP endpoint
 * (no `Next-Action` header, no RSC-encoded arguments), so that rule does not
 * apply. Our React/Next are already past the CVE fix (react ≥ 19.2.4; Next 16
 * bundles a 2026 RSC runtime) — this is purely to stop tripping the edge rule,
 * and it also gives us real HTTP status codes + proper error surfacing.
 */
import "server-only";
import { revalidatePath } from "next/cache";
import { getExperiment } from "@/lib/experiments";
import { persistClientCapture, persistClientReextract } from "@/lib/capture";
import { parseCalibration } from "@/lib/experiment-json";
import { decodeProfile } from "@/lib/profile-codec";
import { publish } from "@/lib/realtime";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Calibration, DataPoint, SaturationResult } from "@/lib/analysis";
import type { SpectralImageRole } from "@/generated/prisma/enums";

/** Result returned to the capture controls. */
export type CaptureState = {
  ok?: boolean;
  error?: string;
  /** % of ROI pixels saturated (for the non-blocking warning). */
  saturatedPct?: number;
  /** Short success note, e.g. the calibration R². */
  note?: string;
};

/** Safely JSON.parse a FormData field, returning null on absence/parse error. */
function safeJson(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string" || v.length === 0) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

const CAPTURE_ROLES: SpectralImageRole[] = ["calibration", "blank", "standard", "unknown", "laser"];

/**
 * Persist a capture the browser already analysed (analysis-client). The full
 * image, the ROI crop, the profile, the saturation check and (for the lamp) the
 * calibration all come from the client — the server only stores them. No sharp
 * decode here. `userId` is resolved by the caller (route handler / action).
 */
export async function persistCaptureForm(formData: FormData, userId: string): Promise<CaptureState> {
  const t0 = Date.now();
  const fileField = formData.get("file");
  const fileSize = fileField instanceof File ? fileField.size : -1;
  console.log("[persistCapture] enter", {
    role: formData.get("role"),
    fileSize,
    hasCrop: formData.get("crop") instanceof File,
    profileLen: typeof formData.get("profile") === "string" ? String(formData.get("profile")).length : 0,
  });
  const id = String(formData.get("experimentId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  if (!CAPTURE_ROLES.includes(roleRaw as SpectralImageRole)) {
    return { error: "Unknown capture type." };
  }
  const role = roleRaw as SpectralImageRole;

  const experiment = await getExperiment(id, userId);
  if (!experiment) return { error: "Experiment not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "That file doesn't look like an image." };
  }

  let concentration: number | undefined;
  let unit: string | undefined;
  if (role === "standard") {
    concentration = Number(formData.get("concentration"));
    unit = String(formData.get("unit") ?? "").trim() || undefined;
    if (!Number.isFinite(concentration) || concentration <= 0) {
      return { error: "Enter the standard's concentration first." };
    }
  }

  // The browser sends the profile in the compact packed form (profile-codec);
  // decodeProfile also accepts a legacy {x,y}[] array across deploy skew.
  const profile = decodeProfile(safeJson(formData.get("profile")));
  if (!profile || profile.length === 0) {
    return { error: "Couldn't read the analysed profile — check the ROI and retry." };
  }

  const parsedSat = safeJson(formData.get("saturation")) as SaturationResult | null;
  const saturation: SaturationResult = parsedSat ?? {
    saturatedCount: 0,
    totalCount: 0,
    threshold: 250,
    fraction: 0,
    isSaturated: false,
  };

  const calibration: Calibration | undefined =
    role === "calibration" ? parseCalibration(safeJson(formData.get("calibration"))) ?? undefined : undefined;

  // For a laser line capture: which known wavelength (nm) it is for.
  let laserWavelength: number | undefined;
  if (role === "laser") {
    const w = Number(formData.get("laserWavelength"));
    if (!Number.isFinite(w) || w <= 0) {
      return { error: "Missing the laser's wavelength." };
    }
    laserWavelength = w;
  }

  const cropField = formData.get("crop");
  const cropBytes =
    cropField instanceof File && cropField.size > 0
      ? Buffer.from(await cropField.arrayBuffer())
      : undefined;

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    console.log("[persistCapture] read bytes, storing", { ms: Date.now() - t0, bytes: bytes.length });
    const res = await persistClientCapture({
      experimentId: id,
      role,
      bytes,
      profile,
      saturation,
      calibration,
      cropBytes,
      concentration,
      unit,
      laserWavelength,
    });
    const saturatedPct = saturation.fraction * 100;
    publish(id, { type: "captured", data: { role, saturatedPct } });
    revalidatePath(`/experiments/${id}`);
    console.log("[persistCapture] done", { ms: Date.now() - t0, imageId: res.imageId });
    return {
      ok: true,
      saturatedPct,
      note: res.calibration ? `Fit R² ${res.calibration.rSquared.toFixed(3)}` : undefined,
    };
  } catch (e) {
    console.error("[persistCapture] FAILED", { ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    return { error: e instanceof Error ? e.message : "Couldn't save that image." };
  }
}

/**
 * Commit a browser re-extraction (analysis-client.reextractAll) after the ROI or
 * orientation changed: store the new ROI/orientation, the re-extracted profiles,
 * the new ROI crops and the recomputed calibration. `userId` is resolved by the
 * caller. Returns { ok } so the route handler can report success.
 */
export async function persistReextractForm(
  formData: FormData,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get("experimentId") ?? "");
  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    select: { id: true, orientation: true, images: { select: { id: true } } },
  });
  if (!experiment) return { ok: false, error: "Experiment not found." };

  // ROI (full → null default, else the drawn box).
  let roi: Prisma.InputJsonValue | typeof Prisma.DbNull;
  if (formData.get("mode") === "full") {
    roi = Prisma.DbNull;
  } else {
    const left = Number(formData.get("left"));
    const top = Number(formData.get("top"));
    const width = Number(formData.get("width"));
    const height = Number(formData.get("height"));
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return { ok: false, error: "Invalid region." }; // leave unchanged
    }
    roi = { left, top, width, height };
  }

  const orientationRaw = String(formData.get("orientation") ?? "");
  const orientation =
    orientationRaw === "horizontal" || orientationRaw === "vertical"
      ? orientationRaw
      : experiment.orientation;

  await prisma.experiment.updateMany({ where: { id, userId }, data: { roi, orientation } });

  // Browser-computed profiles + crops, scoped to images that belong here.
  const known = new Set(experiment.images.map((im) => im.id));
  const rawProfiles = safeJson(formData.get("profiles"));
  const profiles = Array.isArray(rawProfiles)
    ? rawProfiles
        .map((entry) => {
          const p = entry as { imageId?: unknown; profile?: unknown; points?: unknown };
          if (typeof p.imageId !== "string" || !known.has(p.imageId)) return null;
          // New packed form (p.profile); decodeProfile also accepts legacy p.points.
          const points = decodeProfile(p.profile ?? p.points);
          return points ? { imageId: p.imageId, points } : null;
        })
        .filter((p): p is { imageId: string; points: DataPoint[] } => p !== null)
    : [];

  const crops: { imageId: string; bytes: Buffer }[] = [];
  for (const imageId of known) {
    const f = formData.get(`crop_${imageId}`);
    if (f instanceof File && f.size > 0) {
      crops.push({ imageId, bytes: Buffer.from(await f.arrayBuffer()) });
    }
  }

  const calibration = parseCalibration(safeJson(formData.get("calibration"))) ?? undefined;

  await persistClientReextract({ experimentId: id, profiles, crops, calibration });
  publish(id, { type: "captured" });
  revalidatePath(`/experiments/${id}`);
  return { ok: true };
}
