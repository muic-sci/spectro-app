import 'package:csv/csv.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/scatter_plot_chart.dart';
import 'package:spectro_app/shared/widgets/spectrum_chart.dart';

/// Final results summary showing all key data, charts, and export options.
class ResultsSummaryScreen extends StatelessWidget {
  const ResultsSummaryScreen({
    super.key,
    required this.project,
    this.calibrationCurve,
  });

  final Project project;
  final CalibrationCurve? calibrationCurve;

  // ── CSV export ──────────────────────────────────────────────────────────

  String _buildCsv() {
    final rows = <List<dynamic>>[];

    // Header section.
    rows.add(['Project', project.name]);
    rows.add(['Date', project.updatedAt.toIso8601String()]);
    rows.add([]);

    // Wavelength calibration.
    if (project.calibration != null) {
      final cal = project.calibration!;
      rows.add(['Wavelength Calibration']);
      rows.add(['Slope', cal.slope]);
      rows.add(['Intercept', cal.intercept]);
      rows.add(['R-squared', cal.rSquared]);
      rows.add([]);
      rows.add(['Peak #', 'Pixel', 'Known Wavelength (nm)']);
      for (var i = 0; i < cal.peaks.length; i++) {
        rows.add([i + 1, cal.peaks[i].pixelPosition, cal.peaks[i].knownWavelength]);
      }
      rows.add([]);
    }

    // Beer-Lambert calibration.
    if (calibrationCurve != null) {
      final curve = calibrationCurve!;
      rows.add(['Beer-Lambert Calibration']);
      rows.add(['Lambda Max (nm)', curve.lambdaMax]);
      rows.add(['Slope', curve.slope]);
      rows.add(['Intercept', curve.intercept]);
      rows.add(['R-squared', curve.rSquared]);
      rows.add([]);
      rows.add(['Concentration', 'Absorbance at Lambda Max']);
      for (final dp in curve.dataPoints) {
        rows.add([dp.x, dp.y]);
      }
      rows.add([]);
    }

    // Standards.
    if (project.standards.isNotEmpty) {
      rows.add(['Standards']);
      rows.add(['#', 'Concentration', 'Unit', 'A at Lambda Max']);
      for (var i = 0; i < project.standards.length; i++) {
        final s = project.standards[i];
        rows.add([
          i + 1,
          s.concentration,
          s.unit,
          s.absorbanceSpectrum?.absorbanceAtLambdaMax ?? '',
        ]);
      }
      rows.add([]);
    }

    // Unknowns.
    if (project.unknowns.isNotEmpty) {
      rows.add(['Unknown Results']);
      rows.add(['#', 'Absorbance at Lambda Max', 'Determined Concentration']);
      for (var i = 0; i < project.unknowns.length; i++) {
        final u = project.unknowns[i];
        rows.add([
          i + 1,
          u.absorbanceAtLambdaMax ?? '',
          u.determinedConcentration ?? '',
        ]);
      }
    }

    return const ListToCsvConverter().convert(rows);
  }

  void _exportCsv(BuildContext context) {
    final csv = _buildCsv();
    // Use share_plus to share the CSV text.
    Share.share(csv, subject: '${project.name} - Results');
  }

