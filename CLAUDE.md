# Spectro App — Claude Project Summary

> **Maintenance rule**: Keep this file up to date whenever significant changes are made — especially to domain knowledge, the data model, workflow steps, or architectural decisions. If you change how absorbance is computed, how calibration works, what a step does, or what a model field means, update the relevant section here before finishing the task.

## What This Is
A Flutter smartphone app that turns a phone into a full spectrophotometer workflow companion for the **Lego Spectrophotometer** (see `materials/`). Designed as a step-by-step educational tool for students learning Beer-Lambert law and quantitative spectral analysis — replacing the manual ImageJ workflow described in the reference paper.

## Tech Stack
- **Flutter** (Dart, SDK ^3.11.3)
- **State management**: `flutter_riverpod` (StateNotifier pattern)
- **Local persistence**: `hive` + `hive_flutter`
- **Camera**: `camera` package (focus/exposure lock)
- **Image processing**: `image` package (pure Dart, pixel-level access)
- **Charts**: `fl_chart` (line charts + scatter plots)
- **Export**: `csv` + `share_plus`

## Workflow Steps (in order)
The app is structured as a linear 5-step workflow (`WorkflowStep` enum in [lib/data/models/project.dart](lib/data/models/project.dart)):

| Step | Enum | What happens |
|------|------|-------------|
| 1 | `setup` | Lock camera focus/exposure; draw ROI on the frame — both are one-time setup tasks done together |
| 2 | `calibration` | Capture fluorescent lamp spectrum; identify peaks; fit pixel→wavelength line |
| 3 | `references` | Two tabs — **Blank** (capture I₀ reference) and **Standards** (capture ≥2 solutions of known concentration). "Analyse" button pushes `AbsorbanceSpectraScreen` as an interstitial to confirm λmax and calibration curve before advancing |
| 4 | `unknown` | Capture unknown sample; concentration determined from Beer-Lambert curve |
| 5 | `results` | Summary charts, data table, CSV export, share |

### Why 5 steps (design rationale)
Originally 8 steps. Combined because:
- **Setup + ROI** — both one-time prep, not measurements
- **Blank + Standards** — all reference measurements under the same conditions; blank is just the first one
- **Absorbance analysis** — pure computation, no user capture; shown as an interstitial push screen from References, not a top-level step

## Image Processing Features

### Inverse gamma correction (lineariseGamma)
Smartphone cameras store JPEG images in the **sRGB colour space**, where pixel values are gamma-encoded (γ ≈ 2.2) to match human perception. This means the encoded value is **not** proportional to the number of photons — it is a non-linear compression. For Beer-Lambert spectrophotometry the ratio I/I₀ must be computed in **linear light units**, otherwise absorbance values are systematically distorted.

`extractIntensityProfile` applies the inverse sRGB piecewise formula to each R, G, B channel before computing the luminance-weighted average:
```
if C_norm ≤ 0.04045:  C_linear = C_norm / 12.92
else:                  C_linear = ((C_norm + 0.055) / 1.055)^2.4
```
This is **on by default** (`lineariseGamma: true`). Pass `lineariseGamma: false` only for debugging or comparison purposes.

### Intensity extraction method: luminance vs max-channel

`extractIntensityProfile` supports two methods via `useMaxChannel`:

| Method | Formula | Use for |
|--------|---------|---------|
| Luminance (default) | `0.299R + 0.587G + 0.114B` | Blank, standards, unknown (absorbance) |
| Max-channel | `max(R, G, B)` | Calibration lamp only |

**Why two methods:** The luminance formula weights blue at only 0.114. For a fluorescent lamp calibration spectrum, this suppresses the violet/blue emission lines at 434.5 nm and 486 nm to ~10–15% of their true brightness. The peak auto-detector would then miss them entirely — all 5 selected "peaks" cluster in the green region, producing a catastrophically wrong calibration. `useMaxChannel: true` gives equal sensitivity to all wavelengths so all 5 lamp lines are properly detected.

For absorbance spectra, luminance is preferred: using max-channel amplifies dark-end noise in the blue/UV region of the spectrum, which at low sample concentrations can produce a spurious absorbance peak near px 0 that exceeds the true peak.

