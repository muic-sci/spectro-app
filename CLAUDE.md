# Spectro App — Claude Project Summary

> **Maintenance rule**: Keep this file up to date whenever significant changes are made — especially to domain knowledge, the data model, workflow steps, or architectural decisions. If you change how absorbance is computed, how calibration works, what a step does, or what a stored field means, update the relevant section here before finishing the task.

## What This Is
An educational spectrophotometer companion for the **Lego Spectrophotometer** — teaching Beer-Lambert quantitation, replacing the manual ImageJ workflow from the reference paper. (The paper + sample dataset live in `materials/`, which is **gitignored and local-only**, so a fresh clone won't have it; the golden test doesn't need it — see the layout below.)

**The product is now a fully static, in-browser web app (`web/`).** The user opens a static site (HTML/JS/CSS — no account, no server), uploads photos of the spectrum strip, and every step — decode, ROI extraction, wavelength calibration, absorbance/fluorescence, the calibration curve, the report and CSV — runs **entirely in their browser**. Experiments + image binaries persist in the browser's **IndexedDB**; nothing is uploaded anywhere.

> **History (for context):** earlier iterations were (1) a full on-phone Flutter app, then (2) a two-device web app — a laptop "brain" (Next.js + Postgres + Auth + SSE) paired with a phone camera client over a QR. Both are **gone**: the `mobile/` Flutter app, the server/database, auth, realtime pairing, and all API routes were removed in the static refactor. The science was ported once (Flutter → TS) and is unchanged; only *where it runs* and *how data persists* changed.

## Repository layout
```
spectro-app/
├── web/          # Spectro Web — a fully static Next.js 16 app (output: export).
│                 # Guidance, ROI, charts, analysis, results, export — all client-side.
│   └── scripts/  # Node-side CLIs that drive the app's own analysis core headlessly
│                 # (analyze-bundle.ts — re-analyse exported .spectro.zip offline).
├── docs/         # see "docs — what's live vs historical" below
├── materials/    # reference paper + the 002 sample dataset. GITIGNORED, local-only
│                 # (scrubbed from git history); the golden test uses its own tracked
│                 # copy at web/test/fixtures/spectro-002, not this folder.
├── paper/        # J. Chem. Educ. manuscript draft — tracked ONLY on branch `paper-draft`
│                 # (never merged). On main only the gitignored paper/resources/ exists.
└── Dockerfile, docker-compose.prod.yml, .gitlab-ci.yml
                  # deployd: CI builds the static image on vX.Y.Z tags; deployd deploys it
```

### docs — what's live vs historical
The two planning documents were written for the **retired two-device architecture** (laptop
brain + paired phone camera + server). Both have been re-framed rather than deleted, because
parts are still load-bearing — read the status banner at the top of each before trusting it:
- **`docs/web-ux-brief.md`** — **partly live.** Its §5 is the cited source of the per-step
  guidance copy (`STEP_GUIDANCE` in `experiment-meta.ts`), and its **L3.x screen IDs are the
  step names used throughout this file**. The phone screens (P0–P6) and QR pairing are
  quarantined in its Appendix H.
- **`docs/web-refactor-plan.md`** — **historical ADR.** Its §A collects the decisions that
  still hold (the science port, the module seam, the golden test, the load-bearing constants);
  §B records why the two-device design was dropped. Everything below §B is superseded — note
  its §8 constants are outdated, and this file is authoritative where they disagree.
- **`docs/design_handoff_continuous_camera/`** — **never implemented**, kept for two reasons:
  it is the origin of the live OKLCH palette/tokens, and it is the only complete spec of the
  exposure-lock problem (which the current app does not solve — see the note under *Capture flow*).
- **`docs/deploy-checklist.html`** — live, interactive deployd release checklist (ticks persist
  in localStorage).

## web — the app

