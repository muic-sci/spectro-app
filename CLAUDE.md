# Spectro App — Claude Project Summary

> **Maintenance rule**: Keep this file up to date whenever significant changes are made — especially to domain knowledge, the data model, workflow steps, or architectural decisions. If you change how absorbance is computed, how calibration works, what a step does, or what a stored field means, update the relevant section here before finishing the task.

## What This Is
An educational spectrophotometer companion for the **Lego Spectrophotometer** (see `materials/`) — teaching Beer-Lambert quantitation, replacing the manual ImageJ workflow from the reference paper.

**The product is now a fully static, in-browser web app (`web/`).** The user opens a static site (HTML/JS/CSS — no account, no server), uploads photos of the spectrum strip, and every step — decode, ROI extraction, wavelength calibration, absorbance/fluorescence, the calibration curve, the report and CSV — runs **entirely in their browser**. Experiments + image binaries persist in the browser's **IndexedDB**; nothing is uploaded anywhere.

> **History (for context):** earlier iterations were (1) a full on-phone Flutter app, then (2) a two-device web app — a laptop "brain" (Next.js + Postgres + Auth + SSE) paired with a phone camera client over a QR. Both are **gone**: the `mobile/` Flutter app, the server/database, auth, realtime pairing, and all API routes were removed in the static refactor. The science was ported once (Flutter → TS) and is unchanged; only *where it runs* and *how data persists* changed.

## Repository layout
```
spectro-app/
├── web/          # Spectro Web — a fully static Next.js 16 app (output: export).
│                 # Guidance, ROI, charts, analysis, results, export — all client-side.
├── docs/         # web-refactor-plan.md, web-ux-brief.md, design_handoff_continuous_camera/
├── materials/    # reference paper + the 002 sample dataset (golden test source)
└── docker/, .gitlab-ci.yml  # build/deploy the static web/ image (nginx) on vX.Y.Z tags
```

## web — the app

### Stack
- **Next.js 16** (App Router) with **`output: "export"`** → a static `out/` bundle (no Node server, no API routes, no server actions). React 19, TypeScript, Tailwind v4 + **HeroUI v3**, **Recharts**, **Vitest**.
- **No backend at all:** no Prisma/Postgres, no Auth.js, no SSE, no `sharp` at runtime, no `server-only` modules. `sharp` remains a **devDependency** used only by the Node golden/orientation tests.
- **Theme = the "middle ground":** HeroUI components re-skinned by overriding HeroUI's semantic CSS tokens (`--background`, `--surface`, `--accent`, …) with the design handoff's dark OKLCH palette in `web/src/app/globals.css`; the signature scientific bits (logo, spectrum bar, StatusChip, Readout) are ported primitives in `web/src/components/ui/primitives.tsx`. Dark-only (`.dark` always on `<html>`) — an experimental requirement (stray light contaminates the measurement). The **report** has its own light/dark toggle and always prints on white.