**Calibration peak detection:** Uses `SpectralConstants.calibrationSmoothingWindow = 15` (vs `defaultSmoothingWindow = 5`) to merge JPEG sub-peaks within the same emission band, plus a minimum peak separation of `profile.length / 15` pixels (≈40 px for a 550 px image) to prevent multiple sub-peaks of one emission line from all being selected while still resolving the closely-spaced 587 nm / 611.5 nm pair (~40 px apart).

**Expected calibration values** for the sample dataset (550 px wide images):
- slope ≈ 0.59 nm/px, intercept ≈ 397 nm, R² > 0.999
- Peak positions: 434.5 nm ≈ px 61, 486 nm ≈ px 153, 544 nm ≈ px 249, 587 nm ≈ px 316, 611.5 nm ≈ px 365

### Default ROI for pre-cropped images

When no ROI is set (project.roi == null), the fallback is `Rect.fromLTWH(0, 0, 9999, 9999)`. The extraction function clamps to the actual image size, so this effectively uses the full image. This is important for testing with pre-cropped spectral strips (e.g., 550×60 px). The old default `(0, 100, 640, 100)` would produce y0=59, y1=60 on a 60 px tall image — only 1 row.

### Saturation warning
A pixel is **saturated** when any R, G, or B channel reaches or exceeds the sensor's maximum (≥ 250/255, to catch JPEG artefacts near true white). Saturated pixels have clipped intensity — the sensor cannot record more photons, so the measured I is artificially high and the computed absorbance A = −log₁₀(I/I₀) is artificially **low or zero** at those wavelengths.

`checkSaturation(bytes, roi)` returns a `SaturationResult` with:
- `saturatedCount` / `totalCount` / `fraction` — extent of saturation
- `isSaturated` — quick boolean check

`_warnIfSaturated` in `WorkflowScreen` calls this after **every** capture (calibration lamp, blank, each standard, unknown) and shows an orange SnackBar with the saturation percentage. The fix is to reduce light intensity, add a neutral-density filter, or increase cuvette-to-detector distance.

## Key Domain Concepts
- **Wavelength calibration**: Linear fit of pixel position → wavelength (nm) using 5 known fluorescent lamp emission peaks: 434.5, 486.0, 544.0, 587.0, 611.5 nm. Stored as `slope` and `intercept` in `Calibration`; `pixelToWavelength(pixel) = slope * pixel + intercept`.
- **ROI (Region of Interest)**: A fixed `Rect` in image coordinates selected once during setup. Every spectral profile is extracted from this same rectangle to ensure all measurements are comparable.
- **Intensity profile**: The mean pixel intensity across each column of the ROI, producing a 1-D array of `DataPoint(pixel, intensity)`.
- **Blank (I₀)**: A capture of the solvent/cuvette without analyte. Represents the incident light intensity at each wavelength. Required before any absorbance can be computed.
- **Absorbance**: `A(λ) = −log₁₀(I(λ) / I₀(λ))` where I is the sample intensity and I₀ is the blank intensity at the same pixel/wavelength.
- **λmax**: Wavelength of maximum absorbance, auto-detected from the highest-concentration standard but user-adjustable by tapping the spectrum chart.
- **Beer-Lambert calibration curve**: Linear regression of absorbance at λmax vs. known concentration across all standards. Gives `A = ε·l·c` (slope = ε·l). Used to back-calculate unknown concentration: `c = (A − intercept) / slope`.

## Project Data Model ([lib/data/models/project.dart](lib/data/models/project.dart))
```
Project
 ├── id, name, createdAt, updatedAt, currentStep (WorkflowStep)
 ├── calibrationImage (SpectralImage)          — lamp capture
 ├── calibration (Calibration)                 — slope, intercept, R², peaks[]
 ├── roi (Rect)                                — image coordinates
 ├── blankImage (SpectralImage)                — has intensityProfile (I₀)
 ├── standards[] (StandardMeasurement)         — concentration, unit, image, AbsorbanceSpectrum?
 └── unknowns[] (UnknownResult)                — image, AbsorbanceSpectrum?, absorbanceAtLambdaMax?, determinedConcentration?

SpectralImage
 ├── id, filePath, capturedAt
 └── intensityProfile? (IntensityProfile → points: List<DataPoint(pixel, intensity)>)

Calibration
 ├── slope, intercept, rSquared
 └── peaks[] (CalibrationPeak: pixelPosition, knownWavelength)

AbsorbanceSpectrum
 ├── points: List<DataPoint(wavelength, absorbance)>
 ├── lambdaMax?
 └── absorbanceAtLambdaMax?

CalibrationCurve                               — computed in-memory, not persisted
 ├── slope, intercept, rSquared, lambdaMax
 └── dataPoints[] (DataPoint: concentration, absorbance)
```

