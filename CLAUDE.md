# Spectro App — Claude Project Summary

> **Maintenance rule**: Keep this file up to date whenever significant changes are made — especially to domain knowledge, the data model, workflow steps, or architectural decisions. If you change how absorbance is computed, how calibration works, what a step does, or what a model field means, update the relevant section here before finishing the task.

## What This Is
An educational spectrophotometer companion for the **Lego Spectrophotometer** (see `materials/`) — teaching Beer-Lambert quantitation, replacing the manual ImageJ workflow from the reference paper. **The product is now web-first:** the laptop (`web/`) guides + analyses; the phone (`mobile/`) is a focus-locked camera that pairs over a QR and uploads photos. The original Flutter app was a full on-phone workflow tool; that workflow + science has been ported to `web/`, and `mobile/` is now stripped to the camera client. The mobile-implementation sections lower in this doc (Workflow Steps, Image Processing Features, File Structure) describe that **original** on-phone app — keep them as the **domain/science reference** (the formulas are now implemented in `web/src/lib/analysis`), but note the mobile app no longer performs analysis.

## Repository layout (monorepo)
> The repo holds two top-level apps. The original Flutter project now lives under **`mobile/`** (all the paths below that say `lib/...` are now `mobile/lib/...`). A new **web-first** app lives under **`web/`**.

```
spectro-app/
├── mobile/       # the Flutter app, now stripped to a focus-locked **camera client**
│                 # for web/ (scan QR → join → capture → upload). No on-phone analysis.
├── web/          # Spectro Web — Next.js 16 / React 19 / Prisma 7 / HeroUI. The new
│                 # "brain": guidance, ROI, charts, analysis, results, export.
├── docs/         # web-refactor-plan.md, web-ux-brief.md, design_handoff_continuous_camera/
├── materials/    # reference paper + the 002 sample dataset (golden test source)
└── docker/, .gitlab-ci.yml  # build/deploy the Flutter web target from mobile/
```

**Why:** running the full analytical workflow on a phone is awkward. The web app guides + analyses on a laptop; the phone, paired via QR, is a focus-locked camera that uploads photos. See `docs/web-refactor-plan.md` and `docs/web-ux-brief.md`. **The two apps share no code** — the web app re-ports the science (see below), it does not import Dart.

### web (foundation pass — done)
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + **HeroUI v3**, Auth.js v5 (`next-auth@beta`) + `@auth/prisma-adapter`, **Prisma 7** + PostgreSQL (`@prisma/adapter-pg`), `sharp`, Recharts, Vitest.
- **Theme = the "middle ground":** HeroUI components, re-skinned by overriding HeroUI's semantic CSS tokens (`--background`, `--surface`, `--accent`, …) with the design handoff's dark OKLCH palette in `web/src/app/globals.css`; the signature scientific bits (logo, spectrum bar, ConnBadge, StatusChip, Readout) are ported primitives in `web/src/components/ui/primitives.tsx`. Dark-only (`.dark` always on `<html>`) — an experimental requirement.
- **Analysis core:** `web/src/lib/analysis/` is a faithful TS port of `mobile/lib/core` behind one module seam (swappable for a Python sidecar later). Pinned by `web/test/analysis.{unit,golden}.test.ts` against the `materials/002` 550×60 dataset.
  - **Decoder caveat:** the web port decodes with `sharp().rotate()` (EXIF auto-orient) to match the Dart `image` package — omitting `.rotate()` mirrors the spectrum (wavelength axis reversed). sharp and Dart `image` still differ at the sub-peak level, so on the 002 lamp image the two mercury blue lines (434.5/486 nm) nearly merge and the calibration is softer than the Dart-documented R²>0.999 (web gets slope≈0.477, intercept≈392, R²≈0.946). The golden test pins the **decoder-robust science** (λmax≈578 nm, absorbance rising with concentration, Beer-Lambert R²>0.99) tightly and the calibration as a structural+snapshot anchor.
