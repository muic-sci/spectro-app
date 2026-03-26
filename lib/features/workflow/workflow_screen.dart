import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:spectro_app/core/utils/image_processing.dart';
import 'package:spectro_app/data/models/project.dart';
import 'package:spectro_app/data/repositories/project_repository.dart';
import 'package:spectro_app/features/absorbance_analysis/absorbance_spectra_screen.dart';
import 'package:spectro_app/features/blank_capture/blank_capture_screen.dart';
import 'package:spectro_app/features/results/results_summary_screen.dart';
import 'package:spectro_app/features/standard_capture/standard_capture_screen.dart';
import 'package:spectro_app/features/wavelength_calibration/calibration_result_screen.dart';
import 'package:spectro_app/features/wavelength_calibration/peak_identification_screen.dart';
import 'package:spectro_app/features/workflow/widgets/step_indicator.dart';
import 'package:spectro_app/shared/widgets/info_card.dart';

// ── State management ────────────────────────────────────────────────────────

/// Notifier that loads and mutates a single [Project].
class ProjectNotifier extends StateNotifier<Project?> {
  ProjectNotifier(this._repository) : super(null);

  final ProjectRepository _repository;

  void load(String projectId) {
    state = _repository.getById(projectId);
  }

  void update(Project Function(Project) updater) {
    final current = state;
    if (current == null) return;
    state = updater(current);
    _repository.save(state!);
  }
}

/// Provider family keyed by project ID.
final currentProjectProvider =
    StateNotifierProvider.family<ProjectNotifier, Project?, String>(
  (ref, projectId) {
    final repo = ref.watch(projectRepositoryProvider);
    final notifier = ProjectNotifier(repo)..load(projectId);
    return notifier;
  },
);

// ── Workflow screen ─────────────────────────────────────────────────────────

/// The main wizard screen that orchestrates the entire experiment workflow.
class WorkflowScreen extends ConsumerStatefulWidget {
  const WorkflowScreen({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<WorkflowScreen> createState() => _WorkflowScreenState();
}

class _WorkflowScreenState extends ConsumerState<WorkflowScreen> {
  CalibrationCurve? _calibrationCurve;

  ProjectNotifier get _notifier =>
      ref.read(currentProjectProvider(widget.projectId).notifier);

  Project? get _project =>
      ref.read(currentProjectProvider(widget.projectId));

  // ── Navigation helpers ──────────────────────────────────────────────────

  void _goToStep(WorkflowStep step) {
    _notifier.update((p) => p.copyWith(currentStep: step));
  }

  void _nextStep() {
    final project = _project;
    if (project == null) return;
    final idx = project.currentStep.index;
    if (idx < WorkflowStep.values.length - 1) {
      _goToStep(WorkflowStep.values[idx + 1]);
    }
  }

  void _prevStep() {
    final project = _project;
    if (project == null) return;
    final idx = project.currentStep.index;
    if (idx > 0) {
      _goToStep(WorkflowStep.values[idx - 1]);
    }
  }

  // ── Image acquisition ────────────────────────────────────────────────────

  /// On web: opens a file-upload dialog (ImageSource.gallery).
  /// On mobile: opens the device camera (ImageSource.camera).
  /// Returns raw image bytes, or null if the user cancelled.
  Future<Uint8List?> _openCamera() async {
    final source = kIsWeb ? ImageSource.gallery : ImageSource.camera;
    final file = await ImagePicker().pickImage(
      source: source,
      imageQuality: 100, // no lossy recompression — preserve pixel values
    );
    return file?.readAsBytes();
  }

  // ── Saturation warning ───────────────────────────────────────────────────

  /// Checks for saturated pixels in [roi] and shows a persistent warning
  /// SnackBar if any are found. Should be called immediately after every
  /// image capture, before the bytes are processed.
  void _warnIfSaturated(Uint8List bytes, Rect roi) {
    final result = checkSaturation(bytes, roi);
    if (!result.isSaturated) return;
    final pct = (result.fraction * 100).toStringAsFixed(1);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: Colors.orange.shade800,
        duration: const Duration(seconds: 6),
        content: Text(
          '\u26a0\ufe0f Saturation warning: $pct% of ROI pixels are clipped '
          '(any channel \u2265 ${result.threshold}). '
          'Reduce light intensity or add a neutral-density filter.',
        ),
      ),
    );
  }

