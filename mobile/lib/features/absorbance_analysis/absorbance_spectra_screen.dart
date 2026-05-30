import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:spectro_app/core/utils/math_utils.dart';
import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';
import 'package:spectro_app/shared/widgets/scatter_plot_chart.dart';
import 'package:spectro_app/shared/widgets/spectrum_chart.dart';

/// Screen that computes and displays absorbance spectra for all standards,
/// identifies lambda-max, and performs the Beer-Lambert calibration.
class AbsorbanceSpectraScreen extends StatefulWidget {
  const AbsorbanceSpectraScreen({
    super.key,
    required this.calibration,
    required this.blankProfile,
    required this.standards,
    required this.onCalibrationCurveReady,
  });

  /// The pixel-to-wavelength calibration.
  final Calibration calibration;

  /// The blank intensity profile.
  final IntensityProfile blankProfile;

  /// List of captured standard measurements (with intensity profiles).
  final List<StandardMeasurement> standards;

  /// Callback invoked when the Beer-Lambert curve has been computed.
  final void Function(CalibrationCurve curve, double lambdaMax,
      List<StandardMeasurement> updatedStandards) onCalibrationCurveReady;

  @override
  State<AbsorbanceSpectraScreen> createState() =>
      _AbsorbanceSpectraScreenState();
}

class _AbsorbanceSpectraScreenState extends State<AbsorbanceSpectraScreen> {
  late List<AbsorbanceSpectrum> _absorbanceSpectra;
  late double _lambdaMax;
  CalibrationCurve? _calibrationCurve;

  // Colours for overlaid spectra.
  static const List<Color> _spectrumColors = [
    Colors.blue,
    Colors.red,
    Colors.green,
    Colors.orange,
    Colors.purple,
    Colors.teal,
    Colors.pink,
    Colors.brown,
  ];

  @override
  void initState() {
    super.initState();
    _computeAbsorbance();
  }

  // ── Absorbance computation ────────────────────────────────────────────────

  void _computeAbsorbance() {
    final blankPoints = widget.blankProfile.points;
    _absorbanceSpectra = [];

    for (final std in widget.standards) {
      final samplePoints = std.image.intensityProfile?.points;
      if (samplePoints == null) continue;

      final absPoints = <DataPoint>[];
      final len = math.min(blankPoints.length, samplePoints.length);

      for (var i = 0; i < len; i++) {
        final wavelength =
            widget.calibration.pixelToWavelength(blankPoints[i].x);
        final i0 = blankPoints[i].y;
        final iSample = samplePoints[i].y;

        double absorbance;
        if (i0 <= 0 || iSample <= 0) {
          absorbance = 0;
        } else {
          absorbance = -_log10(iSample / i0);
          if (absorbance.isNaN || absorbance.isInfinite) absorbance = 0;
        }

        absPoints.add(DataPoint(x: wavelength, y: absorbance));
      }

      _absorbanceSpectra.add(AbsorbanceSpectrum(points: absPoints));
    }

    // Find lambda max from the highest-concentration standard.
    _lambdaMax = _findLambdaMax();
    _buildCalibrationCurve();
  }

  double _log10(double x) => math.log(x) / math.ln10;

  double _findLambdaMax() {
    // Use the highest-concentration standard to locate lambda max.
    int maxConcIdx = 0;
    double maxConc = 0;
    for (var i = 0; i < widget.standards.length; i++) {
      if (widget.standards[i].concentration > maxConc) {
        maxConc = widget.standards[i].concentration;
        maxConcIdx = i;
      }
    }

    if (maxConcIdx >= _absorbanceSpectra.length) return 550.0;

    final spectrum = _absorbanceSpectra[maxConcIdx];
    double bestWl = 550.0;
    double bestAbs = -1;
    for (final pt in spectrum.points) {
      if (pt.y > bestAbs) {
        bestAbs = pt.y;
        bestWl = pt.x;
      }
    }
    return bestWl;
  }

  void _buildCalibrationCurve() {
    final concentrations = <double>[];
    final absorbances = <double>[];
    final curvePoints = <DataPoint>[];

    for (var i = 0; i < widget.standards.length && i < _absorbanceSpectra.length; i++) {
      final aAtMax = _absorbanceAtLambdaMax(_absorbanceSpectra[i], _lambdaMax);
      concentrations.add(widget.standards[i].concentration);
      absorbances.add(aAtMax);
      curvePoints.add(DataPoint(
        x: widget.standards[i].concentration,
        y: aAtMax,
      ));
    }

    if (concentrations.length >= 2) {
      final reg = linearRegression(concentrations, absorbances);
      _calibrationCurve = CalibrationCurve(
        slope: reg.slope,
        intercept: reg.intercept,
        rSquared: reg.rSquared,
        lambdaMax: _lambdaMax,
        dataPoints: curvePoints,
      );
    }
  }

  double _absorbanceAtLambdaMax(AbsorbanceSpectrum spectrum, double lambdaMax) {
    double closest = double.infinity;
    double value = 0;
    for (final pt in spectrum.points) {
      final dist = (pt.x - lambdaMax).abs();
      if (dist < closest) {
        closest = dist;
        value = pt.y;
      }
    }
    return value;
  }

