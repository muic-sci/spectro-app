import 'dart:ui' show Rect;

import 'package:uuid/uuid.dart';

// ── Helpers ──────────────────────────────────────────────────────────────────

const _uuid = Uuid();

// ── DataPoint ────────────────────────────────────────────────────────────────

class DataPoint {
  final double x;
  final double y;

  const DataPoint({required this.x, required this.y});

  @override
  String toString() => 'DataPoint($x, $y)';
}

// ── IntensityProfile ─────────────────────────────────────────────────────────

class IntensityProfile {
  final List<DataPoint> points;

  const IntensityProfile({required this.points});
}

// ── CalibrationPeak ──────────────────────────────────────────────────────────

class CalibrationPeak {
  final double pixelPosition;
  final double knownWavelength;

  const CalibrationPeak({
    required this.pixelPosition,
    required this.knownWavelength,
  });
}

// ── Calibration ──────────────────────────────────────────────────────────────

class Calibration {
  final double slope;
  final double intercept;
  final double rSquared;
  final List<CalibrationPeak> peaks;

  const Calibration({
    required this.slope,
    required this.intercept,
    required this.rSquared,
    required this.peaks,
  });

  /// Convert a pixel index to a wavelength (nm) using the linear model:
  /// wavelength = slope * pixel + intercept.
  double pixelToWavelength(double pixel) => slope * pixel + intercept;
}

// ── SpectralImage ────────────────────────────────────────────────────────────

class SpectralImage {
  final String id;
  final String filePath;
  final DateTime capturedAt;
  final IntensityProfile? intensityProfile;

  SpectralImage({
    String? id,
    required this.filePath,
    DateTime? capturedAt,
    this.intensityProfile,
  })  : id = id ?? _uuid.v4(),
        capturedAt = capturedAt ?? DateTime.now();
}

// ── AbsorbanceSpectrum ───────────────────────────────────────────────────────

class AbsorbanceSpectrum {
  final List<DataPoint> points; // (wavelength, absorbance)
  final double? lambdaMax;
  final double? absorbanceAtLambdaMax;

  const AbsorbanceSpectrum({
    required this.points,
    this.lambdaMax,
    this.absorbanceAtLambdaMax,
  });
}

// ── StandardMeasurement ──────────────────────────────────────────────────────

class StandardMeasurement {
  final double concentration;
  final String unit;
  final SpectralImage image;
  final AbsorbanceSpectrum? absorbanceSpectrum;

  const StandardMeasurement({
    required this.concentration,
    this.unit = 'mg/L',
    required this.image,
    this.absorbanceSpectrum,
  });
}

// ── CalibrationCurve ─────────────────────────────────────────────────────────

class CalibrationCurve {
  final double slope; // A = slope * c + intercept
  final double intercept;
  final double rSquared;
  final double lambdaMax;
  final List<DataPoint> dataPoints; // (concentration, absorbance)

  const CalibrationCurve({
    required this.slope,
    required this.intercept,
    required this.rSquared,
    required this.lambdaMax,
    required this.dataPoints,
  });
}

// ── UnknownResult ────────────────────────────────────────────────────────────

class UnknownResult {
  final SpectralImage image;
  final AbsorbanceSpectrum? absorbanceSpectrum;
  final double? absorbanceAtLambdaMax;
  final double? determinedConcentration;

  const UnknownResult({
    required this.image,
    this.absorbanceSpectrum,
    this.absorbanceAtLambdaMax,
    this.determinedConcentration,
  });
}

// ── WorkflowStep ─────────────────────────────────────────────────────────────

enum WorkflowStep {
  cameraSetup,
  wavelengthCalibration,
  roiSelection,
  blankCapture,
  standardCaptures,
  absorbanceAnalysis,
  unknownCapture,
  results,
}

// ── Project ──────────────────────────────────────────────────────────────────

class Project {
  final String id;
  final String name;
  final DateTime createdAt;
  final DateTime updatedAt;
  final WorkflowStep currentStep;
  final Calibration? calibration;
  final Rect? roi;
  final SpectralImage? calibrationImage;
  final SpectralImage? blankImage;
  final List<StandardMeasurement> standards;
  final List<UnknownResult> unknowns;

  Project({
    String? id,
    required this.name,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.currentStep = WorkflowStep.cameraSetup,
    this.calibration,
    this.roi,
    this.calibrationImage,
    this.blankImage,
    List<StandardMeasurement>? standards,
    List<UnknownResult>? unknowns,
  })  : id = id ?? _uuid.v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now(),
        standards = standards ?? [],
        unknowns = unknowns ?? [];

  /// Returns a shallow copy with the given fields replaced.
  Project copyWith({
    String? name,
    DateTime? updatedAt,
    WorkflowStep? currentStep,
    Calibration? calibration,
    Rect? roi,
    SpectralImage? calibrationImage,
    SpectralImage? blankImage,
    List<StandardMeasurement>? standards,
    List<UnknownResult>? unknowns,
  }) {
    return Project(
      id: id,
      name: name ?? this.name,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      currentStep: currentStep ?? this.currentStep,
      calibration: calibration ?? this.calibration,
      roi: roi ?? this.roi,
      calibrationImage: calibrationImage ?? this.calibrationImage,
      blankImage: blankImage ?? this.blankImage,
      standards: standards ?? this.standards,
      unknowns: unknowns ?? this.unknowns,
    );
  }
}
