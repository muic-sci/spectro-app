import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'package:spectro_app/features/camera/widgets/focus_lock_indicator.dart';

/// A camera screen for capturing spectrum images.
///
/// Returns the file path of the captured image via [Navigator.pop].
class CameraScreen extends StatefulWidget {
  /// Unique project identifier.
  final String projectId;

  /// Purpose of the capture, e.g. 'calibration', 'blank', 'standard', 'unknown'.
  final String purpose;

  const CameraScreen({
    super.key,
    required this.projectId,
    required this.purpose,
  });

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  bool _isInitialised = false;
  bool _isFocusLocked = false;
  bool _isCapturing = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;

    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _errorMessage = 'No cameras found on this device.');
        return;
      }

      // Prefer the back camera.
      final backCamera = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        backCamera,
        ResolutionPreset.high,
        enableAudio: false,
      );

      _controller = controller;
      await controller.initialize();

      if (!mounted) return;
      setState(() => _isInitialised = true);
    } catch (e) {
      setState(() => _errorMessage = 'Camera initialisation failed: $e');
    }
  }

  Future<void> _onPreviewTapped(TapDownDetails details) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;

    // Compute the normalised focus point from the tap position within the
    // preview area.
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null) return;
    final size = renderBox.size;
    final offset = details.localPosition;
    final point = Offset(
      (offset.dx / size.width).clamp(0.0, 1.0),
      (offset.dy / size.height).clamp(0.0, 1.0),
    );

    try {
      await controller.setFocusPoint(point);
      await controller.setFocusMode(FocusMode.locked);
      await controller.setExposurePoint(point);
      await controller.setExposureMode(ExposureMode.locked);
      setState(() => _isFocusLocked = true);
    } catch (_) {
      // Some devices may not support focus/exposure locking.
    }
  }

  Future<void> _captureImage() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        _isCapturing) {
      return;
    }

    setState(() => _isCapturing = true);

    try {
      final xFile = await controller.takePicture();

      final appDir = await getApplicationDocumentsDirectory();
      final targetDir = Directory(
        '${appDir.path}/spectro_app/${widget.projectId}',
      );
      if (!targetDir.existsSync()) {
        targetDir.createSync(recursive: true);
      }

      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final fileName = '${widget.purpose}_$timestamp.jpg';
      final targetPath = '${targetDir.path}/$fileName';

      final savedFile = await File(xFile.path).copy(targetPath);

      if (mounted) {
        Navigator.pop(context, savedFile.path);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Capture failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  String get _titleText {
    final label = widget.purpose[0].toUpperCase() + widget.purpose.substring(1);
    return 'Capture $label Spectrum';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(_titleText),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _errorMessage!,
            style: const TextStyle(color: Colors.white),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final controller = _controller;
    if (!_isInitialised || controller == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        Expanded(
          child: GestureDetector(
            onTapDown: _onPreviewTapped,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CameraPreview(controller),
                // Instruction overlay shown before focus is locked.
                if (!_isFocusLocked)
                  const Positioned(
                    top: 32,
                    child: _InstructionBanner(text: 'Tap to Focus & Lock'),
                  ),
                // Focus lock status indicator.
                Positioned(
                  top: 16,
                  right: 16,
                  child: FocusLockIndicator(isLocked: _isFocusLocked),
                ),
              ],
            ),
          ),
        ),
        // Capture button
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: _CaptureButton(
              onPressed: _isCapturing ? null : _captureImage,
              isCapturing: _isCapturing,
            ),
          ),
        ),
      ],
    );
  }
}

// ── Private helper widgets ──────────────────────────────────────────────────

class _InstructionBanner extends StatelessWidget {
  final String text;

  const _InstructionBanner({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.white, fontSize: 16),
      ),
    );
  }
}

class _CaptureButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool isCapturing;

  const _CaptureButton({required this.onPressed, required this.isCapturing});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 4),
        ),
        child: Center(
          child: isCapturing
              ? const SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                    color: Colors.white,
                    strokeWidth: 3,
                  ),
                )
              : Container(
                  width: 56,
                  height: 56,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                  ),
                ),
        ),
      ),
    );
  }
}
