import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'package:spectro_app/features/camera/widgets/focus_lock_indicator.dart';

/// Camera screen for capturing a spectrum strip. Tap to lock focus + exposure
/// (the hardware feature that keeps every measurement comparable), then shoot.
/// Returns the captured file path via [Navigator.pop].
class CaptureScreen extends StatefulWidget {
  /// What the student is shooting, e.g. "Capture the BLANK".
  final String label;

  const CaptureScreen({super.key, required this.label});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> with WidgetsBindingObserver {
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
      if (mounted) setState(() => _errorMessage = 'Camera initialisation failed: $e');
    }
  }

  Future<void> _onPreviewTapped(TapDownDetails details) async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;

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
      if (mounted) setState(() => _isFocusLocked = true);
    } catch (_) {
      // Some devices may not support focus/exposure locking.
    }
  }

  Future<void> _captureImage() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized || _isCapturing) {
      return;
    }

    setState(() => _isCapturing = true);
    try {
      final xFile = await controller.takePicture();

      final tmpDir = await getTemporaryDirectory();
      final targetDir = Directory('${tmpDir.path}/spectro_capture');
      if (!targetDir.existsSync()) targetDir.createSync(recursive: true);
      final targetPath =
          '${targetDir.path}/capture_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final savedFile = await File(xFile.path).copy(targetPath);

      if (mounted) Navigator.pop(context, savedFile.path);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(widget.label),
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
                if (!_isFocusLocked)
                  const Positioned(
                    top: 32,
                    child: _InstructionBanner(text: 'Tap the strip to focus & lock'),
                  ),
                Positioned(
                  top: 16,
                  right: 16,
                  child: FocusLockIndicator(isLocked: _isFocusLocked),
                ),
              ],
            ),
          ),
        ),
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
      child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 16)),
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
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                )
              : Container(
                  width: 56,
                  height: 56,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white),
                ),
        ),
      ),
    );
  }
}
