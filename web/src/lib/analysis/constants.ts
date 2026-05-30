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
} as const;
