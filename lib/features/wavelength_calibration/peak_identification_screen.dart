import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:spectro_app/core/constants/spectral_constants.dart';
import 'package:spectro_app/core/utils/math_utils.dart';
import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';
import 'package:spectro_app/shared/widgets/spectrum_chart.dart';

/// Screen where the user identifies peaks in the calibration spectrum and
/// assigns known fluorescent-lamp wavelengths to build a pixel-to-wavelength
/// calibration.
class PeakIdentificationScreen extends StatefulWidget {
  const PeakIdentificationScreen({super.key, required this.profile});

  /// The raw intensity profile extracted from the calibration image.
  final List<DataPoint> profile;

  @override
  State<PeakIdentificationScreen> createState() =>
      _PeakIdentificationScreenState();
}

class _PeakIdentificationScreenState extends State<PeakIdentificationScreen> {
  static const int _numPeaks = 5;

  /// Known wavelengths for each of the 5 peaks.
  final List<double> _knownWavelengths =
      List<double>.unmodifiable(SpectralConstants.fluorescentLampPeaks);

  /// Current pixel positions assigned to each peak (mutable).
  late List<double> _peakPixels;

  /// Controllers for the pixel-position text fields.
  late List<TextEditingController> _pixelControllers;

  @override
  void initState() {
    super.initState();
    _autoDetectPeaks();
    _pixelControllers = List.generate(
      _numPeaks,
      (i) => TextEditingController(text: _peakPixels[i].toStringAsFixed(0)),
    );
  }

  @override
  void dispose() {
    for (final c in _pixelControllers) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Peak detection ────────────────────────────────────────────────────────

  void _autoDetectPeaks() {
    final rawY = widget.profile.map((p) => p.y).toList();
    final smoothed =
        movingAverage(rawY, SpectralConstants.defaultSmoothingWindow);

    // Use a prominence threshold of 5 % of the range.
    final maxVal = smoothed.reduce(math.max);
    final minVal = smoothed.reduce(math.min);
    final prominence = (maxVal - minVal) * 0.05;

    final indices = findLocalMaxima(smoothed, minProminence: prominence);

    // Sort peaks by intensity (descending) and keep the top _numPeaks.
    indices.sort((a, b) => smoothed[b].compareTo(smoothed[a]));
    final topIndices = indices.take(_numPeaks).toList()..sort();

    // If fewer peaks found, pad with evenly-spaced defaults.
    while (topIndices.length < _numPeaks) {
      final gap = widget.profile.length / (_numPeaks + 1);
      topIndices.add((gap * (topIndices.length + 1)).round());
    }
    topIndices.sort();

    _peakPixels = topIndices
        .map((i) => widget.profile[i.clamp(0, widget.profile.length - 1)].x)
        .toList();
  }

  // ── Calibration ───────────────────────────────────────────────────────────

  void _performCalibration() {
    final pixels = List<double>.from(_peakPixels);
    final wavelengths = List<double>.from(_knownWavelengths);

    final result = linearRegression(pixels, wavelengths);

    final peaks = List.generate(
      _numPeaks,
      (i) => CalibrationPeak(
        pixelPosition: pixels[i],
        knownWavelength: wavelengths[i],
      ),
    );

    final calibration = Calibration(
      slope: result.slope,
      intercept: result.intercept,
      rSquared: result.rSquared,
      peaks: peaks,
    );

    Navigator.pop(context, calibration);
  }

  // ── Chart tap ─────────────────────────────────────────────────────────────

  void _onChartTap(double xPosition) {
    // Find the closest peak and move it to the tapped position.
    int closestIndex = 0;
    double closestDist = double.infinity;
    for (var i = 0; i < _peakPixels.length; i++) {
      final dist = (_peakPixels[i] - xPosition).abs();
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    setState(() {
      _peakPixels[closestIndex] = xPosition;
      _pixelControllers[closestIndex].text = xPosition.toStringAsFixed(0);
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Peak Identification')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const InfoCard(
              title: 'Wavelength Calibration',
              content:
                  'A fluorescent lamp produces emission lines at known '
                  'wavelengths. By matching pixel positions to these '
                  'wavelengths, a linear model converts any pixel index '
                  'to a wavelength in nanometres.',
              icon: Icons.lightbulb_outline,
            ),
            const SizedBox(height: 16),

            // Spectrum chart with peak markers.
            SizedBox(
              height: 250,
              child: GestureDetector(
                onTapUp: (details) {
                  // Map the tap x-coordinate to the data domain.
                  final box = context.findRenderObject() as RenderBox?;
                  if (box == null) return;
                  final localX = details.localPosition.dx;
                  final chartWidth = box.size.width - 32; // approximate padding
                  if (chartWidth <= 0) return;
                  final fraction = (localX / chartWidth).clamp(0.0, 1.0);
                  final minX = widget.profile.first.x;
                  final maxX = widget.profile.last.x;
                  final tappedX = minX + fraction * (maxX - minX);
                  _onChartTap(tappedX);
                },
                child: SpectrumChart(
                  data: widget.profile,
                  xLabel: 'Pixel',
                  yLabel: 'Intensity',
                  title: 'Calibration Spectrum',
                  verticalMarker: _peakPixels.isNotEmpty
                      ? _peakPixels.first
                      : null,
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Peak assignment list.
            Text(
              'Peak Assignments',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ...List.generate(_numPeaks, _buildPeakRow),

            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _performCalibration,
              icon: const Icon(Icons.show_chart),
              label: const Text('Calibrate'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPeakRow(int index) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 60,
            child: Text(
              'Peak ${index + 1}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextFormField(
              controller: _pixelControllers[index],
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Pixel position',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: (value) {
                final parsed = double.tryParse(value);
                if (parsed != null) {
                  setState(() {
                    _peakPixels[index] = parsed;
                  });
                }
              },
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(
              '${_knownWavelengths[index].toStringAsFixed(1)} nm',
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }
}
