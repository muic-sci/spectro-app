import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:image/image.dart' as img;

import '../../data/models/project.dart';

// ── Gamma correction ──────────────────────────────────────────────────────────

/// Converts a single 8-bit sRGB channel value (0–255) to a linearised light
/// value in the same 0–255 range using the standard sRGB piecewise formula.
///
/// Smartphone cameras store JPEG images in the sRGB colour space, where the
/// encoded value is **not** proportional to the number of photons captured —
/// it has been gamma-encoded (~2.2) to distribute precision toward darker
/// tones in a way that matches human perception. For spectrophotometry we need
/// a *linear* response (double the photons → double the value), so we must
/// undo this encoding before using pixel values as a proxy for intensity.
double _srgbToLinear(int c8bit) {
  final norm = c8bit / 255.0;
  final linear = norm <= 0.04045
      ? norm / 12.92
      : math.pow((norm + 0.055) / 1.055, 2.4).toDouble();
  return linear * 255.0;
}

// ── Intensity profile ─────────────────────────────────────────────────────────

/// Extracts a one-dimensional intensity profile from [imageBytes] within [roi].
///
/// For each column *x* inside the ROI, the grey-level values across the ROI
/// height are averaged using one of two methods:
///
/// * **Luminance** (default, [useMaxChannel] = `false`): `0.299 R + 0.587 G + 0.114 B`.
///   Appropriate for absorbance spectra because it is noise-resistant — the low
///   weight on the blue channel (0.114) suppresses dark-end artefacts that would
///   otherwise create spurious high-absorbance readings at low intensities.
///
/// * **Max-channel** ([useMaxChannel] = `true`): `max(R, G, B)`. Appropriate for
///   calibration lamp spectra because it gives equal sensitivity to emission lines
///   at all wavelengths. The luminance formula would suppress blue lamp peaks
///   (434.5 nm, 486 nm) to roughly 10–15% of their true brightness, causing them
///   to be missed by the auto-detection algorithm.
///
/// When [lineariseGamma] is `true` (the default) each channel is converted from
/// its sRGB-encoded value to a linear light value before averaging.
///
/// Returns a list of [DataPoint] where `x` is the pixel column index (relative
/// to the full image) and `y` is the average intensity (0–255).
List<DataPoint> extractIntensityProfile(
  Uint8List imageBytes,
  Rect roi, {
  bool lineariseGamma = true,
  bool useMaxChannel = false,
}) {
  final decoded = img.decodeImage(imageBytes);
  if (decoded == null) {
    throw ArgumentError('Unable to decode image.');
  }

  final x0 = roi.left.round().clamp(0, decoded.width - 1);
  final x1 = roi.right.round().clamp(0, decoded.width);
  final y0 = roi.top.round().clamp(0, decoded.height - 1);
  final y1 = roi.bottom.round().clamp(0, decoded.height);

  final roiHeight = y1 - y0;
  if (roiHeight <= 0 || x1 - x0 <= 0) return [];

  final profile = <DataPoint>[];

  for (var x = x0; x < x1; x++) {
    double sum = 0;
    for (var y = y0; y < y1; y++) {
      final pixel = decoded.getPixel(x, y);
      final double r, g, b;
      if (lineariseGamma) {
        r = _srgbToLinear(pixel.r.toInt());
        g = _srgbToLinear(pixel.g.toInt());
        b = _srgbToLinear(pixel.b.toInt());
      } else {
        r = pixel.r.toDouble();
        g = pixel.g.toDouble();
        b = pixel.b.toDouble();
      }
      sum += useMaxChannel
          ? math.max(r, math.max(g, b))
          : 0.299 * r + 0.587 * g + 0.114 * b;
    }
    profile.add(DataPoint(x: x.toDouble(), y: sum / roiHeight));
  }

  return profile;
}

// ── Saturation check ──────────────────────────────────────────────────────────

/// Result of a pixel-saturation analysis over a region of interest.
class SaturationResult {
  /// Number of pixels where at least one channel is at or above [threshold].
  final int saturatedCount;

  /// Total pixels examined.
  final int totalCount;

  /// The 8-bit channel value (0–255) at or above which a pixel is saturated.
  final int threshold;

  const SaturationResult({
    required this.saturatedCount,
    required this.totalCount,
    required this.threshold,
  });

  /// Fraction of saturated pixels (0.0–1.0).
  double get fraction =>
      totalCount == 0 ? 0.0 : saturatedCount / totalCount;

  /// `true` if any pixel in the examined region is saturated.
  bool get isSaturated => saturatedCount > 0;
}

/// Checks whether any pixels within [roi] of [imageBytes] are saturated.
///
/// A pixel is considered saturated when **any** of its R, G, or B channels is
/// at or above [threshold] (default 250, slightly below 255 to catch
/// JPEG-compression artefacts near true white).
///
/// Saturation clips the sensor response at its maximum value, making the
/// measured intensity artificially high and the computed absorbance
/// artificially low or zero at those wavelengths. Users should reduce light
/// intensity (dim the source, add a neutral-density filter, or increase the
/// cuvette-to-detector distance) until no pixels saturate.
SaturationResult checkSaturation(
  Uint8List imageBytes,
  Rect roi, {
  int threshold = 250,
}) {
  final decoded = img.decodeImage(imageBytes);
  if (decoded == null) {
    return const SaturationResult(
        saturatedCount: 0, totalCount: 0, threshold: 250);
  }

  final x0 = roi.left.round().clamp(0, decoded.width - 1);
  final x1 = roi.right.round().clamp(0, decoded.width);
  final y0 = roi.top.round().clamp(0, decoded.height - 1);
  final y1 = roi.bottom.round().clamp(0, decoded.height);

  int saturated = 0;
  int total = 0;

  for (var x = x0; x < x1; x++) {
    for (var y = y0; y < y1; y++) {
      final pixel = decoded.getPixel(x, y);
      total++;
      if (pixel.r >= threshold ||
          pixel.g >= threshold ||
          pixel.b >= threshold) {
        saturated++;
      }
    }
  }

  return SaturationResult(
    saturatedCount: saturated,
    totalCount: total,
    threshold: threshold,
  );
}