  void _share(BuildContext context) {
    final summary = StringBuffer()
      ..writeln('Project: ${project.name}')
      ..writeln('Date: ${project.updatedAt.toIso8601String()}');

    if (calibrationCurve != null) {
      summary
        ..writeln()
        ..writeln(
            'Lambda Max: ${calibrationCurve!.lambdaMax.toStringAsFixed(1)} nm')
        ..writeln(
            'Calibration R-squared: ${calibrationCurve!.rSquared.toStringAsFixed(6)}');
    }

    for (var i = 0; i < project.unknowns.length; i++) {
      final u = project.unknowns[i];
      summary
        ..writeln()
        ..writeln('Unknown ${i + 1}:')
        ..writeln(
            '  Absorbance: ${u.absorbanceAtLambdaMax?.toStringAsFixed(4) ?? "N/A"}')
        ..writeln(
            '  Concentration: ${u.determinedConcentration?.toStringAsFixed(4) ?? "N/A"}');
    }

    Share.share(summary.toString(), subject: project.name);
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cal = project.calibration;
    final curve = calibrationCurve;
    final unit = project.standards.isNotEmpty
        ? project.standards.first.unit
        : 'mg/L';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Results Summary', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 16),

          // ── Wavelength calibration chart ───────────────────────────────
          if (cal != null) ...[
            Text('Wavelength Calibration', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: ScatterPlotChart(
                data: cal.peaks
                    .map((p) =>
                        DataPoint(x: p.pixelPosition, y: p.knownWavelength))
                    .toList(),
                slope: cal.slope,
                intercept: cal.intercept,
                rSquared: cal.rSquared,
                xLabel: 'Pixel',
                yLabel: 'Wavelength (nm)',
                title: 'Calibration',
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'R\u00B2 = ${cal.rSquared.toStringAsFixed(6)}',
              style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
            ),
            const SizedBox(height: 16),
          ],

          // ── Absorbance spectra ────────────────────────────────────────
          if (project.standards.any((s) =>
              s.absorbanceSpectrum != null &&
              s.absorbanceSpectrum!.points.isNotEmpty)) ...[
            Text('Absorbance Spectra', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: Builder(builder: (_) {
                final firstWithData = project.standards.firstWhere(
                  (s) =>
                      s.absorbanceSpectrum != null &&
                      s.absorbanceSpectrum!.points.isNotEmpty,
                );
                final overlayData = project.standards
                    .where((s) =>
                        s.absorbanceSpectrum != null &&
                        s.absorbanceSpectrum!.points.isNotEmpty &&
                        s != firstWithData)
                    .map((s) => s.absorbanceSpectrum!.points)
                    .toList();

                return SpectrumChart(
                  data: firstWithData.absorbanceSpectrum!.points,
                  xLabel: 'Wavelength (nm)',
                  yLabel: 'Absorbance',
                  title: 'All Standards',
                  overlayData: overlayData.isNotEmpty ? overlayData : null,
                );
              }),
            ),
            const SizedBox(height: 16),
          ],

          // ── Beer-Lambert calibration ──────────────────────────────────
          if (curve != null) ...[
            Text('Beer-Lambert Curve', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: ScatterPlotChart(
                data: curve.dataPoints,
                slope: curve.slope,
                intercept: curve.intercept,
                rSquared: curve.rSquared,
                xLabel: 'Concentration ($unit)',
                yLabel: 'Absorbance',
                title: 'Beer-Lambert',
                highlightPoint: project.unknowns.isNotEmpty &&
                        project.unknowns.last.determinedConcentration != null
                    ? DataPoint(
                        x: project.unknowns.last.determinedConcentration!,
                        y: project.unknowns.last.absorbanceAtLambdaMax ?? 0,
                      )
                    : null,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // ── Measurements table ────────────────────────────────────────
          Text('Measurements', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          DataTable(
            columnSpacing: 16,
            columns: const [
              DataColumn(label: Text('Type')),
              DataColumn(label: Text('Conc.'), numeric: true),
              DataColumn(label: Text('A'), numeric: true),
            ],
            rows: [
              ...project.standards.map((s) => DataRow(cells: [
                    DataCell(Text('Std (${s.unit})')),
                    DataCell(Text(s.concentration.toStringAsFixed(2))),
                    DataCell(Text(
                      s.absorbanceSpectrum?.absorbanceAtLambdaMax
                              ?.toStringAsFixed(4) ??
                          '-',
                    )),
                  ])),
              ...project.unknowns.map((u) => DataRow(
                    color: WidgetStateProperty.all(
                        theme.colorScheme.primaryContainer.withValues(alpha: 0.3)),
                    cells: [
                      const DataCell(Text('Unknown')),
                      DataCell(Text(
                        u.determinedConcentration?.toStringAsFixed(4) ?? '-',
                      )),
                      DataCell(Text(
                        u.absorbanceAtLambdaMax?.toStringAsFixed(4) ?? '-',
                      )),
                    ],
                  )),
            ],
          ),
          const SizedBox(height: 16),

          // ── Key values ────────────────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Key Values', style: theme.textTheme.titleSmall),
                  const Divider(),
                  if (curve != null)
                    _kvRow('\u03BB_max',
                        '${curve.lambdaMax.toStringAsFixed(1)} nm'),
                  if (cal != null)
                    _kvRow('Calibration R\u00B2',
                        cal.rSquared.toStringAsFixed(6)),
                  if (curve != null)
                    _kvRow('Beer-Lambert R\u00B2',
                        curve.rSquared.toStringAsFixed(6)),
                  for (var i = 0; i < project.unknowns.length; i++)
                    _kvRow(
                      'Unknown ${i + 1} concentration',
                      '${project.unknowns[i].determinedConcentration?.toStringAsFixed(4) ?? "N/A"} $unit',
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Actions ───────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _exportCsv(context),
                  icon: const Icon(Icons.file_download),
                  label: const Text('Export CSV'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _share(context),
                  icon: const Icon(Icons.share),
                  label: const Text('Share'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kvRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(value, style: const TextStyle(fontFamily: 'monospace')),
        ],
      ),
    );
  }
}
