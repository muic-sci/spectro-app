import 'package:flutter_test/flutter_test.dart';
import 'package:spectro_app/core/utils/math_utils.dart';

void main() {
  group('linearRegression', () {
    test('perfect linear fit returns R² = 1', () {
      // y = 2x + 3
      final x = [1.0, 2.0, 3.0, 4.0, 5.0];
      final y = x.map((v) => 2 * v + 3).toList();

      final result = linearRegression(x, y);

      expect(result.slope, closeTo(2.0, 1e-10));
      expect(result.intercept, closeTo(3.0, 1e-10));
      expect(result.rSquared, closeTo(1.0, 1e-10));
    });

    test('matches expected calibration values from paper (~1.9451 slope)', () {
      // From the research paper Excel template: 5 fluorescent peak calibration points
      // (pixel positions mapped to known wavelengths)
      final pixels = [24.0, 51.0, 81.0, 102.0, 116.0];
      final wavelengths = [434.5, 486.0, 544.0, 587.0, 611.5];

      final result = linearRegression(pixels, wavelengths);

      // Slope should be approximately 1.94 nm/pixel
      expect(result.slope, greaterThan(1.5));
      expect(result.slope, lessThan(2.5));
      // R² should be very high
      expect(result.rSquared, greaterThan(0.99));
    });

    test('throws on mismatched lengths', () {
      expect(
        () => linearRegression([1.0, 2.0], [1.0, 2.0, 3.0]),
        throwsArgumentError,
      );
    });

    test('throws on fewer than two points', () {
      expect(
        () => linearRegression([1.0], [2.0]),
        throwsArgumentError,
      );
    });

    test('horizontal line (zero slope)', () {
      final x = [1.0, 2.0, 3.0, 4.0];
      final y = [5.0, 5.0, 5.0, 5.0];

      final result = linearRegression(x, y);

      expect(result.slope, closeTo(0.0, 1e-10));
      expect(result.intercept, closeTo(5.0, 1e-10));
    });
  });

  group('movingAverage', () {
    test('window=1 returns same values', () {
      final values = [1.0, 3.0, 5.0, 7.0, 9.0];
      expect(movingAverage(values, 1), equals(values));
    });

    test('smooths a spike', () {
      final values = [1.0, 1.0, 100.0, 1.0, 1.0];
      final smoothed = movingAverage(values, 5);
      // Center value should be much less than 100
      expect(smoothed[2], lessThan(100.0));
      expect(smoothed[2], greaterThan(1.0));
    });

    test('returns empty list for empty input', () {
      expect(movingAverage([], 3), isEmpty);
    });

    test('output length equals input length', () {
      final values = List.generate(20, (i) => i.toDouble());
      expect(movingAverage(values, 5).length, equals(values.length));
    });
  });

  group('findLocalMaxima', () {
    test('finds single peak', () {
      final values = [0.0, 1.0, 5.0, 1.0, 0.0];
      final peaks = findLocalMaxima(values);
      expect(peaks, contains(2));
    });

    test('finds multiple peaks', () {
      final values = [0.0, 3.0, 0.0, 5.0, 0.0, 2.0, 0.0];
      final peaks = findLocalMaxima(values);
      expect(peaks, containsAll([1, 3, 5]));
    });

    test('ignores plateau (not strictly greater)', () {
      final values = [0.0, 5.0, 5.0, 0.0];
      final peaks = findLocalMaxima(values);
      // Neither index 1 nor 2 is strictly greater than both neighbours
      expect(peaks, isEmpty);
    });

    test('returns empty for fewer than 3 values', () {
      expect(findLocalMaxima([1.0, 2.0]), isEmpty);
    });

    test('minProminence filters small peaks', () {
      final values = [0.0, 10.0, 0.0, 1.1, 0.0];
      final allPeaks = findLocalMaxima(values);
      final prominentPeaks = findLocalMaxima(values, minProminence: 5.0);
      expect(allPeaks.length, equals(2));
      expect(prominentPeaks.length, equals(1));
      expect(prominentPeaks, contains(1));
    });
  });
}