### Storage — browser IndexedDB (`web/src/lib/store/`)
There is no database; the store layer replaces the old Prisma data layer + disk blob storage + server actions:
- **`store/db.ts`** — a tiny promise IndexedDB wrapper. DB `spectro` with two object stores: `experiments` (keyPath `id`, one denormalised JSON record per experiment) and `blobs` (keyPath `key`, the image binaries).
- **`store/blobs.ts`** — `saveBlob`/`getBlob`/`deleteBlob` + `croppedKey(imageId)` (= `${id}crop`) + an **object-URL cache** `objectUrlFor(key)` so `<img>`/canvas/`fetch` can use stable `blob:` URLs (created once per key, revoked on delete/re-save).
- **`store/experiments.ts`** — the client store API (ports the old `lib/experiments.ts` CRUD **and** `lib/capture.ts` persistence): `listExperiments`/`getExperiment`/`readExperiment`/`createExperiment`/`deleteExperiment`/`updateExperiment`, plus mutations `persistCapture`/`persistReextract`/`deleteStandard`/`deleteUnknown`/`setLambdaMax`/`goToStep`. `readExperiment(id)` attaches each standard/unknown's `.image` (by `imageId`) and resolves every image's `url` + `croppedUrl` to object URLs, so `deriveAnalysis` and the UI consume the same shapes as before. IDs are `crypto.randomUUID()`. Every mutation recomputes the derived science via `applyDerived` (the in-browser equivalent of the old `persistDerived`) and writes the whole record back.
- **`store/transfer.ts`** — export/import a portable **`.spectro.zip`** bundle. The zip holds `<name>.spectro.json` (the experiment JSON, still self-contained — every image inline as base64 so import needs nothing else), `<name>-results.csv` (the results-step CSV via `buildResultsCsv`, included only when results are available, i.e. a calibration curve was derived) **plus** each image binary written out as a real file under `images/`, named for the step it belongs to (`imageBlobBaseNames`: `calibration`/`blank`/`laser-650nm`/`standard-0.1mgL` (concentration+unit)/`unknown-1`, deduped; the ROI crop is `<name>.crop.<ext>`) so the photos are self-describing and reusable outside the app. Because data lives only in this browser, this lets a student back it up, hand it in, or move it between machines; import reads the JSON from the zip (or a legacy plain `.spectro.json`) — the `images/` files are for humans, not import — and always remaps ids so a re-import never clobbers an existing experiment. Surfaced on the list page (per-experiment **Export**, top-level **Import**). Naming pinned by `web/test/transfer-names.test.ts`.
- **`store/zip.ts`** — a tiny dependency-free **STORE-method** (no compression) ZIP reader/writer (`zipSync`/`unzipSync`/`isZip`) used only by `transfer.ts`. STORE keeps it small and avoids a zip dependency; the payload is already-compressed images + JSON text, so DEFLATE would buy ~nothing. Archives are openable by any standard unzip tool. Pinned by `web/test/zip.test.ts`.
- **`store/export-csv.ts`** — builds the results CSV in the browser (was the `/api/.../export.csv` route) and triggers a download. Beyond the summary (metadata + per-sample concentration/signal@λmax table) it appends a **wide signal-vs-wavelength table** — `wavelength_nm` then one column per standard/unknown (`standard_N_absorbance`/`unknown_N_fluorescence`, mode-aware) — so the full spectra can be re-plotted in another program. Spectra share the ROI + calibration → one wavelength grid, aligned by index. Pinned by `web/test/export-csv.test.ts`.
- **`store/use-experiment.ts`** — `useExperiment(id)` React hook: loads the experiment from IndexedDB, runs `deriveAnalysis`, exposes `{experiment, derived, loading, notFound, reload}`. Replaces the server component's Prisma fetch + `revalidatePath`.

### Analysis core (`web/src/lib/analysis/`)
A faithful TS port of the original Dart core, behind one module seam. Pure functions (`math`/`image`/`calibration`/`absorbance`) with **no native deps** — unit/golden tested directly. Decoding happens in the **browser**: `analysis/decode.client.ts` (`decodeImageBrowser`: `createImageBitmap({imageOrientation:"from-image"})` → canvas `getImageData` → the RGB `RasterImage` the pure core consumes). There is **no server-side decoder** — `analysis-client.ts` orchestrates decode + extract + calibrate + crop in the browser.
- **Golden test:** `web/test/analysis.golden.test.ts` decodes the `materials/002` fixture with **sharp** (a devDependency, Node-only) to pin the decoder-robust science: lamp slope≈0.582 nm/px, intercept≈397.9, **R²≈0.9998**, peaks≈[63,151,254,325,366]; blue-dye λmax≈627 nm; Beer-Lambert R²>0.99. The browser decode differs from sharp at the sub-pixel level — the **browser result is the source of truth** for the live app; the golden test pins the pure-core path independently.

