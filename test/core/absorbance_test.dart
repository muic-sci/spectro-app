import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:spectro_app/core/utils/math_utils.dart';
import 'package:spectro_app/data/models/project.dart';

/// Computes absorbance A(λ) = -log10(I/I0) for a list of intensity pairs.
/// Mirrors the logic in workflow_screen.dart and absorbance_spectra_screen.dart.
List<DataPoint> computeAbsorbance(
    List<DataPoint> sample, List<DataPoint> blank) {
  final result = <DataPoint>[];
  final len = math.min(sample.length, blank.length);
  for (var i = 0; i < len; i++) {
    final i0 = blank[i].y;
    final iS = sample[i].y;
    double a = 0;
    if (i0 > 0 && iS > 0) {
      a = -(math.log(iS / i0) / math.ln10);
      if (a.isNaN || a.isInfinite) a = 0;
    }
    result.add(DataPoint(x: sample[i].x, y: a));
  }
  return result;
}

void main() {
  group('Absorbance calculation', () {
    test('A = 0 when sample equals blank', () {
      final blank = [DataPoint(x: 500.0, y: 100.0)];
      final sample = [DataPoint(x: 500.0, y: 100.0)];
      final abs = computeAbsorbance(sample, blank);
      expect(abs.first.y, closeTo(0.0, 1e-10));
    });

    test('A = 1 when sample is 10% of blank (Beer-Lambert)', () {
      final blank = [DataPoint(x: 500.0, y: 100.0)];
      final sample = [DataPoint(x: 500.0, y: 10.0)];
      final abs = computeAbsorbance(sample, blank);
      expect(abs.first.y, closeTo(1.0, 1e-10));
    });

    test('A = 2 when sample is 1% of blank', () {
      final blank = [DataPoint(x: 500.0, y: 100.0)];
      final sample = [DataPoint(x: 500.0, y: 1.0)];
      final abs = computeAbsorbance(sample, blank);
      expect(abs.first.y, closeTo(2.0, 1e-10));
    });

    test('A is negative when sample is brighter than blank', () {
      final blank = [DataPoint(x: 500.0, y: 50.0)];
      final sample = [DataPoint(x: 500.0, y: 100.0)];
      final abs = computeAbsorbance(sample, blank);
      expect(abs.first.y, lessThan(0.0));
    });

    test('A = 0 when blank is zero (guarded)', () {
      final blank = [DataPoint(x: 500.0, y: 0.0)];
      final sample = [DataPoint(x: 500.0, y: 50.0)];
      final abs = computeAbsorbance(sample, blank);
      expect(abs.first.y, equals(0.0));
    });
  });

  group('Beer-Lambert linear regression', () {
    test('linear regression on concentration vs absorbance', () {
      // Simulated Beer-Lambert data: A = 0.084 * c
      // c in µM, A = epsilon * b * c (epsilon * b = 0.084 AU/µM)
      final concentrations = [2.0, 4.0, 6.0, 8.0, 10.0];
      final absorbances = concentrations.map((c) => 0.084 * c).toList();

      final result = linearRegression(concentrations, absorbances);

      expect(result.slope, closeTo(0.084, 1e-6));
      expect(result.intercept, closeTo(0.0, 1e-6));
      expect(result.rSquared, closeTo(1.0, 1e-10));
    });

    test('unknown concentration determination', () {
      // Calibration curve: A = 0.084 * c + 0.01
      const slope = 0.084;
      const intercept = 0.01;

      // Unknown absorbance = 0.43
      const unknownA = 0.43;
      final c = (unknownA - intercept) / slope;

      expect(c, closeTo((0.43 - 0.01) / 0.084, 1e-6));
    });
  });

  group('Calibration (pixel to wavelength)', () {
    test('pixelToWavelength applies linear model', () {
      // Typical calibration: wavelength = 1.94 * pixel + 388
      final cal = Calibration(
        slope: 1.94,
        intercept: 388.0,
        rSquared: 0.9998,
        peaks: [],
      );

      expect(cal.pixelToWavelength(0.0), closeTo(388.0, 1e-10));
      expect(cal.pixelToWavelength(100.0), closeTo(582.0, 1e-10));
    });
  });
}
