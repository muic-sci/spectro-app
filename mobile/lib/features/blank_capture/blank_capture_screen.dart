import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';
import 'package:spectro_app/shared/widgets/spectrum_chart.dart';

/// Screen for capturing the blank (reference) measurement.
///
/// The caller must provide callbacks for opening the camera and obtaining image
/// bytes, plus the current [roi] and optional existing [blankImage].
class BlankCaptureScreen extends StatefulWidget {
  const BlankCaptureScreen({
    super.key,
    required this.roi,
    this.blankImage,
    required this.onCapture,
  });

  /// The region of interest to extract the intensity profile from.
  final Rect roi;

  /// If the blank has already been captured, its image data.
  final SpectralImage? blankImage;

  /// Called when the user captures or re-captures the blank. The callback
  /// should open the camera, obtain a [Uint8List] of the image bytes, and
  /// return a [SpectralImage] with the intensity profile set.
  final Future<SpectralImage?> Function() onCapture;

  @override
  State<BlankCaptureScreen> createState() => _BlankCaptureScreenState();
}

class _BlankCaptureScreenState extends State<BlankCaptureScreen> {
  SpectralImage? _blankImage;
  List<DataPoint>? _profile;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    _blankImage = widget.blankImage;
    _profile = _blankImage?.intensityProfile?.points;
  }

  Future<void> _captureBlank() async {
    setState(() => _capturing = true);
    try {
      final image = await widget.onCapture();
      if (image != null) {
        setState(() {
          _blankImage = image;
          _profile = image.intensityProfile?.points;
        });
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'What is a Blank?',
            content:
                'The blank is a reference measurement taken with the solvent '
                '(without analyte). It represents I\u2080(\u03BB), the '
                'incident light intensity. Absorbance is computed as '
                'A(\u03BB) = -log\u2081\u2080(I/I\u2080). A good blank '
                'ensures that only the analyte\u2019s absorption is measured.',
            icon: Icons.science_outlined,
          ),
          const SizedBox(height: 16),

          if (_profile != null && _profile!.isNotEmpty) ...[
            Text(
              'Blank Intensity Profile',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: SpectrumChart(
                data: _profile!,
                xLabel: 'Pixel',
                yLabel: 'Intensity',
                title: 'Blank Profile',
              ),
            ),
            const SizedBox(height: 16),
          ],

          FilledButton.icon(
            onPressed: _capturing ? null : _captureBlank,
            icon: _capturing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.camera_alt),
            label: Text(
              _blankImage == null ? 'Capture Blank' : 'Recapture Blank',
            ),
          ),
        ],
      ),
    );
  }
}