### Data model (`web/src/lib/domain-types.ts` + the IndexedDB record)
String-literal unions (`ExperimentMode`, `ReferenceLight`, `SpectrumOrientation`, `WorkflowStep`, `SpectralImageRole`) replace the old Prisma enums. One **denormalised** `Experiment` record per IndexedDB row:
```
Experiment
 ├── id, name, createdAt, updatedAt (epoch ms)
 ├── mode (beerLambert|fluorescence), lightType (fluorescent|laser)
 ├── unit (global concentration unit: "µM" | "mg/L" | "%"), laserWavelengths ([r,g,b] | null)
 ├── currentStep (WorkflowStep), roi (Rect | null), orientation (horizontal|vertical)
 ├── lineariseGamma (bool; undo sRGB gamma before averaging — toggle on the ROI step; missing → true)
 ├── calibration (Calibration | null), lambdaMax (number | null, user override)
 ├── calibrationCurve (CalibrationCurve | null)  — derived, written by applyDerived
 ├── images[]    (SpectralImage: id, role, intensityProfile {points}, laserWavelength, capturedAt;
 │               url/croppedUrl resolved at read time)
 ├── standards[] (id, concentration, imageId, absorbanceSpectrum, createdAt)
 └── unknowns[]  (id, imageId, absorbanceSpectrum, absorbanceAtLambdaMax, determinedConcentration, createdAt)
```
- **Concentration unit is experiment-global** (chosen once on the setup form; the same unit applies to every standard + unknown — never re-entered per capture). Allowed units + helpers (`CONCENTRATION_UNITS`/`DEFAULT_UNIT`/`normalizeUnit`) live in `experiment-meta.ts`.
- **"Store every computed step":** `applyDerived` writes `calibrationCurve` + each `Standard.absorbanceSpectrum` + each `Unknown.absorbanceSpectrum`/`absorbanceAtLambdaMax`/`determinedConcentration` on every mutation. The wizard *also* recomputes the same values via `deriveAnalysis` for display (single source of truth, no drift). The browser-rendered ROI **crop** is stored as a separate blob under `croppedKey(imageId)`.
- **`SpectralImage.role`**: `calibration` | `blank` | `standard` | `unknown` | `laser` (the individual laser-line captures, tagged with `laserWavelength`).
- **JSON parsers** for the loosely-typed stored blobs (`roi`/`calibration`/`profile`/`laserWavelengths`) are centralised in `web/src/lib/experiment-json.ts`.

### Routing (static export → query params, not path params)
A static export can't pre-render per-id dynamic routes (ids are created at runtime in the browser), so runtime entities use **query strings**:
- `/` — landing; `/experiments` — list/create/delete + export/import (client, `listExperiments`).
- `/experiments/new` — setup form (client `NewExperimentForm` → `createExperiment` → `router.push("/experiment?id=…")`).
- `/experiment?id=…` — the wizard shell (`web/src/app/experiment/page.tsx`).
- `/report?id=…` — the full report (`web/src/app/report/page.tsx`).
- `/showcase` — the design-system page.
Pages that read `useSearchParams` are wrapped in `<Suspense>` (an export requirement).

