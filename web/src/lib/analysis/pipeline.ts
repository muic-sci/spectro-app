/**
 * Decoder-agnostic capture pipeline — the per-role rules that turn an already
 * decoded raster into the numbers the app stores.
 *
 * These used to live inline in `analysis-client.ts` (browser). They are pure and
 * carry no decoder/canvas/IndexedDB dependency, so both consumers share them:
 *   - the live app  (`analysis-client.ts`, browser decode + canvas crop), and
 *   - headless runs (`lib/headless/`, sharp decode, no crop) — offline
 *     re-analysis of exported bundles.
 *
 * Keeping the role rules here is what makes "the same science, without a
 * browser" true rather than merely claimed: there is one definition of which
 * extraction method a role uses, which saturation threshold it gets, and how
 * calibration is fit for each reference light.
 */
// Import from the concrete modules (not ./index) so index.ts can re-export this
// module without creating an import cycle.
import { extractIntensityProfile, checkSaturation, DEFAULT_ROI } from "./image";
import { calibrateFromLampProfile, calibrateFromLaserProfiles } from "./calibration";
import { SpectralConstants } from "./constants";
import type { Calibration, DataPoint, RasterImage, Rect, SaturationResult } from "./types";

/**
 * Max-channel (equal sensitivity across colours) instead of luminance. The lamp
 * and the individual laser lines need it — luminance weights blue at 0.114 and
 * would hide the violet/blue lamp lines from the peak detector.
 */
export function maxChannelForRole(role: string): boolean {
  return role === "calibration" || role === "laser";
}

/**
 * Saturation threshold for a role, or undefined for the default (250). The
 * blank is I₀ — clipping there corrupts every absorbance, and phone tone
 * mapping rolls highlights off below 255, so it gets the stricter 230.
 */
export function saturationThresholdForRole(role: string): number | undefined {
  return role === "blank" ? SpectralConstants.saturationThresholdBlank : undefined;
}

export interface RoleExtractOptions {
  role: string;
  vertical: boolean;
  lineariseGamma?: boolean;
}

/** Extract a role's 1-D intensity profile from a decoded raster. */
export function extractRoleProfile(
  raster: RasterImage,
  roi: Rect | null,
  opts: RoleExtractOptions,
): DataPoint[] {
  return extractIntensityProfile(raster, roi ?? DEFAULT_ROI, {
    useMaxChannel: maxChannelForRole(opts.role),
    vertical: opts.vertical,
    lineariseGamma: opts.lineariseGamma ?? true,
  });
}

/** Saturation check for a role (applies that role's threshold). */
export function checkRoleSaturation(
  raster: RasterImage,
  roi: Rect | null,
  role: string,
): SaturationResult {
  return checkSaturation(raster, roi ?? DEFAULT_ROI, saturationThresholdForRole(role));
}

/** An image reduced to what calibration needs: its role, profile and (laser) wavelength. */
export interface ProfiledImage {
  role: string;
  points: DataPoint[];
  laserWavelength?: number | null;
}

/**
 * Fit pixel→wavelength from a set of already-profiled images, branching on the
 * reference light: `laser` pairs each laser line's dominant peak with its known
 * wavelength; anything else runs the collinearity search on the lamp profile.
 * Returns undefined when the inputs can't support a fit.
 */
export function calibrationFromProfiles(
  images: ProfiledImage[],
  lightType?: string,
): Calibration | undefined {
  if (lightType === "laser") {
    const channels = images
      .filter((r) => r.role === "laser" && typeof r.laserWavelength === "number" && r.points.length)
      .map((r) => ({ wavelength: r.laserWavelength as number, profile: r.points }));
    return channels.length >= 2 ? calibrateFromLaserProfiles(channels) : undefined;
  }
  const lamp = images.find((r) => r.role === "calibration");
  return lamp && lamp.points.length ? calibrateFromLampProfile(lamp.points) : undefined;
}