### Stack
- **Next.js 16** (App Router) with **`output: "export"`** → a static `out/` bundle (no Node server, no API routes, no server actions). React 19, TypeScript, Tailwind v4 + **HeroUI v3**, **Recharts**, **Vitest**.
- **No backend at all:** no Prisma/Postgres, no Auth.js, no SSE, no `sharp` at runtime, no `server-only` modules. `sharp` remains a **devDependency**, used only as the Node-side decoder — by `analysis.golden.test.ts`, `orientation.test.ts`, `flip.test.ts` and the headless re-analysis path (see below). `tsx` is a devDependency solely to run `scripts/*.ts`. Neither is ever bundled into the static export.
- **Theme = the "middle ground":** HeroUI components re-skinned by overriding HeroUI's semantic CSS tokens (`--background`, `--surface`, `--accent`, …) with the design handoff's dark OKLCH palette in `web/src/app/globals.css`; the signature scientific bits (logo, spectrum bar, StatusChip, Readout) are ported primitives in `web/src/components/ui/primitives.tsx`. Dark-only (`.dark` always on `<html>`) — an experimental requirement (stray light contaminates the measurement). The **report** has its own light/dark toggle and always prints on white.

### Storage — browser IndexedDB (`web/src/lib/store/`)
There is no database; the store layer replaces the old Prisma data layer + disk blob storage + server actions:
- **`store/db.ts`** — a tiny promise IndexedDB wrapper. DB `spectro` with two object stores: `experiments` (keyPath `id`, one denormalised JSON record per experiment) and `blobs` (keyPath `key`, the image binaries).
- **`store/blobs.ts`** — `saveBlob`/`getBlob`/`deleteBlob` + `croppedKey(imageId)` (= `${id}crop`) + an **object-URL cache** `objectUrlFor(key)` so `<img>`/canvas/`fetch` can use stable `blob:` URLs (created once per key, revoked on delete/re-save).
- **`store/experiments.ts`** — the client store API (ports the old `lib/experiments.ts` CRUD **and** `lib/capture.ts` persistence): `listExperiments`/`getExperiment`/`readExperiment`/`createExperiment`/`deleteExperiment`/`updateExperiment`, plus mutations `persistCapture`/`persistReextract`/`deleteStandard`/`deleteUnknown`/`setLambdaMax`/`goToStep`. `readExperiment(id)` attaches each standard/unknown's `.image` (by `imageId`) and resolves every image's `url` + `croppedUrl` to object URLs, so `deriveAnalysis` and the UI consume the same shapes as before. IDs are `crypto.randomUUID()`. Every mutation recomputes the derived science via `applyDerived` (the in-browser equivalent of the old `persistDerived`) and writes the whole record back.
- **`store/bundle.ts`** — the **environment-agnostic half of the bundle format**: the `Bundle`/`BundleBlob` types, base64, `slug`, `extForType`, the blob-key convention (`splitBlobKey`/`blobKeyFor`), `imageBlobBaseNames`, and `readBundles` (zip-or-plain-JSON → normalised bundle list, defaulting a missing `lineariseGamma` to `true`). Uses only Web-standard globals (`atob`, `TextDecoder`), so Node can read the same archives. `transfer.ts` re-exports `imageBlobBaseNames` for back-compat.
- **`store/transfer.ts`** — export/import a portable **`.spectro.zip`** bundle; the **browser half** (IndexedDB, Blobs, downloads) on top of `store/bundle.ts`. The zip holds `<name>.spectro.json` (the experiment JSON, still self-contained — every image inline as base64 so import needs nothing else), `<name>-results.csv` (the results-step CSV via `buildResultsCsv`, included only when results are available, i.e. a calibration curve was derived) **plus** each image binary written out as a real file under `images/`, named for the step it belongs to (`imageBlobBaseNames`: `calibration`/`blank`/`laser-650nm`/`standard-0.1mgL` (concentration+unit)/`unknown-1`, deduped; the ROI crop is `<name>.crop.<ext>`) so the photos are self-describing and reusable outside the app. Because data lives only in this browser, this lets a student back it up, hand it in, or move it between machines; import reads the JSON from the zip (or a legacy plain `.spectro.json`) — the `images/` files are for humans, not import — and always remaps ids so a re-import never clobbers an existing experiment. Surfaced on the list page (per-experiment **Export**, top-level **Import**). Naming pinned by `web/test/transfer-names.test.ts`.
- **`store/zip.ts`** — a tiny dependency-free **STORE-method** (no compression) ZIP reader/writer (`zipSync`/`unzipSync`/`isZip`) used only by `transfer.ts`. STORE keeps it small and avoids a zip dependency; the payload is already-compressed images + JSON text, so DEFLATE would buy ~nothing. Archives are openable by any standard unzip tool. Pinned by `web/test/zip.test.ts`.
- **`store/export-csv.ts`** — builds the results CSV in the browser (was the `/api/.../export.csv` route) and triggers a download. Beyond the summary (metadata + per-sample concentration/signal@λmax table) it appends a **wide signal-vs-wavelength table** — `wavelength_nm` then one column per standard/unknown (`standard_N_absorbance`/`unknown_N_fluorescence`, mode-aware) — so the full spectra can be re-plotted in another program. Spectra share the ROI + calibration → one wavelength grid, aligned by index. Pinned by `web/test/export-csv.test.ts`.
- **`store/use-experiment.ts`** — `useExperiment(id)` React hook: loads the experiment from IndexedDB, runs `deriveAnalysis`, exposes `{experiment, derived, loading, notFound, reload}`. Replaces the server component's Prisma fetch + `revalidatePath`.

