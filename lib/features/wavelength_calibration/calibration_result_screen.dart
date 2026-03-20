import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';
import 'package:spectro_app/shared/widgets/scatter_plot_chart.dart';

/// Shows the calibration result: scatter plot, equation, R-squared, residuals.
class CalibrationResultScreen extends StatelessWidget {
  const CalibrationResultScreen({super.key, required this.calibration});

  final Calibration calibration;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Build scatter-plot data: (pixel, wavelength).
    final scatterData = calibration.peaks
        .map((p) => DataPoint(x: p.pixelPosition, y: p.knownWavelength))
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Calibration Result')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const InfoCard(
              title: 'Good Calibration',
              content:
                  'A good calibration has an R-squared value very close to '
                  '1.0 (typically > 0.999). This means the pixel-to-wavelength '
                  'relationship is nearly perfectly linear. If R-squared is '
                  'lower, recheck your peak assignments.',
              icon: Icons.check_circle_outline,
            ),
            const SizedBox(height: 16),

            // Scatter plot with regression line.
            SizedBox(
              height: 300,
              child: ScatterPlotChart(
                data: scatterData,
                slope: calibration.slope,
                intercept: calibration.intercept,
                rSquared: calibration.rSquared,
                xLabel: 'Pixel Position',
                yLabel: 'Wavelength (nm)',
                title: 'Pixel vs Wavelength Calibration',
              ),
            ),
            const SizedBox(height: 16),

            // Equation.
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Calibration Equation',
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '\u03BB = ${calibration.slope.toStringAsFixed(4)} '
                      '\u00D7 pixel + '
                      '${calibration.intercept.toStringAsFixed(2)}',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'R\u00B2 = ${calibration.rSquared.toStringAsFixed(6)}',
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontFamily: 'monospace',
                        color: calibration.rSquared >= 0.999
                            ? Colors.green
                            : Colors.orange,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Residuals table.
            Text('Peak Residuals', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            DataTable(
              columnSpacing: 24,
              columns: const [
                DataColumn(label: Text('Peak')),
                DataColumn(label: Text('Pixel'), numeric: true),
                DataColumn(label: Text('Known (nm)'), numeric: true),
                DataColumn(label: Text('Predicted (nm)'), numeric: true),
                DataColumn(label: Text('Residual (nm)'), numeric: true),
              ],
              rows: List.generate(calibration.peaks.length, (i) {
                final peak = calibration.peaks[i];
                final predicted =
                    calibration.pixelToWavelength(peak.pixelPosition);
                final residual = peak.knownWavelength - predicted;
                return DataRow(cells: [
                  DataCell(Text('${i + 1}')),
                  DataCell(Text(peak.pixelPosition.toStringAsFixed(0))),
                  DataCell(Text(peak.knownWavelength.toStringAsFixed(1))),
                  DataCell(Text(predicted.toStringAsFixed(1))),
                  DataCell(Text(residual.toStringAsFixed(2))),
                ]);
              }),
            ),
            const SizedBox(height: 24),

            FilledButton.icon(
              onPressed: () => Navigator.pop(context, true),
              icon: const Icon(Icons.check),
              label: const Text('Accept Calibration'),
            ),
          ],
        ),
      ),
    );
  }
}
