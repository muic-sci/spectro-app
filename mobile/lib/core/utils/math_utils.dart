import 'dart:math' as math;

/// Result of an ordinary-least-squares linear regression.
class LinearRegressionResult {
  final double slope;
  final double intercept;
  final double rSquared;

  const LinearRegressionResult({
    required this.slope,
    required this.intercept,
    required this.rSquared,
  });

  @override
  String toString() =>
      'LinearRegressionResult(slope: $slope, intercept: $intercept, r²: $rSquared)';
}

/// Ordinary-least-squares linear regression on paired [x] / [y] data.
///
/// Throws [ArgumentError] when [x] and [y] have different lengths or contain
/// fewer than two points.
LinearRegressionResult linearRegression(List<double> x, List<double> y) {
  if (x.length != y.length) {
    throw ArgumentError('x and y must have the same length.');
  }
  final n = x.length;
  if (n < 2) {
    throw ArgumentError('At least two data points are required.');
  }

  double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (var i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  final meanX = sumX / n;
  final meanY = sumY / n;

  final sxx = sumX2 - n * meanX * meanX;
  final sxy = sumXY - n * meanX * meanY;
  final syy = sumY2 - n * meanY * meanY;

  final slope = sxy / sxx;
  final intercept = meanY - slope * meanX;

  // Coefficient of determination (R²).
  final rSquared = syy == 0 ? 1.0 : (sxy * sxy) / (sxx * syy);

  return LinearRegressionResult(
    slope: slope,
    intercept: intercept,
    rSquared: rSquared.clamp(0.0, 1.0),
  );
}

/// Computes a centred moving average of [values] with the given [windowSize].
///
/// The window size is forced to be odd (incremented by one if even).
/// Edge values that lack a full window are averaged over the available
/// neighbours.
List<double> movingAverage(List<double> values, int windowSize) {
  if (values.isEmpty) return [];
  if (windowSize <= 1) return List<double>.from(values);

  // Ensure odd window.
  if (windowSize.isEven) windowSize += 1;
  final half = windowSize ~/ 2;

  final result = List<double>.filled(values.length, 0);
  for (var i = 0; i < values.length; i++) {
    final start = math.max(0, i - half);
    final end = math.min(values.length - 1, i + half);
    double sum = 0;
    for (var j = start; j <= end; j++) {
      sum += values[j];
    }
    result[i] = sum / (end - start + 1);
  }
  return result;
}

/// Returns the indices of local maxima in [values].
///
/// A value at index *i* is a local maximum when it is strictly greater than
/// both its immediate neighbours.  Optionally, only peaks whose prominence
/// is at least [minProminence] are returned.  Prominence is estimated as the
/// minimum drop from the peak to the higher of the two surrounding valleys.
List<int> findLocalMaxima(List<double> values, {double minProminence = 0}) {
  if (values.length < 3) return [];

  final peaks = <int>[];
  for (var i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      if (minProminence <= 0) {
        peaks.add(i);
      } else {
        // Estimate prominence.
        // Walk left to find the valley.
        var leftMin = values[i];
        for (var j = i - 1; j >= 0; j--) {
          if (values[j] > values[i]) break;
          if (values[j] < leftMin) leftMin = values[j];
        }
        // Walk right to find the valley.
        var rightMin = values[i];
        for (var j = i + 1; j < values.length; j++) {
          if (values[j] > values[i]) break;
          if (values[j] < rightMin) rightMin = values[j];
        }
        final prominence = values[i] - math.max(leftMin, rightMin);
        if (prominence >= minProminence) {
          peaks.add(i);
        }
      }
    }
  }
  return peaks;
}