- **Data model:** `web/prisma/schema.prisma` — Auth.js tables + a spectro domain that ports `project.dart`. The shared two-device unit is `Experiment` (named to avoid colliding with Auth.js `Session`); it owns pairing/step state, `roi`, `calibration` (Json), and `SpectralImage`/`Standard`/`Unknown` rows.
- **Auth:** email magic-link (Nodemailer) + optional Google; database sessions (not edge-safe), so routes are guarded per-request via `requireUser()` / `requireUserId()` (the latter exposes the owner id, attached to the session by the `session` callback in `auth.ts`) rather than middleware.
- **Guided wizard (in progress):** the laptop flow L0 → L1 → L2 is built.
  - `L0` `/experiments` — list/create/delete experiments (server component + server actions).
  - `L1` `/experiments/new` — setup form: name + mode + reference light (client `NewExperimentForm` via `useActionState`); on submit `createExperimentAction` mints a join token and redirects to pairing.
  - `L2` `/experiments/[id]/pair` — pairing screen; server-renders a QR (the `qrcode` lib) encoding a `spectro://join?e=<id>&t=<token>` deep link plus a short manual join code; 30-min token TTL with a regenerate action.
  - `L3` `/experiments/[id]` — wizard **shell** (persistent frame: `StepRail` + `GuidancePanel` + per-step canvas + `WizardNav` Back/Continue). It loads the experiment + images/standards/unknowns and renders the canvas for `currentStep`; step navigation + the Continue gate are server actions (`web/src/app/experiments/[id]/actions.ts`). **All 7 step canvases are built:** **L3.1 camera/ROI** (`RoiStep` — captures the **lamp first** (you can't mark a region without seeing the strip), then a **horizontal/vertical orientation** toggle (`Experiment.orientation`; the dispersion axis can run either way) + `RoiBoxEditor` to **drag a box** over that image (mouse + touch, pointer events; box stored in image px); "Use full strip" shortcut. Changing the ROI *or* orientation calls `reextractExperiment` → re-extracts every stored profile (vertical = average rows instead of columns) + recomputes the calibration), **L3.2 calibration** (`CalibrationStep` — lamp → peaks/slope/intercept/R² + `SpectrumChart` w/ peak markers + fit verdict), **L3.3 blank** (`BlankStep` — I₀ profile), **L3.4 standards** (`StandardsStep` — add (concentration+unit+capture) / list (with A@λmax) / delete; gate ≥2), **L3.5 absorbance review** (`AbsorbanceReviewStep` — `AbsorbanceChart` overlay of standards + λmax marker, `CalibrationCurveChart` scatter+fit, λmax adjust via `setLambdaMaxAction`), **L3.6 unknown** (`UnknownStep` — capture → A@λmax + concentration Readout + out-of-range warn + unknown plotted on the curve), **L3.7 results** (`ResultsStep` — summary Readouts + data table + **CSV export**, and links to the **full report**). `ComingSoonStep` remains only as a defensive default.
  - **Full report** `/experiments/[id]/report` (standalone, print-friendly page): assembles **every captured image strip** (lamp with the ROI box overlaid via `RoiPreview`, blank, each standard, each unknown) + **every plot** (calibration profile w/ peak markers, absorbance-spectra overlay, Beer-Lambert curve, per-unknown spectra) + all Readouts + the data table. `PrintButton` → `window.print()` (Save as PDF); `@media print` in globals.css hides `.no-print` chrome and forces colour. Reuses the existing chart components + `deriveAnalysis`.
  - **Derived analysis** `web/src/lib/experiment-analysis.ts` (`deriveAnalysis`, pure): recomputes the in-memory science from stored profiles each render — per-standard absorbance spectra, a **single experiment λmax** (`Experiment.lambdaMax` override, else from the highest-concentration standard), each standard's A at that shared λmax, the Beer-Lambert curve (≥2 standards), and unknown concentrations (`determineConcentration`, with an `outOfRange` flag). Pinned by `web/test/experiment-analysis.test.ts`. Prisma-`Json` parsers centralised in `web/src/lib/experiment-json.ts`.
  - **Route handlers live under `web/src/app/api/experiments/[id]/…`** (NOT under the page path): `images/[imageId]` (owner-scoped blob serve) and `export.csv` (results CSV). The capture image `url` and the Results download link both point at `/api/experiments/[id]/…` — keep routes and URLs in sync. Charts: `web/src/components/charts/` — `SpectrumChart` (line), `AbsorbanceChart` (multi-line overlay), `CalibrationCurveChart` (Recharts `ComposedChart` scatter + regression line).
  - End-to-end verified through the real pipeline (cal+blank+5 standards+unknown fixtures): calibration slope≈0.477/R²≈0.946, Beer-Lambert R²≈0.999, unknown back-calculated ≈1.94 (in range), CSV + image routes 200.
- **Cross-device realtime loop (built):** the laptop drives, the phone reacts — over **SSE + an in-process event bus** (`web/src/lib/realtime.ts`; single-instance only — swap for Postgres LISTEN/NOTIFY or Redis to scale).
  - **Routes:** `GET /api/experiments/[id]/events` (SSE; laptop authed by session, phone by `?token=` join token — phone's open connection is the presence signal), `POST /api/experiments/[id]/captures` (token-authed multipart → `processCapture` → clears `pendingCapture` → publishes `captured`). Events: `hello`/`phone-online`/`phone-offline`/`pending`/`captured`/`step`.
  - **Laptop drives via `pendingCapture`** (Json on Experiment): `requestCaptureAction` sets `{role,label,concentration?,unit?}` (parsed by `parseCaptureRequest`) + publishes `pending`; `cancelCaptureAction` clears it. The wizard's `CaptureControls` (replaces the old CapturePanel) offers "Request capture on phone" when paired and an upload fallback always; shows a waiting state while a request is outstanding. `WizardLive`/`PairingLive` (client, via `useExperimentEvents` SSE hook) drive the live connection badge + auto-refresh/auto-advance.
  - **Phone client = a web page** `/join/[token]` (`getExperimentByTokenOnly` — token is the only key, no user session): joins over SSE, shows the requested capture, opens the camera (`<input capture="environment">`), uploads. The L2 QR now encodes the absolute `…/join/<token>` URL (scannable by any phone camera). This is the testable client + fallback; the **native Flutter camera app is still TODO** and would hit the same routes.
  - Verified end-to-end against the dev server: SSE auth (cookie/token/401), phone presence reaching the laptop, token-authed capture running the pipeline + notifying the laptop, wrong-token rejection, `pendingCapture` cleared.
  - **Capture pipeline** (`web/src/lib/capture.ts`, server-only): `processCapture` decodes the photo (sharp), extracts the ROI profile (max-channel for calibration, luminance otherwise), checks saturation, persists the `SpectralImage` + profile, stores the binary on disk (`web/src/lib/storage.ts` → `web/storage/`, gitignored; object storage later), and runs role analysis (calibration fits pixel→λ). Invoked today by the `uploadCaptureAction` server action (the dev stand-in for the phone — file upload from the laptop; `next.config.ts` raises the action body cap to 12mb). Image binaries are served owner-scoped via `GET /api/experiments/[id]/images/[imageId]`. Verified end-to-end: the lamp fixture through the real pipeline reproduces the golden calibration (slope≈0.477, intercept≈392, R²≈0.946, peaks≈[66,251,328,370,458]).
  - Data layer: `web/src/lib/experiments.ts` (server-only, owner-scoped queries + token gen); display copy + per-step guidance (`STEP_GUIDANCE`) + step-nav helpers in `web/src/lib/experiment-meta.ts` (client-safe). Charts: `web/src/components/charts/spectrum-chart.tsx` (Recharts, themed).
### mobile (camera client — done; needs on-device verification)
`mobile/` has been **stripped from the full workflow app to a focus-locked camera client** for Spectro Web. Removed: all on-phone analysis/workflow/ROI/results screens, the Dart analysis core, Hive/Riverpod. Kept: the camera + focus/exposure-lock UX. Deps trimmed to `camera`, `path_provider`, `mobile_scanner` (QR), `http` + `http_parser`.
- **Flow:** `JoinScreen` (scan) → `QrScanScreen` (`mobile_scanner`) → parse the QR's `…/join/<token>` URL (`core/utils/join_link.dart`) → `SpectroClient.resolve()` (`GET /api/join/<token>` → id/name/pending) → `SessionScreen`: subscribes to SSE (`core/api/sse_client.dart`, dart:io with auto-reconnect), shows the laptop's requested capture, opens `CaptureScreen` (tap-to-lock focus+exposure, shutter), and uploads multipart (image/jpeg) to `POST /api/experiments/<id>/captures` with the token. Hits the **same routes** as the web `/join/[token]` client.
- **Permissions:** Android manifest adds INTERNET + CAMERA + `usesCleartextTraffic="true"` (local-network http, dev); iOS Info.plist adds `NSCameraUsageDescription` + `NSAppTransportSecurity` arbitrary-loads (dev). Both would tighten to https in prod.
- Verified: `flutter analyze` clean, `flutter test` (join-link parser) green, and the `/api/join` contract tested live. **Camera/focus-lock/QR need a physical device** — not run here.
- **Still TODO:** interactive λmax-by-tapping the chart (numeric input works); reconnect/error-state polish; multi-instance realtime (the event bus is in-process). The full product is otherwise **complete end-to-end** (web verified browser-to-browser; native app built, pending device test).

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
- **Intensity profile**: The mean pixel intensity perpendicular to the dispersion axis, producing a 1-D array of `DataPoint(pixel, intensity)`. Default (horizontal spectrum) averages **down each column**; for a **vertical** spectrum (`extractIntensityProfile(..., { vertical: true })`, driven by `Experiment.orientation` in web) it averages **across each row** instead. Downstream (calibration, absorbance) is orientation-agnostic — it just consumes the 1-D profile.
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

### Mobile (Flutter) — run from `mobile/`
```bash
cd mobile
flutter pub get
flutter run                  # connected Android/iOS phone (required for camera)
flutter run -d macos         # macOS desktop (no camera)
flutter run -d chrome        # web (no camera)
```
A **real phone** is required for full camera functionality (focus lock, QR scan, spectrum capture). The phone must be able to reach the laptop's Spectro Web server over the local network — pair by scanning the QR on the web pairing screen (it encodes the laptop's `http://<lan-ip>:3000/join/<token>` URL), so run `web` bound to the LAN and ensure both devices share a network.

### Web (Next.js) — run from `web/`
```bash
cd web
npm install
docker compose up -d         # Postgres + Mailpit (dev mail inbox at :8025)
cp .env.example .env         # then: npx auth secret  → AUTH_SECRET
npm run prisma:migrate
npm run dev                  # http://localhost:3000 (runs `prisma generate` first)
npm test                     # vitest: analysis unit + golden-data tests
```
> **Schema-change gotcha:** the Prisma client is cached in the running `next dev`
> process, so after editing `schema.prisma` (+ `db push`) you must **restart the
> dev server** — a mid-session `prisma generate` won't hot-reload, and writes to
> the new column fail with `Unknown argument`. The `dev` script regenerates on
> start, so a restart is always sufficient.

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
