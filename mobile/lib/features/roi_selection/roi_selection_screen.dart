import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'package:spectro_app/features/roi_selection/widgets/draggable_roi.dart';

/// Screen that lets the user select a rectangular Region of Interest on a
/// captured spectrum image.
///
/// Returns the selected [Rect] in *image* coordinates via [Navigator.pop].
class RoiSelectionScreen extends StatefulWidget {
  /// Absolute path to the captured image file.
  final String imagePath;

  const RoiSelectionScreen({super.key, required this.imagePath});

  @override
  State<RoiSelectionScreen> createState() => _RoiSelectionScreenState();
}

class _RoiSelectionScreenState extends State<RoiSelectionScreen> {
  Size _imageSize = Size.zero;
  Rect? _roi;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    final file = File(widget.imagePath);
    final bytes = await file.readAsBytes();
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    final imageSize = Size(
      image.width.toDouble(),
      image.height.toDouble(),
    );

    // Default ROI: centered, 80 % width, 20 % height.
    final roiWidth = imageSize.width * 0.8;
    final roiHeight = imageSize.height * 0.2;
    final defaultRoi = Rect.fromCenter(
      center: Offset(imageSize.width / 2, imageSize.height / 2),
      width: roiWidth,
      height: roiHeight,
    );

    setState(() {
      _imageSize = imageSize;
      _roi = defaultRoi;
      _loading = false;
    });
  }

  void _onRoiChanged(Rect newRoi) {
    setState(() => _roi = newRoi);
  }

  void _confirm() {
    if (_roi != null) {
      Navigator.pop(context, _roi);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Select Region of Interest')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(child: _buildImageWithRoi()),
                _buildBottomBar(),
              ],
            ),
    );
  }

  Widget _buildImageWithRoi() {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Compute the display size that fits the image inside the available
        // area while preserving aspect ratio.
        final imageAspect = _imageSize.width / _imageSize.height;
        final containerAspect = constraints.maxWidth / constraints.maxHeight;

        double displayWidth, displayHeight;
        if (imageAspect > containerAspect) {
          displayWidth = constraints.maxWidth;
          displayHeight = constraints.maxWidth / imageAspect;
        } else {
          displayHeight = constraints.maxHeight;
          displayWidth = constraints.maxHeight * imageAspect;
        }

        final displaySize = Size(displayWidth, displayHeight);

        return Center(
          child: SizedBox(
            width: displayWidth,
            height: displayHeight,
            child: Stack(
              children: [
                // The captured image.
                Positioned.fill(
                  child: Image.file(
                    File(widget.imagePath),
                    fit: BoxFit.fill,
                    width: displayWidth,
                    height: displayHeight,
                  ),
                ),
                // The ROI overlay.
                if (_roi != null)
                  Positioned.fill(
                    child: DraggableRoi(
                      roi: _roi!,
                      imageSize: _imageSize,
                      displaySize: displaySize,
                      onChanged: _onRoiChanged,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBottomBar() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _confirm,
            icon: const Icon(Icons.check),
            label: const Text('Confirm ROI'),
          ),
        ),
      ),
    );
  }
}
