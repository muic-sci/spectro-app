/** Spectral constants — ported from mobile/lib/core/constants/spectral_constants.dart. */
export const SpectralConstants = {
  /** Known fluorescent-lamp emission wavelengths (nm) for pixel→λ calibration. */
  fluorescentLampPeaks: [
    434.5, // Mercury blue-violet
    486.0, // Mercury cyan
    544.0, // Terbium green
    587.0, // Europium yellow
    611.5, // Europium orange-red
  ] as const,

  /**
   * Default laser-reference wavelengths (nm) for the laser calibration light:
   * red / green / blue. Common cheap laser-diode lines; the user can edit them.
   */
  defaultLaserWavelengths: [650.0, 532.0, 405.0] as const,

  /** Lower / upper bounds of the visible spectrum (nm). */
  visibleMin: 380.0,
  visibleMax: 750.0,

  /** Default moving-average window (odd). */
  defaultSmoothingWindow: 5,

  /**
   * Larger window for calibration-lamp peak detection: merges JPEG sub-peaks
   * within one emission band while still resolving the five distinct lines.
   */
  calibrationSmoothingWindow: 15,

  /** A pixel is saturated when any channel is at/above this 8-bit value. */
  saturationThreshold: 250,

  /**
   * Stricter threshold for the BLANK capture (I₀). Phone tone mapping rolls
   * highlights off below 255, so a blank can be effectively clipped without any
   * pixel reaching 250 — and a clipped I₀ corrupts every absorbance computed
   * from it. Flag the blank while it still has headroom.
   */
  saturationThresholdBlank: 230,

  /**
   * Required dark margin on each end of the spectrum inside the ROI, as a
   * fraction of the box length along the dispersion axis (see roi-margins.ts).
   */
  roiDarkMarginLamp: 0.1,
  /** Laser lines are narrow — require more dark context per end. */
  roiDarkMarginLaser: 0.2,
  /**
   * Fluorescence (laser) mode also requires dark background ACROSS the strip:
   * this fraction of the box on EACH side along the cross axis (perpendicular
   * to dispersion). The emission band is faint — the box must keep dark rows
   * on both sides so a slight shift between shots never moves it off the box.
   */
  roiDarkMarginCross: 0.15,
} as const;
