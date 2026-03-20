import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:image/image.dart' as img;

import '../../data/models/project.dart';

/// Extracts a one-dimensional intensity profile from [imageBytes] within the
/// given region of interest [roi].
///
/// For each column *x* inside the ROI the grey-level values across the ROI
/// height are averaged using the luminance formula
/// `0.299 * R + 0.587 * G + 0.114 * B`.
///
/// Returns a list of [DataPoint] where `x` is the pixel column index (relative
/// to the full image) and `y` is the average grey value (0 .. 255).
List<DataPoint> extractIntensityProfile(Uint8List imageBytes, Rect roi) {
  final decoded = img.decodeImage(imageBytes);
  if (decoded == null) {
    throw ArgumentError('Unable to decode image.');
  }

  final x0 = roi.left.round().clamp(0, decoded.width - 1);
  final x1 = roi.right.round().clamp(0, decoded.width);
  final y0 = roi.top.round().clamp(0, decoded.height - 1);
  final y1 = roi.bottom.round().clamp(0, decoded.height);

  final roiHeight = y1 - y0;
  if (roiHeight <= 0 || x1 - x0 <= 0) {
    return [];
  }

  final profile = <DataPoint>[];

  for (var x = x0; x < x1; x++) {
    double sum = 0;
    for (var y = y0; y < y1; y++) {
      final pixel = decoded.getPixel(x, y);
      final grey = 0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b;
      sum += grey;
    }
    profile.add(DataPoint(x: x.toDouble(), y: sum / roiHeight));
  }

  return profile;
}
