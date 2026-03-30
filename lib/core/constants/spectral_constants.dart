/// Constants used for spectral analysis and calibration.
class SpectralConstants {
  SpectralConstants._();

  /// Known fluorescent lamp emission wavelengths (in nm) used for
  /// pixel-to-wavelength calibration.
  static const List<double> fluorescentLampPeaks = [
    434.5, // Mercury blue-violet
    486.0, // Mercury cyan
    544.0, // Terbium green
    587.0, // Europium yellow
    611.5, // Europium orange-red
  ];

  /// Lower bound of the visible spectrum in nanometres.
  static const double visibleMin = 380.0;

  /// Upper bound of the visible spectrum in nanometres.
  static const double visibleMax = 750.0;

  /// Default window size for moving-average smoothing (must be odd).
  static const int defaultSmoothingWindow = 5;

  /// Smoothing window used specifically for calibration lamp peak detection.
  /// Larger than [defaultSmoothingWindow] to merge sub-peaks within the same
  /// broad emission band (e.g., the three closely-spaced green 544 nm peaks
  /// that JPEG compression can produce), while still resolving the five
  /// distinct fluorescent lines.
  static const int calibrationSmoothingWindow = 15;
}
