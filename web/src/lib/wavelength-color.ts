/**
 * Convert a wavelength (nm) to a CSS rgb() string — used to tint the calibration
 * peak markers so each emission line's dash matches its real colour.
 *
 * Uses the *standard* path: CIE 1931 2° colour-matching functions → XYZ → linear
 * sRGB (D65) → gamut-clamp → normalise to full brightness → sRGB gamma. The CMFs
 * are Wyman, Sloan & Shirley's (JCGT 2013) analytic multi-lobe approximation, so
 * no big lookup table is needed. This is far more faithful than the common
 * Bruton piecewise hack — e.g. a pure 611 nm line is outside the sRGB gamut and
 * correctly clamps to red (the Bruton version rendered it amber).
 */

/** Asymmetric ("piecewise") Gaussian lobe: different inverse-widths each side of μ. */
function lobe(x: number, mu: number, invSigmaLeft: number, invSigmaRight: number): number {
  const t = (x - mu) * (x < mu ? invSigmaLeft : invSigmaRight);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 X̄/Ȳ/Z̄ at a wavelength (Wyman/Sloan/Shirley analytic approximation). */
function cieXYZ(nm: number): [number, number, number] {
  const x =
    0.362 * lobe(nm, 442.0, 0.0624, 0.0374) +
    1.056 * lobe(nm, 599.8, 0.0264, 0.0323) -
    0.065 * lobe(nm, 501.1, 0.049, 0.0382);
  const y =
    0.821 * lobe(nm, 568.8, 0.0213, 0.0247) + 0.286 * lobe(nm, 530.9, 0.0613, 0.0322);
  const z =
    1.217 * lobe(nm, 437.0, 0.0845, 0.0278) + 0.681 * lobe(nm, 459.0, 0.0385, 0.0725);
  return [x, y, z];
}

/** Linear-light channel → 8-bit sRGB (gamma encode). */
function encode(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function wavelengthToRgb(nm: number): string {
  const [x, y, z] = cieXYZ(nm);

  // XYZ → linear sRGB (D65).
  let r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  let b = 0.0557 * x - 0.204 * y + 1.057 * z;

  // Out-of-gamut spectral colours have negative channels — clamp to 0, then
  // normalise so the brightest channel is full (a saturated, vivid hue).
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const max = Math.max(r, g, b);
  if (max > 0) {
    r /= max;
    g /= max;
    b /= max;
  }

  return `rgb(${encode(r)}, ${encode(g)}, ${encode(b)})`;
}
