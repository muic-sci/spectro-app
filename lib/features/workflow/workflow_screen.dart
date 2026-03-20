import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
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
  // Local state for data not yet persisted to the project.
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

  // ── Camera stub ─────────────────────────────────────────────────────────
  // In a real app this would launch the camera screen and return image bytes.

  Future<Uint8List?> _openCamera() async {
    // TODO: integrate with actual camera screen.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Camera integration pending')),
    );
    return null;
  }

  // ── Step: Camera Setup ────────────────────────────────────────────────────

  Widget _buildCameraSetup() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Camera Setup',
            content:
                'Position your phone so the camera looks through the '
                'spectrophotometer slit. Make sure the light source is '
                'aligned and the spectrum is centred in the preview.',
            icon: Icons.camera_alt_outlined,
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () async {
              final bytes = await _openCamera();
              if (bytes != null) {
                _nextStep();
              }
            },
            icon: const Icon(Icons.camera),
            label: const Text('Open Camera'),
          ),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _nextStep,
            child: const Text('Skip (camera already set up)'),
          ),
        ],
      ),
    );
  }

  // ── Step: Wavelength Calibration ──────────────────────────────────────────

  Widget _buildWavelengthCalibration() {
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
                  'Calibration available: '
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

              final roi = project?.roi ??
                  const Rect.fromLTWH(0, 0, 640, 480);
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
                  builder: (_) =>
                      PeakIdentificationScreen(profile: profile),
                ),
              );

              if (calibration != null && mounted) {
                final accepted = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => CalibrationResultScreen(
                        calibration: calibration),
                  ),
                );

                if (accepted == true && mounted) {
                  _notifier.update(
                      (p) => p.copyWith(calibration: calibration));
                  _nextStep();
                }
              }
            },
            icon: const Icon(Icons.camera),
            label: const Text('Capture Fluorescent Lamp'),
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

  // ── Step: ROI Selection ───────────────────────────────────────────────────

  Widget _buildRoiSelection() {
    final project = _project;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const InfoCard(
            title: 'Region of Interest',
            content:
                'Select the region of the image that contains the '
                'spectrum. This ROI will be used for all subsequent '
                'measurements.',
            icon: Icons.crop,
          ),
          const SizedBox(height: 24),
          if (project?.roi != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'ROI set: '
                  '${project!.roi!.width.toStringAsFixed(0)} x '
                  '${project.roi!.height.toStringAsFixed(0)}',
                ),
              ),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () async {
              // TODO: navigate to ROI selection screen.
              _notifier.update(
                (p) => p.copyWith(roi: const Rect.fromLTWH(0, 100, 640, 100)),
              );
              _nextStep();
            },
            icon: const Icon(Icons.crop_free),
            label: const Text('Select ROI'),
          ),
          if (project?.roi != null) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _nextStep,
              child: const Text('Keep Current ROI'),
            ),
          ],
        ],
      ),
    );
  }

  // ── Step: Blank Capture ───────────────────────────────────────────────────

  Widget _buildBlankCapture() {
    final project = _project;
    final roi = project?.roi ?? const Rect.fromLTWH(0, 100, 640, 100);

    return BlankCaptureScreen(
      roi: roi,
      blankImage: project?.blankImage,
      onCapture: () async {
        final bytes = await _openCamera();
        if (bytes == null) return null;

        final profile = extractIntensityProfile(bytes, roi);
        final image = SpectralImage(
          filePath: 'blank_capture',
          intensityProfile: IntensityProfile(points: profile),
        );

        _notifier.update((p) => p.copyWith(blankImage: image));
        return image;
      },
    );
  }

  // ── Step: Standard Captures ───────────────────────────────────────────────

  Widget _buildStandardCaptures() {
    final project = _project;
    final roi = project?.roi ?? const Rect.fromLTWH(0, 100, 640, 100);
    final standards = project?.standards ?? [];

    return StandardCaptureScreen(
      standards: standards,
      onCapture: (concentration, unit) async {
        final bytes = await _openCamera();
        if (bytes == null) return null;

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
          final updated = List<StandardMeasurement>.from(p.standards)
            ..removeAt(index);
          return p.copyWith(standards: updated);
        });
      },
    );
  }

  // ── Step: Absorbance Analysis ─────────────────────────────────────────────

  Widget _buildAbsorbanceAnalysis() {
    final project = _project;
    if (project == null ||
        project.calibration == null ||
        project.blankImage?.intensityProfile == null ||
        project.standards.isEmpty) {
      return const Center(
        child: Text('Missing data. Please complete previous steps.'),
      );
    }

    return AbsorbanceSpectraScreen(
      calibration: project.calibration!,
      blankProfile: project.blankImage!.intensityProfile!,
      standards: project.standards,
      onCalibrationCurveReady: (curve, lambdaMax, updatedStandards) {
        _calibrationCurve = curve;
        _notifier.update(
            (p) => p.copyWith(standards: updatedStandards));
        _nextStep();
      },
    );
  }

  // ── Step: Unknown Capture ─────────────────────────────────────────────────

  Widget _buildUnknownCapture() {
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
                'absorbance at \u03BB_max will be read from the '
                'Beer-Lambert calibration curve to determine the '
                'concentration.',
            icon: Icons.science,
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () async {
              final bytes = await _openCamera();
              if (bytes == null) return;

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
            icon: const Icon(Icons.camera_alt),
            label: const Text('Capture Unknown Sample'),
          ),
        ],
      ),
    );
  }

  // ── Step: Results ─────────────────────────────────────────────────────────

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
          preferredSize: const Size.fromHeight(80),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: StepIndicator(currentStep: step),
          ),
        ),
      ),
      body: _buildStepContent(step),
      bottomNavigationBar: _buildBottomBar(step),
    );
  }

  Widget _buildStepContent(WorkflowStep step) {
    switch (step) {
      case WorkflowStep.cameraSetup:
        return _buildCameraSetup();
      case WorkflowStep.wavelengthCalibration:
        return _buildWavelengthCalibration();
      case WorkflowStep.roiSelection:
        return _buildRoiSelection();
      case WorkflowStep.blankCapture:
        return _buildBlankCapture();
      case WorkflowStep.standardCaptures:
        return _buildStandardCaptures();
      case WorkflowStep.absorbanceAnalysis:
        return _buildAbsorbanceAnalysis();
      case WorkflowStep.unknownCapture:
        return _buildUnknownCapture();
      case WorkflowStep.results:
        return _buildResults();
    }
  }

  Widget _buildBottomBar(WorkflowStep step) {
    final isFirst = step.index == 0;
    final isLast = step.index == WorkflowStep.values.length - 1;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            if (!isFirst)
              OutlinedButton.icon(
                onPressed: _prevStep,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Back'),
              ),
            const Spacer(),
            if (!isLast)
              FilledButton.icon(
                onPressed: _nextStep,
                icon: const Icon(Icons.arrow_forward),
                label: const Text('Next'),
              ),
          ],
        ),
      ),
    );
  }
}