  void _onChartTap(double wavelength) {
    setState(() {
      _lambdaMax = wavelength;
      _buildCalibrationCurve();
    });
  }

  void _accept() {
    if (_calibrationCurve == null) return;

    // Build updated standards with absorbance spectra attached.
    final updatedStandards = <StandardMeasurement>[];
    for (var i = 0; i < widget.standards.length; i++) {
      final absSpectrum = i < _absorbanceSpectra.length
          ? AbsorbanceSpectrum(
              points: _absorbanceSpectra[i].points,
              lambdaMax: _lambdaMax,
              absorbanceAtLambdaMax:
                  _absorbanceAtLambdaMax(_absorbanceSpectra[i], _lambdaMax),
            )
          : null;

      updatedStandards.add(StandardMeasurement(
        concentration: widget.standards[i].concentration,
        unit: widget.standards[i].unit,
        image: widget.standards[i].image,
        absorbanceSpectrum: absSpectrum,
      ));
    }

    widget.onCalibrationCurveReady(
        _calibrationCurve!, _lambdaMax, updatedStandards);
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Prepare overlay data for the spectrum chart.
    final overlayData = <List<DataPoint>>[];
    final overlayColors = <Color>[];
    for (var i = 0; i < _absorbanceSpectra.length; i++) {
      overlayData.add(_absorbanceSpectra[i].points);
      overlayColors.add(_spectrumColors[i % _spectrumColors.length]);
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Beer-Lambert Law',
            content:
                'The Beer-Lambert law states that absorbance is proportional '
                'to concentration: A = \u03B5 \u00B7 l \u00B7 c, where '
                '\u03B5 is the molar absorptivity, l is the path length, '
                'and c is the concentration. By measuring absorbance at '
                '\u03BB_max for standards of known concentration, a linear '
                'calibration curve is built to determine unknowns.',
            icon: Icons.auto_graph,
          ),
          const SizedBox(height: 16),

          // Overlaid absorbance spectra.
          Text('Absorbance Spectra', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          SizedBox(
            height: 260,
            child: GestureDetector(
              onTapUp: (details) {
                final box = context.findRenderObject() as RenderBox?;
                if (box == null || _absorbanceSpectra.isEmpty) return;
                final localX = details.localPosition.dx;
                final chartWidth = box.size.width - 32;
                if (chartWidth <= 0) return;
                final fraction = (localX / chartWidth).clamp(0.0, 1.0);
                final pts = _absorbanceSpectra.first.points;
                if (pts.isEmpty) return;
                final minX = pts.first.x;
                final maxX = pts.last.x;
                _onChartTap(minX + fraction * (maxX - minX));
              },
              child: SpectrumChart(
                data: _absorbanceSpectra.isNotEmpty
                    ? _absorbanceSpectra.first.points
                    : const [],
                xLabel: 'Wavelength (nm)',
                yLabel: 'Absorbance',
                title: 'Absorbance Spectra',
                overlayData: overlayData.length > 1
                    ? overlayData.sublist(1)
                    : null,
                overlayColors: overlayColors.length > 1
                    ? overlayColors.sublist(1)
                    : null,
                verticalMarker: _lambdaMax,
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Legend.
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: List.generate(
              widget.standards.length,
              (i) => Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    color: _spectrumColors[i % _spectrumColors.length],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${widget.standards[i].concentration} '
                    '${widget.standards[i].unit}',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Lambda max.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                '\u03BB_max = ${_lambdaMax.toStringAsFixed(1)} nm',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Table: concentration | absorbance at lambda max.
          Text('Concentration vs Absorbance',
              style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          DataTable(
            columnSpacing: 24,
            columns: const [
              DataColumn(label: Text('Concentration')),
              DataColumn(label: Text('A at \u03BB_max'), numeric: true),
            ],
            rows: List.generate(
              math.min(widget.standards.length, _absorbanceSpectra.length),
              (i) {
                final a =
                    _absorbanceAtLambdaMax(_absorbanceSpectra[i], _lambdaMax);
                return DataRow(cells: [
                  DataCell(Text(
                    '${widget.standards[i].concentration} '
                    '${widget.standards[i].unit}',
                  )),
                  DataCell(Text(a.toStringAsFixed(4))),
                ]);
              },
            ),
          ),
          const SizedBox(height: 16),

          // Beer-Lambert scatter plot.
          if (_calibrationCurve != null) ...[
            Text('Beer-Lambert Calibration',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SizedBox(
              height: 260,
              child: ScatterPlotChart(
                data: _calibrationCurve!.dataPoints,
                slope: _calibrationCurve!.slope,
                intercept: _calibrationCurve!.intercept,
                rSquared: _calibrationCurve!.rSquared,
                xLabel: 'Concentration',
                yLabel: 'Absorbance',
                title: 'Beer-Lambert Curve',
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'A = ${_calibrationCurve!.slope.toStringAsFixed(4)} '
              '\u00D7 c + ${_calibrationCurve!.intercept.toStringAsFixed(4)}  '
              '(R\u00B2 = ${_calibrationCurve!.rSquared.toStringAsFixed(6)})',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _accept,
              icon: const Icon(Icons.check),
              label: const Text('Accept & Continue'),
            ),
          ],
        ],
      ),
    );
  }
}