  // ── Step 1: Setup (Camera + ROI) ─────────────────────────────────────────

  Widget _buildSetup() {
    final project = _project;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Camera Setup',
            content:
                'Position your phone so the camera looks through the '
                'spectrophotometer slit. Make sure the light source is '
                'aligned and the spectrum is centred in the preview. '
                'Tap the preview to lock focus and exposure.',
            icon: Icons.camera_alt_outlined,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () async {
              final bytes = await _openCamera();
              if (bytes != null) _nextStep();
            },
            icon: Icon(kIsWeb ? Icons.upload_file : Icons.camera),
            label: Text(kIsWeb ? 'Upload Test Photo' : 'Open Camera'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _nextStep,
            child: const Text('Skip (already set up)'),
          ),
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 16),
          const InfoCard(
            title: 'Region of Interest',
            content:
                'Select the strip of pixels containing the spectrum. '
                'This region is reused for every capture in this experiment.',
            icon: Icons.crop,
          ),
          const SizedBox(height: 12),
          if (project?.roi != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'ROI set: '
                  '${project!.roi!.width.toStringAsFixed(0)} × '
                  '${project.roi!.height.toStringAsFixed(0)} px',
                ),
              ),
            ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () async {
              // TODO: navigate to RoiSelectionScreen.
              _notifier.update(
                (p) => p.copyWith(roi: const Rect.fromLTWH(0, 100, 640, 100)),
              );
            },
            icon: const Icon(Icons.crop_free),
            label: Text(project?.roi != null ? 'Adjust ROI' : 'Select ROI'),
          ),
        ],
      ),
    );
  }

  // ── Step 2: Calibration ───────────────────────────────────────────────────

  Widget _buildCalibration() {
    final project = _project;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Wavelength Calibration',
            content:
                'Capture the emission spectrum of a fluorescent lamp. '
                'The known emission lines will be used to map pixel '
                'positions to wavelengths.',
            icon: Icons.lightbulb_outline,
          ),
          const SizedBox(height: 24),
          if (project?.calibration != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Calibration: '
                  'R\u00B2 = ${project!.calibration!.rSquared.toStringAsFixed(6)}',
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          FilledButton.icon(
            onPressed: () async {
              final bytes = await _openCamera();
              if (bytes == null) return;

              final roi = project?.roi ?? const Rect.fromLTWH(0, 0, 640, 480);
              _warnIfSaturated(bytes, roi);
              final profile = extractIntensityProfile(bytes, roi);

              if (!mounted) return;

              _notifier.update((p) => p.copyWith(
                    calibrationImage: SpectralImage(
                      filePath: 'calibration_capture',
                      intensityProfile: IntensityProfile(points: profile),
                    ),
                  ));

              final calibration = await Navigator.push<Calibration>(
                context,
                MaterialPageRoute(
                  builder: (_) => PeakIdentificationScreen(profile: profile),
                ),
              );

              if (calibration != null && mounted) {
                final accepted = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        CalibrationResultScreen(calibration: calibration),
                  ),
                );

                if (accepted == true && mounted) {
                  _notifier.update(
                      (p) => p.copyWith(calibration: calibration));
                  _nextStep();
                }
              }
            },
            icon: Icon(kIsWeb ? Icons.upload_file : Icons.camera),
            label: Text(kIsWeb ? 'Upload Lamp Photo' : 'Capture Fluorescent Lamp'),
          ),
          if (project?.calibration != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _nextStep,
              child: const Text('Use Existing Calibration'),
            ),
          ],
        ],
      ),
    );
  }

  // ── Step 3: References (Blank + Standards) ────────────────────────────────

  Widget _buildReferences() {
    final project = _project;
    final roi = project?.roi ?? const Rect.fromLTWH(0, 100, 640, 100);

    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.water_drop_outlined), text: 'Blank'),
              Tab(icon: Icon(Icons.list_alt), text: 'Standards'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                // Tab 1: Blank
                BlankCaptureScreen(
                  roi: roi,
                  blankImage: project?.blankImage,
                  onCapture: () async {
                    final bytes = await _openCamera();
                    if (bytes == null) return null;
                    _warnIfSaturated(bytes, roi);
                    final profile = extractIntensityProfile(bytes, roi);
                    final image = SpectralImage(
                      filePath: 'blank_capture',
                      intensityProfile: IntensityProfile(points: profile),
                    );
                    _notifier.update((p) => p.copyWith(blankImage: image));
                    return image;
                  },
                ),
                // Tab 2: Standards
                StandardCaptureScreen(
                  standards: project?.standards ?? [],
                  onCapture: (concentration, unit) async {
                    final bytes = await _openCamera();
                    if (bytes == null) return null;
                    _warnIfSaturated(bytes, roi);
                    final profile = extractIntensityProfile(bytes, roi);
                    final image = SpectralImage(
                      filePath: 'standard_${concentration}_$unit',
                      intensityProfile: IntensityProfile(points: profile),
                    );
                    final measurement = StandardMeasurement(
                      concentration: concentration,
                      unit: unit,
                      image: image,
                    );
                    _notifier.update((p) => p.copyWith(
                          standards: [...p.standards, measurement],
                        ));
                    return measurement;
                  },
                  onRemove: (index) {
                    _notifier.update((p) {
                      final updated =
                          List<StandardMeasurement>.from(p.standards)
                            ..removeAt(index);
                      return p.copyWith(standards: updated);
                    });
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Validates references are complete, then pushes the analysis screen.
  /// On accept the calibration curve is stored and the step advances.
  Future<void> _analyseAndProceed() async {
    final project = _project;
    if (project == null ||
        project.calibration == null ||
        project.blankImage?.intensityProfile == null ||
        project.standards.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Capture a blank and at least 2 standards before continuing.',
          ),
        ),
      );
      return;
    }

    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Absorbance Analysis')),
          body: AbsorbanceSpectraScreen(
            calibration: project.calibration!,
            blankProfile: project.blankImage!.intensityProfile!,
            standards: project.standards,
            onCalibrationCurveReady: (curve, lambdaMax, updatedStandards) {
              _calibrationCurve = curve;
              _notifier.update((p) => p.copyWith(standards: updatedStandards));
              _nextStep();
              Navigator.pop(context);
            },
          ),
        ),
      ),
    );
  }

  // ── Step 4: Unknown ───────────────────────────────────────────────────────

  Widget _buildUnknown() {
    final project = _project;
    final roi = project?.roi ?? const Rect.fromLTWH(0, 100, 640, 100);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Unknown Sample',
            content:
                'Capture the spectrum of your unknown sample. Its '
                'absorbance at \u03BB\u2098\u2090\u02E3 will be read from '
                'the Beer-Lambert calibration curve to determine its '
                'concentration.',
            icon: Icons.science,
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () async {
              final bytes = await _openCamera();
              if (bytes == null) return;

              _warnIfSaturated(bytes, roi);
              final profile = extractIntensityProfile(bytes, roi);
              final image = SpectralImage(
                filePath: 'unknown_capture',
                intensityProfile: IntensityProfile(points: profile),
              );

              final blankPts =
                  project?.blankImage?.intensityProfile?.points ?? [];
              final cal = project?.calibration;
              final curve = _calibrationCurve;

              if (cal == null || curve == null || blankPts.isEmpty) return;

              final absPoints = <DataPoint>[];
              final len = math.min(blankPts.length, profile.length);
              for (var i = 0; i < len; i++) {
                final wl = cal.pixelToWavelength(blankPts[i].x);
                final i0 = blankPts[i].y;
                final iS = profile[i].y;
                double a = 0;
                if (i0 > 0 && iS > 0) {
                  a = -(math.log(iS / i0) / math.ln10);
                  if (a.isNaN || a.isInfinite) a = 0;
                }
                absPoints.add(DataPoint(x: wl, y: a));
              }

              double aAtMax = 0;
              double closest = double.infinity;
              for (final pt in absPoints) {
                final d = (pt.x - curve.lambdaMax).abs();
                if (d < closest) {
                  closest = d;
                  aAtMax = pt.y;
                }
              }

              final concentration = curve.slope != 0
                  ? (aAtMax - curve.intercept) / curve.slope
                  : 0.0;

              final unknownResult = UnknownResult(
                image: image,
                absorbanceSpectrum: AbsorbanceSpectrum(
                  points: absPoints,
                  lambdaMax: curve.lambdaMax,
                  absorbanceAtLambdaMax: aAtMax,
                ),
                absorbanceAtLambdaMax: aAtMax,
                determinedConcentration: concentration,
              );

              _notifier.update((p) => p.copyWith(
                    unknowns: [...p.unknowns, unknownResult],
                  ));
              _nextStep();
            },
            icon: Icon(kIsWeb ? Icons.upload_file : Icons.camera_alt),
            label: Text(kIsWeb ? 'Upload Unknown Photo' : 'Capture Unknown Sample'),
          ),
        ],
      ),
    );
  }

  // ── Step 5: Results ───────────────────────────────────────────────────────

  Widget _buildResults() {
    final project = _project;
    if (project == null) {
      return const Center(child: Text('No project data.'));
    }

    return ResultsSummaryScreen(
      project: project,
      calibrationCurve: _calibrationCurve,
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final project = ref.watch(currentProjectProvider(widget.projectId));
    if (project == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Workflow')),
        body: const Center(child: Text('Project not found.')),
      );
    }

    final step = project.currentStep;

    return Scaffold(
      appBar: AppBar(
        title: Text(project.name),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(84),
          child: Column(
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: StepIndicator(currentStep: step),
              ),
              // Spectrum accent line below the step indicator
              Container(
                height: 2,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Color(0xFF7B2FBE),
                      Color(0xFF00BCD4),
                      Color(0xFF4CAF50),
                      Color(0xFFFF9800),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: _buildStepContent(step),
      bottomNavigationBar: _buildBottomBar(step),
    );
  }

  Widget _buildStepContent(WorkflowStep step) {
    switch (step) {
      case WorkflowStep.setup:
        return _buildSetup();
      case WorkflowStep.calibration:
        return _buildCalibration();
      case WorkflowStep.references:
        return _buildReferences();
      case WorkflowStep.unknown:
        return _buildUnknown();
      case WorkflowStep.results:
        return _buildResults();
    }
  }

  Widget _buildBottomBar(WorkflowStep step) {
    final isFirst = step.index == 0;
    final isLast = step.index == WorkflowStep.values.length - 1;
    final cs = Theme.of(context).colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F1B2D),
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.07)),
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Row(
            children: [
              if (!isFirst)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _prevStep,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: cs.onSurface.withValues(alpha: 0.7),
                      side: BorderSide(
                          color: Colors.white.withValues(alpha: 0.15)),
                    ),
                    icon: const Icon(Icons.arrow_back_ios_new_rounded,
                        size: 16),
                    label: const Text('Back'),
                  ),
                ),
              if (!isFirst && !isLast) const SizedBox(width: 12),
              if (!isLast)
                Expanded(
                  flex: isFirst ? 1 : 2,
                  child: FilledButton.icon(
                    onPressed: step == WorkflowStep.references
                        ? _analyseAndProceed
                        : _nextStep,
                    icon: Icon(
                      step == WorkflowStep.references
                          ? Icons.auto_graph_rounded
                          : Icons.arrow_forward_ios_rounded,
                      size: 16,
                    ),
                    label: Text(step == WorkflowStep.references
                        ? 'Analyse'
                        : 'Continue'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