> `CalibrationCurve` is held in `_WorkflowScreenState._calibrationCurve` (not in `Project`) because it is derived from standards and does not need separate persistence.

## File Structure
```
lib/
 ├── main.dart                        Entry point, Hive init, ProviderScope
 ├── app.dart                         MaterialApp, routes
 ├── core/
 │   ├── constants/app_theme.dart     Material 3 theme
 │   ├── constants/spectral_constants.dart  Lamp peaks, visible range, smoothing window
 │   └── utils/
 │       ├── image_processing.dart    ROI extraction, intensity profiling
 │       └── math_utils.dart          linearRegression, movingAverage, findLocalMaxima
 ├── data/
 │   ├── models/project.dart          All domain models + WorkflowStep enum
 │   └── repositories/project_repository.dart  Hive persistence
 ├── features/
 │   ├── home/                        Project list + create dialog
 │   ├── workflow/                    WorkflowScreen (orchestrates all 5 steps)
 │   │   └── widgets/step_indicator.dart
 │   ├── camera/                      CameraScreen + FocusLockIndicator
 │   ├── roi_selection/               RoiSelectionScreen + DraggableRoi
 │   ├── wavelength_calibration/      PeakIdentificationScreen + CalibrationResultScreen
 │   ├── blank_capture/               BlankCaptureScreen (used as tab in References step)
 │   ├── standard_capture/            StandardCaptureScreen (used as tab in References step)
 │   ├── absorbance_analysis/         AbsorbanceSpectraScreen (interstitial push from References)
 │   ├── unknown_analysis/            UnknownResultScreen
 │   └── results/                     ResultsSummaryScreen (CSV export, share)
 └── shared/widgets/
     ├── info_card.dart               Collapsible educational info panel
     ├── spectrum_chart.dart          fl_chart line chart for spectra
     └── scatter_plot_chart.dart      fl_chart scatter + regression line
```

## Reference Materials (`materials/`)
- `a-3d-printable-modular-absorption-spectrophotometer...pdf` — primary paper (J. Chem. Ed. 2024)
- `ed3c01021_si_001.pdf` — supporting info: parts list, lab procedure, assembly guide
- `ed3c01021_si_004.xlsx` / `_005.xlsx` — absorbance data templates
- `ed3c01021_si_006.xlsx` / `_007.xlsx` — fluorescence data templates

## Build & Run
```bash
flutter pub get
flutter run                  # connected Android/iOS phone (required for camera)
flutter run -d macos         # macOS desktop (no camera)
flutter run -d chrome        # web (no camera)
```
A **real phone** is required for full camera functionality (focus lock, spectrum capture).

## Git Commit Convention
All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <short description>

[optional body — bullet points for multi-change commits]
```

**Types used in this project:**

| Type | When to use |
|------|-------------|
| `feat` | New feature or user-visible behaviour |
| `fix` | Bug fix |
| `refactor` | Code restructure with no behaviour change |
| `perf` | Performance improvement |
| `docs` | CLAUDE.md or other documentation only |
| `chore` | Dependencies, build config, project scaffolding |
| `test` | Adding or updating tests |
| `style` | Formatting, no logic change |

**Rules:**
- Subject line ≤ 72 characters, lowercase after the colon, no trailing period
- Use body bullet points when a commit touches more than one concern
- `flutter analyze` must pass with zero issues before every commit
- Update `CLAUDE.md` in the same commit when domain knowledge, the data model, workflow steps, or architecture changes

**Examples:**
```
feat(calibration): auto-detect fluorescent lamp peaks on capture

fix: prevent divide-by-zero in absorbance when blank intensity is zero

refactor(workflow): extract references step into its own widget

chore: add image_picker dependency for web file-upload support

docs: update CLAUDE.md with saturation warning and gamma correction
```

## Development Notes
- Hive adapters: run `dart run build_runner build` if models change and you add `@HiveType` annotations (currently models are plain Dart, not Hive-annotated — persistence uses manual serialization in `ProjectRepository`)
- `flutter analyze` must pass with zero issues before committing
- No mock databases in tests — use real Hive in a temp directory