### Analysis core (`web/src/lib/analysis/`)
A faithful TS port of the original Dart core, behind one module seam. Pure functions (`math`/`image`/`calibration`/`absorbance`) with **no native deps** — unit/golden tested directly. Decoding happens in the **browser**: `analysis/decode.client.ts` (`decodeImageBrowser`: `createImageBitmap({imageOrientation:"from-image"})` → canvas `getImageData` → the RGB `RasterImage` the pure core consumes). There is **no server-side decoder on the app's path** — `analysis-client.ts` orchestrates decode + extract + calibrate + crop in the browser.
- **`analysis/pipeline.ts`** — the decoder-agnostic **per-role rules**, extracted so the browser and headless paths share one definition rather than two copies: `maxChannelForRole` (lamp/laser → max-channel), `saturationThresholdForRole` (blank → the stricter 230), `extractRoleProfile`, `checkRoleSaturation`, and `calibrationFromProfiles` (lamp collinearity fit vs laser dominant-peak fit, by `lightType`). `analysis-client.ts` is now a thin browser wrapper over these (decode + canvas crop).
- **`analysis/decode.node.ts`** — `decodeImageNode(bytes)` via **sharp** (`.rotate()` = EXIF auto-orient, matching the browser's `imageOrientation:"from-image"`). Node-only, never imported by app code. The browser decode remains the source of truth for the live app; in practice the two agree — a headless re-run of an exported experiment reproduces its stored calibration and curve exactly (verified on the tracked bundles).
- **Golden test:** `web/test/analysis.golden.test.ts` decodes the 002 fixture with **sharp** (a devDependency, Node-only) to pin the decoder-robust science. It reads its **own tracked copy** at `web/test/fixtures/spectro-002` (mirrored from `materials/002`), so it passes on a fresh clone even though `materials/` is gitignored. Pinned values: lamp slope≈0.582 nm/px, intercept≈397.9, **R²≈0.9998**, peaks≈[63,151,254,325,366]; blue-dye λmax≈627 nm; Beer-Lambert R²>0.99. The browser decode differs from sharp at the sub-pixel level — the **browser result is the source of truth** for the live app; the golden test pins the pure-core path independently.

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
- `/showcase` — the design-system page (internal, not in the student flow; it is the only remaining consumer of the `ConnBadge` primitive, a leftover from the two-device era).
Pages that read `useSearchParams` are wrapped in `<Suspense>` (an export requirement).

A **`VersionBadge`** (`web/src/components/ui/version-badge.tsx`) is rendered once in the root layout, so a small build-version stamp sits bottom-right on every page (`no-print`). `APP_VERSION` = `NEXT_PUBLIC_APP_VERSION`, baked in at build time from the root `Dockerfile`'s `APP_VERSION` build arg (CI passes the git tag); local builds show `dev`. A deployed page reading `dev` means the build arg was lost.

### Guided wizard (`/experiment?id=…`)
A client page (`useExperiment`) that renders the persistent frame (`StepRail` + `GuidancePanel` + per-step canvas + `WizardNav`) for the experiment's `currentStep`. Mutating children call the store and then `reload()`, provided via **`WizardReloadProvider`/`useWizardReload`** (`web/src/components/wizard/wizard-context.tsx`) — the static-app replacement for `router.refresh()`/`revalidatePath`. `StepRail` renders `WIZARD_STEPS` = the **6** steps below (`WORKFLOW_STEPS` minus the pre-wizard `experimentSetup`); per-step teaching copy is `STEP_GUIDANCE` in `experiment-meta.ts`, sourced from `docs/web-ux-brief.md` §5. Any step without its own canvas falls through to `ComingSoonStep` — currently unreachable for real rows, since all 6 are built. The 6 step canvases:
- **L3.1 Camera & ROI** (`RoiStep` → `RoiBoxEditor`): capture the **lamp first** (you can't mark a region without seeing the strip), then pick **orientation** + **drag a box** (mouse + touch, stored in image px) or "Use full strip", with a `<canvas>` "Region used for analysis" preview. **Orientation auto-detects from the ROI colour gradient** live (`scoreOrientation`, a one-way ANOVA: η² per axis; the larger is the suggested axis and doubles as a "Region clarity" %; confident gate goodness ≥ 0.35, margin ≥ 0.05; manual pick sticks, "↺ Auto-detect" re-enables). Changing ROI/orientation re-extracts **every image in the browser** (`analysis-client.reextractAll`: decode, re-extract profile + crop, recompute calibration) then `store.persistReextract` — instant, no network. **Dark-margin gate:** the box must keep dark background on each end of the spectrum along the dispersion axis — ≥10% of the box length per end for the lamp, ≥20% for laser lines (narrow lines need more dark context). **In fluorescence mode the box must ALSO keep dark background across the strip** — ≥15% of the box on each side along the cross axis (the faint emission band needs dark rows on both sides so a shift between shots never moves it off the box); assessed by the same `checkRoiMargins` run on the cross-axis profile (`vertical` flipped). The along-axis threshold is keyed on the **light** (narrow laser lines need more dark context), the cross gate on the **mode** — the two are chosen independently. Assessed live (`analysis-client.assessRoiMargins` → pure `analysis/roi-margins.ts` `checkRoiMargins`, band = smoothed profile above the same 22% bright floor as `candidatePeaks`; returns `RoiMarginsAssessment {along, cross, ok}` — `cross` null in absorption mode); failing either check turns the box + handles orange (`--warn`), shows a fix-it message with the measured percentages, and disables **Save region** — "Use full strip" stays enabled (the escape hatch for pre-cropped strips). Thresholds in `SpectralConstants.roiDarkMarginLamp/Laser/Cross`; pinned by `web/test/roi-margins.test.ts`. For the **laser** light, `LaserCaptureStep` (3 laser slots → "Combine the three captures") replaces the lamp.
- **L3.2 Calibration** (`CalibrationStep`): lamp → peaks/slope/intercept/R² + `SpectrumWithStrip` (profile chart with colour-coded peak markers + the cropped strip drawn under the pixel axis, blue→red, with `reverseX` flip on negative slope) + `DetectedPeaksTable` + `CalibrationFitChart` (pixel→λ fit) + fit verdict.
- **L3.3 Blank** (`BlankStep`): the I₀/background profile via `SpectrumWithStrip` (falls back to a plain chart if no calibration yet).
- **L3.4 Standards + signal review (merged)** (`StandardsStep`): add (concentration + capture) / list (with A@λmax) / delete, **plus** the live `SignalSpectraCard` (overlaid `AbsorbanceChart` + per-standard slim cropped strips + λmax marker) and, once ≥2 standards are measurable, the `CalibrationCurveChart` + R²/slope Readouts. **λmax is set by dragging the line on the graph** (`AbsorbanceChart` is controlled; `SignalSpectraCard` owns the optimistic λmax so the chart marker + every strip line move together live, commits via `store.setLambdaMax`); the numeric `LambdaMaxControl` (bare, in the card header) commits on blur/Enter and its **Auto** button reverts to the auto-derived λmax. Marker colour encodes auto (amber `--warn`) vs manual (`--accent`). Continue gate = `derived.curve` (≥2 *usable* standards).
- **L3.5 Unknown** (`UnknownStep`): capture → A@λmax + concentration Readout + out-of-range warn + unknown plotted on the curve. **Supports many unknowns** — each photo is its own `Unknown` row; the upload control takes `multiple`.
- **L3.6 Results** (`ResultsStep`): summary Readouts + data table + **CSV export** (`downloadResultsCsv`) + link to the report.

The retired `absorbanceReview` step (merged into `standards`) and the pre-wizard `experimentSetup` step are mapped to `standards`/`cameraRoiSetup` by the wizard page; both remain in the `WorkflowStep` union for the labels.

**`AlignedLampStrip`** (`web/src/components/wizard/aligned-lamp-strip.tsx`) is the shared primitive under both `SpectrumWithStrip` (calibration + blank) and `SignalSpectraCard` (standards + the report). It draws the cropped strip as a **canonical horizontal band, blue (short λ) on the LEFT, red on the RIGHT, whatever the capture looked like**: a vertical capture is rotated 90° to lie flat, and a red→violet capture (negative calibration slope) is flipped. Peaks/markers are positioned by **wavelength, not raw pixel**, so they line up with the chart above — which the calibration step reverses (`reverseX`) in the flipped case to match. Its `PAD_LEFT`/`PAD_RIGHT` constants are tuned to the Recharts plot area (YAxis width + margins) so the band registers under the axis; changing chart margins means changing these.

### Full report (`/report?id=…`)
A standalone, print-friendly client page built on the **same components as the wizard** so it stays consistent: calibration & blank via `SpectrumWithStrip`; calibration adds `DetectedPeaksTable`; the lamp shows the ROI box via `RoiPreview`; the standards section is the wizard's `SignalSpectraCard` rendered **`readOnly`** (non-draggable λmax). A top **"Method"** section walks the whole pixel→concentration pipeline, and every section opens with a mode-aware `Explainer`. `PrintButton` → `window.print()`; `@media print` prints on white and forces colour. The report's own light/dark toggle (`ReportThemeShell`/`ReportThemeToggle`) scopes a light OKLCH palette to the report subtree via `data-theme`, persisted in `localStorage`; printing is always forced to light.

### Derived analysis (`web/src/lib/experiment-analysis.ts`)
`deriveAnalysis` (pure) recomputes the in-memory science from the stored profiles each render — **mode-aware** (absorbance or fluorescence — see Key Domain Concepts): per-standard signal spectra, a single experiment λmax (`Experiment.lambdaMax` override else from the highest-concentration standard), each standard's signal at that λmax, the calibration curve (≥2 usable standards), and unknown concentrations (`determineConcentration`, with an `outOfRange` flag). Echoes the experiment-global `unit` and each image's resolved `imageUrl`/`croppedImageUrl`. Pinned by `web/test/experiment-analysis.test.ts`.

### Capture flow (entirely client-side)
`CaptureControls` (client) runs `analysis-client.analyzeCaptureBlob` (browser decode + ROI extract + saturation +, for the lamp, calibration + ROI crop) then writes straight to the store via `store.persistCapture` — no upload, no HTTP. `RoiBoxEditor` re-extract → `store.persistReextract`; `LaserCaptureStep` combine → `analysis-client.buildLaserCalibration` → `store.persistCapture` (role `calibration`). `web/src/lib/capture-log.ts` provides browser console timers for perf debugging.

**There is no camera in the app** — photos arrive from the OS file picker (`<input type="file">`), taken with whatever camera app the student has. This is a **known, accepted limitation**: absorbance compares intensity *across* photos, so shots taken under different auto-exposure baselines are scientifically invalid, and the app cannot enforce a focus/exposure lock over files it did not capture. The mitigations are guidance plus the **saturation % reported after every capture**; a blank exposed differently from the standards shows up as a visibly bad calibration curve. The retired phone client existed precisely to hold that lock. If in-app capture is ever revisited, the full behavioural contract — including a **`getUserMedia` path that needs no second device and no server** (hold one `MediaStream` for the whole run, `applyConstraints` manual exposure/focus/white-balance) — is specified in `docs/design_handoff_continuous_camera/`.

### Headless re-analysis (`web/src/lib/headless/` + `web/scripts/`)
The app is browser-only, but exported bundles can be **re-analysed offline in Node**, for paper figures, batch comparison of a class's submissions, or checking a student's numbers against a re-run. This adds **no second implementation of the science** — it wires the existing pieces together with a different decoder:

`store/bundle.readBundles` → `analysis/decode.node` (sharp) → `analysis/pipeline` (the same per-role rules the browser uses) → `experiment-analysis.deriveAnalysis` → `store/export-csv.buildResultsCsv`.

- **`lib/headless/analyze-bundle.ts`** — `analyzeBundleBytes(bytes, opts)` / `analyzeBundleFile(path, opts)` → per experiment: the decoded+profiled images (with per-role saturation), the refit `calibration`, the full `DerivedAnalysis`, the app's `resultsCsv`, a `profilesCsv`, and the `stored` calibration/curve for comparison. Also exports `buildProfilesCsv` (wide table: `pixel`, `wavelength_nm`, then one raw-ROI-intensity column per capture — the *input* side of the science, complementing the results CSV's derived spectra).
- **`ProfileSource`** — where the profiles come from: `original` (full photo + stored ROI; **reproduces the app's stored numbers exactly** — prefer it), `crop` (the `images/*.crop.jpg` ROI crops; use when only crops are available), or `stored` (no decoding, reuse the bundle's profiles — the control case).
  **Crop caveat:** profiles carry *absolute* image x, so a crop's pixel origin is 0 rather than `roi.left` — the fitted intercept shifts by `slope·roi.left` while the wavelengths it produces are unchanged. The crop is also a q0.9 JPEG re-encode, so values differ in the last decimals. The CLI prints this note rather than letting the two intercepts look like a disagreement.
- **CLI:** `npm run analyze -- <bundle.spectro.zip…> [--out DIR] [--source crop|original|stored] [--stored-calibration] [--quiet]`. Writes `<out>/<slug>/{results.csv,profiles.csv,summary.json}` and prints a per-experiment summary (calibration + curve side by side with the stored values, λmax, saturation warnings, unknowns).
- Pinned by `web/test/headless-bundle.test.ts`, which builds a bundle in memory from the tracked 002 fixtures (no new binaries) and asserts the golden numbers back out. Note its standards are read at the **single experiment-wide λmax** (from the strongest standard, as the wizard does), so the weak end differs slightly from `analysis.golden.test.ts`, which uses each spectrum's own λmax.

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

**Calibration peak detection** uses `SpectralConstants.calibrationSmoothingWindow = 15` plus a minimum peak separation `minSep` sized to the spectral **band** (not the raw profile length). *(`SpectralConstants.defaultSmoothingWindow = 5` is defined but **never referenced anywhere** — dead code. Non-calibration spectra are analysed unsmoothed. Don't cite it as the default in effect.)*

**Spectral-band restriction (dark-margin robustness):** Before peak selection, `candidatePeaks` restricts to the **spectral band** = the span of *bright* maxima (smoothed ≥ 22% of the value range; the dimmest real 002 line, 587 nm, sits at ~33%). This fixes a real failure: a big dark margin used to (a) inflate `profile.length` so the old `minSep = length/15` merged the 587/611.5 nm pair, and (b) inject a faint impostor that could win a near-tied collinear fit in the wrong direction, flipping calibration blue↔red. Now `minSep = round(bandWidth/15)` and margin impostors fall outside the band. Pinned by `web/test/calibration-peaks.test.ts` against `fixtures/lamp-dark-red-margin.json`.

**Collinearity-based peak SELECTION (`calibrateFromLampProfile`):** Because pixel→λ is **linear** (small-angle grating, Δpixel ∝ Δλ), the correct 5 lines are the most **collinear** subset against the known wavelengths — not the 5 brightest. The detector gathers a generous candidate set (`candidatePeaks`: local maxima with a **low 1%-of-range prominence threshold** — deliberately low so a faint-but-real line is never dropped, cluster-deduped by `minSep`, sub-pixel parabolic refinement, capped at 20) and picks the size-5 subset with the **highest R²** (trying both directions; tie-break by total prominence). The low threshold is load-bearing (a 5% cut starved the search → R²≈0.946; at 1% it nails R²≈0.9996). Falls back to the brightness detector (`detectCalibrationPeaks`) with < 5 candidates. **Raw-max snap:** peaks are *found* on the smoothed profile but *positioned* on the **raw** profile (snap to raw max within ±½ smoothing window, then sub-pixel parabola). The calibration step shows a per-peak readout (wavelength / pixel / intensity / fit-λ); peak markers are tinted by real wavelength colour via `wavelengthToRgb` (`web/src/lib/wavelength-color.ts`, CIE 1931 path). Pinned by `web/test/calibration-peaks.test.ts`.

**Expected calibration values** for the sample dataset (550 px wide):
- slope ≈ 0.59 nm/px, intercept ≈ 397 nm, R² > 0.999
- Peaks: 434.5 nm ≈ px 61, 486 nm ≈ px 153, 544 nm ≈ px 249, 587 nm ≈ px 316, 611.5 nm ≈ px 365

### Default ROI for pre-cropped images
When no ROI is set (`roi == null`), the fallback `DEFAULT_ROI` effectively uses the full image (extraction clamps to actual size) — important for pre-cropped strips (e.g. 550×60 px).

### Saturation warning
A pixel is **saturated** when any R,G,B channel ≥ 250/255. Saturated pixels clip, so measured I is artificially high and A = −log₁₀(I/I₀) artificially low/zero. `checkSaturation(raster, roi)` returns `{saturatedCount, totalCount, threshold, fraction, isSaturated}`; `CaptureControls` shows the % after every capture. **The blank uses a stricter threshold of 230** (`SpectralConstants.saturationThresholdBlank`, applied by role in `analysis-client.analyzeCaptureBlob`): phone tone mapping rolls highlights off below 255, so I₀ can be effectively clipped without any pixel reaching 250 — and a clipped blank corrupts every absorbance, so it's flagged while it still has headroom. Pinned by the saturation cases in `analysis.unit.test.ts`. Fix: reduce light, add an ND filter, or increase cuvette-to-detector distance.

## Key Domain Concepts
- **Experiment mode (absorbance vs fluorescence)**: `ExperimentMode` — `beerLambert` (default) or `fluorescence`. Calibration, ROI, the blank step, λmax, the linear fit and the unknown back-calculation are **shared**; only the per-pixel **signal** differs (`SignalMode` + `computeSignal`/`buildSignalSpectrum` in `analysis/absorbance.ts`):
  - **Absorbance** (`beerLambert`): `A = −log₁₀(I/I₀)`; λmax = max absorbance; curve `A = ε·l·c`.
  - **Fluorescence**: `F = I − I₀` (background-subtracted, clamped ≥0); λmax = max emission; curve `F = k·c`. The blank is subtracted (not divided).
  UI terminology is centralised in `experimentTerms(mode)` (`experiment-meta.ts`); the stored JSON keys (`absorbanceSpectrum`, `absorbanceAtLambdaMax`, …) are reused as the generic signal in both modes. Pinned by the fluorescence cases in `analysis.unit.test.ts` + `experiment-analysis.test.ts`.
- **Wavelength calibration**: linear fit pixel→nm from 5 known fluorescent lamp lines (434.5, 486.0, 544.0, 587.0, 611.5 nm). Stored as `slope`/`intercept`; `pixelToWavelength(px) = slope·px + intercept`. **Auto-flip:** `calibrateFromLampProfile` fits both ascending and descending and keeps the higher-R² assignment; a red→violet capture calibrates with a **negative slope**. Pinned by `web/test/flip.test.ts`.
- **Reference light**: `Experiment.lightType` supplies the known wavelengths. It is an **independent user choice on the setup form — either light can calibrate either mode** (calibration is only a pixel→nm fit, unrelated to the signal maths). `defaultLightForMode` gives the usual pairing (`beerLambert`→`fluorescent`, `fluorescence`→`laser`) and seeds the selection; once the student picks a light explicitly, changing the mode no longer moves it.
  - **`fluorescent`** (default): one lamp capture; 5 lines auto-detected by the collinearity search.
  - **`laser`**: the user enters 3 known wavelengths (R/G/B, defaults 650/532/405); each laser is captured separately (`role: "laser"`, tagged with `laserWavelength`), the three are **max-blended in the browser** into one composite stored as the `calibration` image, and the fit comes from `calibrateFromLaserProfiles` (each laser's `dominantPeak` paired with its known wavelength). Built by `analysis-client.buildLaserCalibration`; recomputed on ROI/orientation change in `reextractAll`. Pinned by `web/test/calibration-laser.test.ts`.
- **ROI**: a fixed `Rect` in image coordinates, selected once; every profile is extracted from it so measurements are comparable.
- **Intensity profile**: mean pixel intensity perpendicular to the dispersion axis → a 1-D `DataPoint(pixel, intensity)` array. Horizontal averages down columns; vertical (`Experiment.orientation`) averages across rows. Downstream is orientation-agnostic.
- **Blank (I₀)**: solvent/cuvette with no analyte — the incident light; required before absorbance.
- **Absorbance**: `A(λ) = −log₁₀(I(λ) / I₀(λ))`.
- **λmax**: wavelength of max signal, auto from the highest-concentration standard, user-adjustable by dragging the line on the spectra chart.
- **Beer-Lambert curve**: linear regression of signal@λmax vs known concentration → `A = ε·l·c`; back-calculate the unknown via `c = (A − intercept) / slope`.

## Reference Materials (`materials/` — gitignored, local-only)
Not in the repo: `materials/` was scrubbed from git history and is `.gitignore`d, so it exists
only on machines that have a local copy. Nothing in the build or test suite depends on it.
- `materials/001/a-3d-printable-modular-absorption-spectrophotometer...pdf` — primary paper (J. Chem. Ed. 2024)
- `materials/001/ed3c01021_si_001.pdf` — supporting info: parts list, lab procedure, assembly guide
- `materials/001/ed3c01021_si_004.xlsx` / `_005.xlsx` — absorbance data templates
- `materials/001/ed3c01021_si_006.xlsx` / `_007.xlsx` — fluorescence data templates
- `materials/002/` — the sample strip dataset; its tracked mirror is `web/test/fixtures/spectro-002`

## Build & Run (from `web/`)
```bash
cd web
npm install
npm run dev        # http://localhost:3000 (dev server; the app itself is static)
npm test           # vitest: analysis unit + golden-data tests
npm run typecheck  # tsc --noEmit
npm run build      # static export → out/
npm run preview    # serve the built out/ locally (npx serve out)

# offline re-analysis of an exported bundle (Node + sharp, no browser):
npm run analyze -- ../paper/resources/experiments/*.spectro.zip \
  --out ../paper/resources/experiments/analysis --source original
```
There is no database, no `.env` to configure, and no auth. Data lives in the browser's IndexedDB; use the list page's **Export/Import** to move or back up experiments.

### Deploy (deployd) — tag → GitLab CI → deployd → traefik
Managed by **deployd** (the single-VM deploy controller; app slug `spectro-app`, domain **spectro.muzoo.io**). Push a `vX.Y.Z` tag → the self-contained `build-and-push` job in `.gitlab-ci.yml` builds the root `Dockerfile` (context = repo root, `APP_VERSION=$CI_COMMIT_TAG` build-arg) and pushes `:vX.Y.Z` + `:latest` (latest = layer cache only) to the GitLab registry → the deployd-managed project webhook fires → deployd verifies tag + green pipeline + registry image via the GitLab API, then pulls `docker-compose.prod.yml` at that tag and deploys it in the **injected-variable style**: the compose file itself pins `image: …/spectro-app:${DEPLOYD_TAG}` (deployd's generated `.deployd.env` supplies `DEPLOYD_TAG` etc.; needs deployd ≥ v0.6.1) and the generated override only routes the domain (traefik) to **:80** in the container (nginx serving the static export). No `${DEPLOYD_DATA_DIR}` mounts — the app has no persistent data. The image is a **multi-stage static build**: `node` builds the export, then **nginx** (`web/nginx.conf`) serves `out/`. **No database, no migrations, no persistent volume, no env** — `docker-compose.prod.yml` is a single `app` service with no ports/labels (deployd's override handles routing). The old webhook-deploy plumbing (`docker/` + HMAC webhook CI job + `DEPLOY_WEBHOOK_*` vars) and the shared CI include (`muzoo/deployd` → `ci/deployd-build.gitlab-ci.yml`) are both retired.

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
- Run a **CVE/SAST scan before committing** — `trivy fs --scanners vuln --severity HIGH,CRITICAL web` (and optionally `semgrep scan --config auto web/src`). Two findings are known and **accepted** — `postcss@8.4.31` and a nested optional `sharp`, both exact `next`-internal pins that never execute in a static export. Do not "fix" them with npm `overrides`.
- Update `CLAUDE.md` in the same commit when domain knowledge, the data model, workflow steps, or architecture changes.
- Releases: bump `web/package.json` and **amend it into the last local (unpushed) commit** rather than adding a separate `chore(release): vX.Y.Z` commit; only add a standalone release commit when everything being released is already pushed. Then push the tag — `docs/deploy-checklist.html` is the interactive step-by-step.

## Development Notes
- The app is **client-only**: anything touching IndexedDB / `window` / canvas must run in a client component (or be guarded). Server components may only do static rendering.
- No mock databases in tests — the analysis core is pure and tested directly; the IndexedDB store is verified in a real browser.
- Run `npm run typecheck && npm test` before committing; run `npm run build` to confirm the static export still succeeds.