### Guided wizard (`/experiment?id=…`)
A client page (`useExperiment`) that renders the persistent frame (`StepRail` + `GuidancePanel` + per-step canvas + `WizardNav`) for the experiment's `currentStep`. Mutating children call the store and then `reload()`, provided via **`WizardReloadProvider`/`useWizardReload`** (`web/src/components/wizard/wizard-context.tsx`) — the static-app replacement for `router.refresh()`/`revalidatePath`. The 6 step canvases:
- **L3.1 Camera & ROI** (`RoiStep` → `RoiBoxEditor`): capture the **lamp first** (you can't mark a region without seeing the strip), then pick **orientation** + **drag a box** (mouse + touch, stored in image px) or "Use full strip", with a `<canvas>` "Region used for analysis" preview. **Orientation auto-detects from the ROI colour gradient** live (`scoreOrientation`, a one-way ANOVA: η² per axis; the larger is the suggested axis and doubles as a "Region clarity" %; confident gate goodness ≥ 0.35, margin ≥ 0.05; manual pick sticks, "↺ Auto-detect" re-enables). Changing ROI/orientation re-extracts **every image in the browser** (`analysis-client.reextractAll`: decode, re-extract profile + crop, recompute calibration) then `store.persistReextract` — instant, no network. For the **laser** light, `LaserCaptureStep` (3 laser slots → "Combine the three captures") replaces the lamp.
- **L3.2 Calibration** (`CalibrationStep`): lamp → peaks/slope/intercept/R² + `SpectrumWithStrip` (profile chart with colour-coded peak markers + the cropped strip drawn under the pixel axis, blue→red, with `reverseX` flip on negative slope) + `DetectedPeaksTable` + `CalibrationFitChart` (pixel→λ fit) + fit verdict.
- **L3.3 Blank** (`BlankStep`): the I₀/background profile via `SpectrumWithStrip` (falls back to a plain chart if no calibration yet).
- **L3.4 Standards + signal review (merged)** (`StandardsStep`): add (concentration + capture) / list (with A@λmax) / delete, **plus** the live `SignalSpectraCard` (overlaid `AbsorbanceChart` + per-standard slim cropped strips + λmax marker) and, once ≥2 standards are measurable, the `CalibrationCurveChart` + R²/slope Readouts. **λmax is set by dragging the line on the graph** (`AbsorbanceChart` is controlled; `SignalSpectraCard` owns the optimistic λmax so the chart marker + every strip line move together live, commits via `store.setLambdaMax`); the numeric `LambdaMaxControl` (bare, in the card header) commits on blur/Enter and its **Auto** button reverts to the auto-derived λmax. Marker colour encodes auto (amber `--warn`) vs manual (`--accent`). Continue gate = `derived.curve` (≥2 *usable* standards).
- **L3.5 Unknown** (`UnknownStep`): capture → A@λmax + concentration Readout + out-of-range warn + unknown plotted on the curve. **Supports many unknowns** — each photo is its own `Unknown` row; the upload control takes `multiple`.
- **L3.6 Results** (`ResultsStep`): summary Readouts + data table + **CSV export** (`downloadResultsCsv`) + link to the report.

The retired `absorbanceReview` step (merged into `standards`) and the pre-wizard `experimentSetup` step are mapped to `standards`/`cameraRoiSetup` by the wizard page; both remain in the `WorkflowStep` union for the labels.

### Full report (`/report?id=…`)
A standalone, print-friendly client page built on the **same components as the wizard** so it stays consistent: calibration & blank via `SpectrumWithStrip`; calibration adds `DetectedPeaksTable`; the lamp shows the ROI box via `RoiPreview`; the standards section is the wizard's `SignalSpectraCard` rendered **`readOnly`** (non-draggable λmax). A top **"Method"** section walks the whole pixel→concentration pipeline, and every section opens with a mode-aware `Explainer`. `PrintButton` → `window.print()`; `@media print` prints on white and forces colour. The report's own light/dark toggle (`ReportThemeShell`/`ReportThemeToggle`) scopes a light OKLCH palette to the report subtree via `data-theme`, persisted in `localStorage`; printing is always forced to light.

### Derived analysis (`web/src/lib/experiment-analysis.ts`)
`deriveAnalysis` (pure) recomputes the in-memory science from the stored profiles each render — **mode-aware** (absorbance or fluorescence — see Key Domain Concepts): per-standard signal spectra, a single experiment λmax (`Experiment.lambdaMax` override else from the highest-concentration standard), each standard's signal at that λmax, the calibration curve (≥2 usable standards), and unknown concentrations (`determineConcentration`, with an `outOfRange` flag). Echoes the experiment-global `unit` and each image's resolved `imageUrl`/`croppedImageUrl`. Pinned by `web/test/experiment-analysis.test.ts`.

### Capture flow (entirely client-side)
`CaptureControls` (client) runs `analysis-client.analyzeCaptureBlob` (browser decode + ROI extract + saturation +, for the lamp, calibration + ROI crop) then writes straight to the store via `store.persistCapture` — no upload, no HTTP. `RoiBoxEditor` re-extract → `store.persistReextract`; `LaserCaptureStep` combine → `analysis-client.buildLaserCalibration` → `store.persistCapture` (role `calibration`). `web/src/lib/capture-log.ts` provides browser console timers for perf debugging.

---

## Capture & analysis pipeline (science reference)
> The formulas below are implemented in `web/src/lib/analysis/` and run in the browser. They are unchanged from the original Flutter port.

### Inverse gamma correction (lineariseGamma)
Smartphone cameras store JPEGs in the **sRGB colour space**, gamma-encoded (γ ≈ 2.2). The encoded value is **not** proportional to photon count. For Beer-Lambert the ratio I/I₀ must be in **linear light units**, so `extractIntensityProfile` applies the inverse sRGB piecewise formula to each R,G,B channel before combining:
```
if C_norm ≤ 0.04045:  C_linear = C_norm / 12.92
else:                  C_linear = ((C_norm + 0.055) / 1.055)^2.4
```
On by default. It is now a **persisted, experiment-global setting** (`Experiment.lineariseGamma: boolean`) the student can toggle on the **Camera & ROI** step (`RoiBoxEditor` switch). Flipping it re-extracts **every** stored capture with the new value (via `reextractAll` → `persistReextract`, which stores the flag) so an experiment never mixes gamma settings; new captures read the current value from the store (`CaptureControls`/`LaserCaptureStep` → `analyzeCaptureBlob`/`buildLaserCalibration`). **Backward compatible:** a missing field (legacy IndexedDB records or bundles exported before this setting existed) is treated as `true` at import (`transfer.ts`), on read (`readExperiment`), and at every consumer, so old data re-analyses identically.

### Intensity extraction method: luminance vs max-channel
`extractIntensityProfile` supports two methods via `useMaxChannel`:

| Method | Formula | Use for |
|--------|---------|---------|
| Luminance (default) | `0.299R + 0.587G + 0.114B` | Blank, standards, unknown (absorbance) |
| Max-channel | `max(R, G, B)` | Calibration lamp / laser only |

**Why two methods:** Luminance weights blue at only 0.114, suppressing a lamp's violet/blue lines (434.5, 486 nm) so the peak detector misses them — all 5 "peaks" cluster in the green, a catastrophically wrong calibration. `useMaxChannel: true` gives equal sensitivity across wavelengths. For absorbance spectra, luminance is preferred (max-channel amplifies dark-end blue/UV noise into a spurious low-concentration peak near px 0).

**Calibration peak detection** uses `SpectralConstants.calibrationSmoothingWindow = 15` (vs `defaultSmoothingWindow = 5`) plus a minimum peak separation `minSep` sized to the spectral **band** (not the raw profile length).

**Spectral-band restriction (dark-margin robustness):** Before peak selection, `candidatePeaks` restricts to the **spectral band** = the span of *bright* maxima (smoothed ≥ 22% of the value range; the dimmest real 002 line, 587 nm, sits at ~33%). This fixes a real failure: a big dark margin used to (a) inflate `profile.length` so the old `minSep = length/15` merged the 587/611.5 nm pair, and (b) inject a faint impostor that could win a near-tied collinear fit in the wrong direction, flipping calibration blue↔red. Now `minSep = round(bandWidth/15)` and margin impostors fall outside the band. Pinned by `web/test/calibration-peaks.test.ts` against `fixtures/lamp-dark-red-margin.json`.

**Collinearity-based peak SELECTION (`calibrateFromLampProfile`):** Because pixel→λ is **linear** (small-angle grating, Δpixel ∝ Δλ), the correct 5 lines are the most **collinear** subset against the known wavelengths — not the 5 brightest. The detector gathers a generous candidate set (`candidatePeaks`: local maxima with a **low 1%-of-range prominence threshold** — deliberately low so a faint-but-real line is never dropped, cluster-deduped by `minSep`, sub-pixel parabolic refinement, capped at 20) and picks the size-5 subset with the **highest R²** (trying both directions; tie-break by total prominence). The low threshold is load-bearing (a 5% cut starved the search → R²≈0.946; at 1% it nails R²≈0.9996). Falls back to the brightness detector (`detectCalibrationPeaks`) with < 5 candidates. **Raw-max snap:** peaks are *found* on the smoothed profile but *positioned* on the **raw** profile (snap to raw max within ±½ smoothing window, then sub-pixel parabola). The calibration step shows a per-peak readout (wavelength / pixel / intensity / fit-λ); peak markers are tinted by real wavelength colour via `wavelengthToRgb` (`web/src/lib/wavelength-color.ts`, CIE 1931 path). Pinned by `web/test/calibration-peaks.test.ts`.

**Expected calibration values** for the sample dataset (550 px wide):
- slope ≈ 0.59 nm/px, intercept ≈ 397 nm, R² > 0.999
- Peaks: 434.5 nm ≈ px 61, 486 nm ≈ px 153, 544 nm ≈ px 249, 587 nm ≈ px 316, 611.5 nm ≈ px 365

### Default ROI for pre-cropped images
When no ROI is set (`roi == null`), the fallback `DEFAULT_ROI` effectively uses the full image (extraction clamps to actual size) — important for pre-cropped strips (e.g. 550×60 px).

### Saturation warning
A pixel is **saturated** when any R,G,B channel ≥ 250/255. Saturated pixels clip, so measured I is artificially high and A = −log₁₀(I/I₀) artificially low/zero. `checkSaturation(raster, roi)` returns `{saturatedCount, totalCount, fraction, isSaturated}`; `CaptureControls` shows the % after every capture. Fix: reduce light, add an ND filter, or increase cuvette-to-detector distance.

## Key Domain Concepts
- **Experiment mode (absorbance vs fluorescence)**: `ExperimentMode` — `beerLambert` (default) or `fluorescence`. Calibration, ROI, the blank step, λmax, the linear fit and the unknown back-calculation are **shared**; only the per-pixel **signal** differs (`SignalMode` + `computeSignal`/`buildSignalSpectrum` in `analysis/absorbance.ts`):
  - **Absorbance** (`beerLambert`): `A = −log₁₀(I/I₀)`; λmax = max absorbance; curve `A = ε·l·c`.
  - **Fluorescence**: `F = I − I₀` (background-subtracted, clamped ≥0); λmax = max emission; curve `F = k·c`. The blank is subtracted (not divided).
  UI terminology is centralised in `experimentTerms(mode)` (`experiment-meta.ts`); the stored JSON keys (`absorbanceSpectrum`, `absorbanceAtLambdaMax`, …) are reused as the generic signal in both modes. Pinned by the fluorescence cases in `analysis.unit.test.ts` + `experiment-analysis.test.ts`.
- **Wavelength calibration**: linear fit pixel→nm from 5 known fluorescent lamp lines (434.5, 486.0, 544.0, 587.0, 611.5 nm). Stored as `slope`/`intercept`; `pixelToWavelength(px) = slope·px + intercept`. **Auto-flip:** `calibrateFromLampProfile` fits both ascending and descending and keeps the higher-R² assignment; a red→violet capture calibrates with a **negative slope**. Pinned by `web/test/flip.test.ts`.
- **Reference light**: `Experiment.lightType` supplies the known wavelengths; **paired 1:1 with the mode** (`lightForMode`: `beerLambert`→`fluorescent`, `fluorescence`→`laser`) — not a separate user choice, but a stored field because calibration branches on it.
  - **`fluorescent`** (default): one lamp capture; 5 lines auto-detected by the collinearity search.
  - **`laser`**: the user enters 3 known wavelengths (R/G/B, defaults 650/532/405); each laser is captured separately (`role: "laser"`, tagged with `laserWavelength`), the three are **max-blended in the browser** into one composite stored as the `calibration` image, and the fit comes from `calibrateFromLaserProfiles` (each laser's `dominantPeak` paired with its known wavelength). Built by `analysis-client.buildLaserCalibration`; recomputed on ROI/orientation change in `reextractAll`. Pinned by `web/test/calibration-laser.test.ts`.
- **ROI**: a fixed `Rect` in image coordinates, selected once; every profile is extracted from it so measurements are comparable.
- **Intensity profile**: mean pixel intensity perpendicular to the dispersion axis → a 1-D `DataPoint(pixel, intensity)` array. Horizontal averages down columns; vertical (`Experiment.orientation`) averages across rows. Downstream is orientation-agnostic.
- **Blank (I₀)**: solvent/cuvette with no analyte — the incident light; required before absorbance.
- **Absorbance**: `A(λ) = −log₁₀(I(λ) / I₀(λ))`.
- **λmax**: wavelength of max signal, auto from the highest-concentration standard, user-adjustable by dragging the line on the spectra chart.
- **Beer-Lambert curve**: linear regression of signal@λmax vs known concentration → `A = ε·l·c`; back-calculate the unknown via `c = (A − intercept) / slope`.

## Reference Materials (`materials/`)
- `a-3d-printable-modular-absorption-spectrophotometer...pdf` — primary paper (J. Chem. Ed. 2024)
- `ed3c01021_si_001.pdf` — supporting info: parts list, lab procedure, assembly guide
- `ed3c01021_si_004.xlsx` / `_005.xlsx` — absorbance data templates
- `ed3c01021_si_006.xlsx` / `_007.xlsx` — fluorescence data templates

## Build & Run (from `web/`)
```bash
cd web
npm install
npm run dev        # http://localhost:3000 (dev server; the app itself is static)
npm test           # vitest: analysis unit + golden-data tests
npm run typecheck  # tsc --noEmit
npm run build      # static export → out/
npm run preview    # serve the built out/ locally (npx serve out)
```
There is no database, no `.env` to configure, and no auth. Data lives in the browser's IndexedDB; use the list page's **Export/Import** to move or back up experiments.

### Deploy (Docker, static) — tag → GitLab CI → webhook → server
Push a `vX.Y.Z` tag → `.gitlab-ci.yml` builds `web/Dockerfile` (context `web`) and pushes to the GitLab registry → HMAC webhook → the server's `docker/cron-deploy.sh` (cron) pulls the new tag and runs `docker compose up -d`. The image is a **multi-stage static build**: `node` builds the export, then **nginx** (`web/nginx.conf`) serves `out/` on **:80** behind nginx-proxy. **No database, no migrations, no persistent volume.**
- **`docker/docker-compose.yml`** runs a single `app` service (the static image) with `VIRTUAL_HOST`/`VIRTUAL_PORT=80`/`LETSENCRYPT_HOST` for nginx-proxy + acme-companion. The `docker/` folder is rsync'd to the server; `.env` is server-managed (see `docker/.env.example`).
- **Server setup:** DNS A-record; nginx-proxy + acme-companion on the `nginx-proxy` network; a deploy dir holding the synced compose + `.env` (`SPECTRO_APP_IMAGE` / `VIRTUAL_HOST` / `LETSENCRYPT_HOST` / `PROXY_CONTAINER`); `docker login` to the registry for cron pulls; `cron-deploy.sh` in crontab; CI vars `DEPLOY_WEBHOOK_SECRET` + `DEPLOY_WEBHOOK_URL`. Nothing to back up (no server-side data).

## Git Commit Convention
All commits follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>[scope]: <short description>` + optional bullet body.

| Type | When |
|------|------|
| `feat` | new feature / user-visible behaviour |
| `fix` | bug fix |
| `refactor` | restructure, no behaviour change |
| `perf` | performance |
| `docs` | docs only (incl. this file) |
| `chore` | deps, build config, scaffolding |
| `test` | tests |
| `style` | formatting |

**Rules:**
- Subject ≤ 72 chars, lowercase after the colon, no trailing period.
- Body bullets when a commit touches more than one concern.
- `npm run typecheck` + `npm test` (+ `npm run build` for build-affecting changes) must pass before committing.
- Update `CLAUDE.md` in the same commit when domain knowledge, the data model, workflow steps, or architecture changes.

## Development Notes
- The app is **client-only**: anything touching IndexedDB / `window` / canvas must run in a client component (or be guarded). Server components may only do static rendering.
- No mock databases in tests — the analysis core is pure and tested directly; the IndexedDB store is verified in a real browser.
- Run `npm run typecheck && npm test` before committing; run `npm run build` to confirm the static export still succeeds.
