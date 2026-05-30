import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';
import 'package:spectro_app/shared/widgets/scatter_plot_chart.dart';
import 'package:spectro_app/shared/widgets/spectrum_chart.dart';

/// Shows the result for an unknown sample: its absorbance spectrum, the
/// Beer-Lambert curve with the unknown highlighted, and the determined
/// concentration.
class UnknownResultScreen extends StatelessWidget {
  const UnknownResultScreen({
    super.key,
    required this.unknownResult,
    required this.calibrationCurve,
    this.unit = 'mg/L',
  });

  final UnknownResult unknownResult;
  final CalibrationCurve calibrationCurve;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final absSpectrum = unknownResult.absorbanceSpectrum;
    final aAtMax = unknownResult.absorbanceAtLambdaMax ?? 0.0;
    final conc = unknownResult.determinedConcentration;

    // Highlight point for the unknown on the calibration curve.
    final highlightPoint =
        conc != null ? DataPoint(x: conc, y: aAtMax) : null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'How Concentration is Determined',
            content:
                'The unknown sample\'s absorbance at \u03BB_max is measured '
                'and substituted into the Beer-Lambert calibration equation '
                '(A = slope \u00D7 c + intercept) to solve for concentration: '
                'c = (A - intercept) / slope. The accuracy depends on a '
                'good calibration (high R\u00B2) and the unknown falling '
                'within the calibrated range.',
            icon: Icons.help_outline,
          ),
          const SizedBox(height: 16),

          // Unknown absorbance spectrum.
          if (absSpectrum != null && absSpectrum.points.isNotEmpty) ...[
            Text('Unknown Absorbance Spectrum',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: SpectrumChart(
                data: absSpectrum.points,
                xLabel: 'Wavelength (nm)',
                yLabel: 'Absorbance',
                title: 'Unknown Sample',
                verticalMarker: absSpectrum.lambdaMax,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Beer-Lambert curve with unknown highlighted.
          Text('Calibration Curve', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          SizedBox(
            height: 260,
            child: ScatterPlotChart(
              data: calibrationCurve.dataPoints,
              slope: calibrationCurve.slope,
              intercept: calibrationCurve.intercept,
              rSquared: calibrationCurve.rSquared,
              xLabel: 'Concentration ($unit)',
              yLabel: 'Absorbance',
              title: 'Beer-Lambert Curve',
              highlightPoint: highlightPoint,
            ),
          ),
          const SizedBox(height: 16),

          // Result cards.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Results', style: theme.textTheme.titleMedium),
                  const Divider(),
                  _resultRow(
                    theme,
                    'Absorbance at \u03BB_max',
                    aAtMax.toStringAsFixed(4),
                  ),
                  const SizedBox(height: 8),
                  _resultRow(
                    theme,
                    'Determined concentration',
                    conc != null
                        ? '${conc.toStringAsFixed(4)} $unit'
                        : 'N/A',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _resultRow(ThemeData theme, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.bodyMedium),
        Text(
          value,
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.bold,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }
}
