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
└── docker/, .gitlab-ci.yml  # build/deploy the **web/** image (Next.js + Postgres) on vX.Y.Z tags
```

**Why:** running the full analytical workflow on a phone is awkward. The web app guides + analyses on a laptop; the phone, paired via QR, is a focus-locked camera that uploads photos. See `docs/web-refactor-plan.md` and `docs/web-ux-brief.md`. **The two apps share no code** — the web app re-ports the science (see below), it does not import Dart.

### web (foundation pass — done)
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 + **HeroUI v3**, Auth.js v5 (`next-auth@beta`) with the **Credentials provider** + `bcryptjs`, **Prisma 7** + PostgreSQL (`@prisma/adapter-pg`), `sharp`, Recharts, Vitest.
- **Theme = the "middle ground":** HeroUI components, re-skinned by overriding HeroUI's semantic CSS tokens (`--background`, `--surface`, `--accent`, …) with the design handoff's dark OKLCH palette in `web/src/app/globals.css`; the signature scientific bits (logo, spectrum bar, ConnBadge, StatusChip, Readout) are ported primitives in `web/src/components/ui/primitives.tsx`. Dark-only (`.dark` always on `<html>`) — an experimental requirement.
- **Analysis core:** `web/src/lib/analysis/` is a faithful TS port of `mobile/lib/core` behind one module seam (swappable for a Python sidecar later). Pinned by `web/test/analysis.{unit,golden}.test.ts` against the `materials/002` 550×60 dataset.
  - **Decoder caveat:** the web port decodes with `sharp().rotate()` (EXIF auto-orient) to match the Dart `image` package — omitting `.rotate()` mirrors the spectrum (wavelength axis reversed). With the collinearity-based peak selection (see below) the web calibration now recovers all five lamp lines and matches the Dart reference: on the 002 lamp image slope≈0.582 nm/px, intercept≈397.9, **R²≈0.9998**, peaks≈[63,151,254,325,366] (the earlier slope≈0.477/R²≈0.946 was a starved-candidate artefact, not a decoder limit). The golden test pins the **decoder-robust science** (λmax≈627 nm for the blue dye, absorbance rising with concentration, Beer-Lambert R²>0.99) and the calibration snapshot anchors.
  - **Compute now runs in the laptop BROWSER (client-authoritative).** The pixel-heavy work — decode, ROI profile extraction, orientation (column-vs-row averaging), saturation, calibration fit, and the ROI **crop** — is computed in the browser via `web/src/lib/analysis-client.ts` (which decodes with `decodeImageBrowser` in `analysis/decode.client.ts`: `createImageBitmap({imageOrientation:"from-image"})` → canvas `getImageData` → the same RGB `RasterImage` the pure core consumes). The pure core (`image/math/calibration/absorbance`) is unchanged and runs in both places; only `analysis/decode.ts` (sharp) stays server-only. The browser decode differs slightly from sharp at the sub-pixel level — per the **client-is-authoritative** decision the browser result is the source of truth, so persisted profiles/calibration may shift a little vs the sharp-based golden numbers (the golden test still pins the sharp pure-core path; the browser glue is verified in a real browser). **Why:** the server (a small VPS) was slow doing serial sharp decodes on every ROI/orientation change; moving pixel work to the browser makes the toggle instant.
- **Data model:** `web/prisma/schema.prisma` — `User` (with `passwordHash`) + `PasswordResetToken` + a spectro domain that ports `project.dart`. The shared two-device unit is `Experiment`; it owns pairing/step state, `roi`, `calibration` (Json), `lightType` (`fluorescent`|`laser`) + `laserWavelengths` (Json `[r,g,b]`, laser mode only), and `SpectralImage`/`Standard`/`Unknown` rows. `SpectralImage.role` adds `laser` (the individual laser-line captures, tagged with `laserWavelength`) alongside `calibration`/`blank`/`standard`/`unknown`. **No Auth.js adapter tables** (Account/Session/VerificationToken) — sessions are stateless JWTs. **Migrations live in `web/prisma/migrations/`** (baseline `init`); prod runs `prisma migrate deploy`, dev runs `prisma migrate dev`.
  - **Every computed step is persisted ("store every computed step").** Beyond the full image (disk), `roi`/`orientation` and per-image `intensityProfile`, the **derived** science is now written too (by `persistDerived` in `capture.ts`): `Experiment.calibrationCurve` (Json: slope/intercept/rSquared/lambdaMax/dataPoints), each `Standard.absorbanceSpectrum`, each `Unknown.absorbanceSpectrum`/`absorbanceAtLambdaMax`/`determinedConcentration`. The wizard still **recomputes** the same values via `deriveAnalysis` for display (single source of truth, no drift since it reads the same profiles); the persisted copy is the durable record for report/export. The browser-rendered ROI **crop** is stored on disk under `croppedKey(imageId)` (`storage.ts`). `Experiment.lambdaMax` is unchanged (the user override; null → auto-derive).
- **Auth:** **email + password** via the Auth.js **Credentials** provider, hashed with `bcryptjs` (`web/src/lib/password.ts`), **JWT sessions** (`strategy: "jwt"`, `trustHost: true`; Credentials can't use database sessions). The user id is carried on the token and re-exposed as `session.user.id` by the `jwt`+`session` callbacks in `auth.ts`, so `requireUser()` / `requireUserId()` (`web/src/auth-helpers.ts`) and all owner-scoped queries are unchanged. Flow pages: `/login`, `/register` (immediate sign-in, no email verification), `/forgot-password` + `/reset-password?token=…` (single-use hashed token, 1 h TTL, `web/src/lib/auth-tokens.ts`). **Email is used only for the reset link** (`web/src/lib/mail.ts`, Nodemailer over `EMAIL_SERVER`); magic-link/Google are gone.
- **Guided wizard (in progress):** the laptop flow L0 → L1 → L2 is built.
  - `L0` `/experiments` — list/create/delete experiments (server component + server actions).
  - `L1` `/experiments/new` — setup form: name + **a single experiment-mode choice** (client `NewExperimentForm` via `useActionState`); on submit `createExperimentAction` mints a join token and redirects to pairing. **Mode and reference light are paired 1:1, so the form is one choice, not two** — `createExperimentAction` derives `lightType` from the mode via `lightForMode` (`beerLambert`→`fluorescent`, `fluorescence`→`laser`); the fluorescence/laser case still surfaces the three R/G/B wavelength inputs. **Why:** two independent pickers produced 4 combinations, two of which are physically odd (a single-wavelength laser can't sweep an absorbance spectrum; a broadband lamp is a poor fluorescence exciter), and the duplicate "fluorescent" wording (mode *Fluorescence quantitation* vs light *Fluorescent lamp*) led users to pick the lamp and stay in Beer-Lambert. `lightType` remains a stored field because the calibration code genuinely branches on it — it's just no longer an independent user choice.
  - `L2` `/experiments/[id]/pair` — pairing screen; server-renders a QR (the `qrcode` lib) encoding a `spectro://join?e=<id>&t=<token>` deep link plus a short manual join code; 30-min token TTL with a regenerate action.
  - `L3` `/experiments/[id]` — wizard **shell** (persistent frame: `StepRail` + `GuidancePanel` + per-step canvas + `WizardNav` Back/Continue). It loads the experiment + images/standards/unknowns and renders the canvas for `currentStep`; step navigation + the Continue gate are server actions (`web/src/app/experiments/[id]/actions.ts`). **All 6 step canvases are built (L3.4 now merges the standards capture with the signal-review charts, so the graph builds live as standards are added):** **L3.1 camera/ROI** (`RoiStep` → `RoiBoxEditor` — captures the **lamp first** (you can't mark a region without seeing the strip); `RoiBoxEditor` (client) now owns the **horizontal/vertical orientation** toggle (`Experiment.orientation`) + **drag a box** over the image (mouse + touch, pointer events; box stored in image px) + "Use full strip" + a `<canvas>` "Region used for analysis" preview drawn from the loaded image (no server crop fetch). **Orientation is auto-detected from the ROI's colour gradient** (client-side, live as you draw/adjust the box): `scoreOrientation` (`analysis/image.ts`, pure) runs a one-way ANOVA on the ROI's RGB pixels — η²_horizontal = between-column variance / total, η²_vertical = between-row variance / total (subsampled to ~40k px so cost is image-size-independent). The larger η² is the suggested axis; its value (0..1) doubles as a **"Region clarity" goodness %** — how uniform the colour is along each line perpendicular to the dispersion axis (clean strip ≈ all colour variance along one axis, ~none across its width). Direction (red→blue vs blue→red) is irrelevant — calibration auto-flips. The chip **auto-follows** the detection while a box is adjusted (confident gate: goodness ≥ 0.35, margin ≥ 0.05) but **manual selection sticks** (clicking a chip stops auto-follow + commits; a "↺ Auto-detect" link re-enables); auto-changes persist only on **Save region** (like the box). Client glue: `analysis-client.suggestOrientation(url, roi)` (cached decode → `scoreOrientation`); pinned by `web/test/orientation.test.ts`. Changing the ROI *or* orientation re-extracts **in the browser** (`analysis-client.reextractAll`: decode every stored image, re-extract its profile + crop, recompute calibration) then POSTs to the Route Handler `POST …/reextract` (DB + crop storage only — no server-side sharp). This replaced the old server-side `reextractExperiment` for the web path and is what makes the toggle instant), **L3.2 calibration** (`CalibrationStep` — lamp → peaks/slope/intercept/R² + `SpectrumChart` w/ peak markers + fit verdict + `AlignedLampStrip`: the cropped lamp strip drawn under the chart with the detected peaks overlaid, so you can see each peak sits on a real emission line. It is a **client `<canvas>` component** that always renders a **horizontal band oriented blue (short λ) → red (long λ), left→right**: a **vertical** capture is rotated 90° to lie flat (CCW if λ ascends with pixel, CW if not), and a **negative-slope** (red→violet) capture is flipped, so blue always ends on the left. Peak dashes are positioned by **pixel position** (mirrored when the image is flipped), NOT by wavelength — so each dash sits on the *actual* emission line in the image (the calibration is a fit, so wavelength↔pixel isn't exact) and lines up with the chart above, which also plots peaks by pixel. A small nm axis labels the ends (blue ← left, red → right). To keep the chart aligned, `SpectrumChart` takes a `reverseX` prop (XAxis `reversed`) that the calibration step/report set when `slope < 0`, and the strip is embedded **inside the chart card** (`bare` prop) directly under the pixel axis with matching plot-area padding (PAD_LEFT 50 = YAxis width 46 + left margin 4, PAD_RIGHT 18 = right margin) so the dashes line up vertically). The chart+strip card is the shared **`SpectrumWithStrip`** component (profile chart with colour-coded calibration wavelengths + `reverseX` flip + embedded cropped strip), reused by the blank step, **L3.3 blank** (`BlankStep` — the I₀ profile shown via `SpectrumWithStrip` too: same calibration-style view with the blue→red spectrum strip under the pixel axis and the auto-flip, so I₀ reads consistently with the lamp; falls back to a plain chart if no calibration yet), **L3.4 standards + signal review (merged)** (`StandardsStep` — add (concentration+unit+capture) / list (with A@λmax) / delete, **plus the live charts that used to be a separate `absorbanceReview` step**: as soon as the first standard yields a spectrum it renders the `AbsorbanceChart` overlay + λmax marker + `LambdaMaxControl` (`setLambdaMaxAction`), with **each standard's cropped strip embedded under the spectra chart** (one `AlignedLampStrip` per standard — blue→red, calibration peaks overlaid, labelled by concentration in the matching series colour; same plot-area alignment as the calibration/blank `SpectrumWithStrip`, fed the lamp profile's pixel domain via the page's `stripDomain`), and once ≥2 standards are measurable the `CalibrationCurveChart` scatter+fit + R²/slope Readouts appear too. **Gate is now `derived.curve`** (≥2 *usable* standards, not just ≥2 rows). The `absorbanceReview` `WorkflowStep` enum value is **retired from the rail** (`WORKFLOW_STEPS` drops it) but kept in the Prisma enum for legacy rows — the wizard page **redirects `currentStep === "absorbanceReview"` → `standards`**, same as it maps `experimentSetup` → `cameraRoiSetup`. The old `absorbance-review-step.tsx` was deleted; `AbsorbanceReviewStep` no longer exists.), **L3.5 unknown** (`UnknownStep` — capture → A@λmax + concentration Readout + out-of-range warn + unknown plotted on the curve), **L3.6 results** (`ResultsStep` — summary Readouts + data table + **CSV export**, and links to the **full report**). `ComingSoonStep` remains only as a defensive default.
  - **Full report** `/experiments/[id]/report` (standalone, print-friendly page): assembles the captures + **every plot** + all Readouts + the data table, built on the **same components as the wizard** so it looks consistent — the calibration & blank sections use `SpectrumWithStrip` (blue→red strip under the axis, `reverseX` flip, colour-coded peaks) and the calibration section adds the shared `DetectedPeaksTable` (wavelength/pixel/intensity/fit-λ); the lamp still shows the ROI box via `RoiPreview`; unknown absorbance plots tint the λmax marker by wavelength. `PrintButton` → `window.print()` (Save as PDF); `@media print` in globals.css hides `.no-print` chrome and forces colour. Reuses the chart components + `deriveAnalysis`.
  - **Derived analysis** `web/src/lib/experiment-analysis.ts` (`deriveAnalysis`, pure): recomputes the in-memory science from stored profiles each render — **mode-aware** (absorbance or fluorescence — see Key Domain Concepts): per-standard signal spectra, a **single experiment λmax** (`Experiment.lambdaMax` override, else from the highest-concentration standard), each standard's signal at that shared λmax, the calibration curve (≥2 standards), and unknown concentrations (`determineConcentration`, with an `outOfRange` flag). Pinned by `web/test/experiment-analysis.test.ts`. Prisma-`Json` parsers centralised in `web/src/lib/experiment-json.ts`.
  - **Route handlers live under `web/src/app/api/experiments/[id]/…`** (NOT under the page path): `images/[imageId]` (owner-scoped blob serve), `images/[imageId]/cropped` (the image **cropped to the ROI** — now serves the **browser-rendered crop** stored under `croppedKey(imageId)`; falls back to an on-demand sharp `.rotate()` + `.extract()` (same `roiPixelBounds`) only for images with no stored crop, e.g. phone-pipeline captures; `?v=updatedAt` busts cache on ROI change), `export.csv` (results CSV), and the **session-authed upload endpoints `capture` + `reextract`** (the laptop's analysed-capture upload + ROI re-extraction — Route Handlers, not Server Actions, to dodge Cloudflare's CVE-2025-55183 WAF rule; see the capture-pipeline note for why). L3.1 shows a "Region used for analysis" cropped preview and the report shows cropped strips — so a mis-selected ROI is visually obvious. The capture image `url` and the Results download link both point at `/api/experiments/[id]/…` — keep routes and URLs in sync. Charts: `web/src/components/charts/` — `SpectrumChart` (line), `AbsorbanceChart` (multi-line overlay), `CalibrationCurveChart` (Recharts `ComposedChart` scatter + regression line).
  - End-to-end verified through the real pipeline (cal+blank+5 standards+unknown fixtures): calibration slope≈0.582/R²≈0.9998, Beer-Lambert R²≈0.997, unknown back-calculated in range, CSV + image routes 200.
- **Cross-device realtime loop (built):** the laptop drives, the phone reacts — over **SSE + an in-process event bus** (`web/src/lib/realtime.ts`; single-instance only — swap for Postgres LISTEN/NOTIFY or Redis to scale).
  - **Routes:** `GET /api/experiments/[id]/events` (SSE; laptop authed by session, phone by `?token=` join token — phone's open connection is the presence signal), `POST /api/experiments/[id]/captures` (token-authed multipart → `processCapture` → clears `pendingCapture` → publishes `captured`). Events: `hello`/`phone-online`/`phone-offline`/`pending`/`captured`/`step`.
  - **Laptop drives via `pendingCapture`** (Json on Experiment): `requestCaptureAction` sets `{role,label,concentration?,unit?}` (parsed by `parseCaptureRequest`) + publishes `pending`; `cancelCaptureAction` clears it. The wizard's `CaptureControls` (replaces the old CapturePanel) offers "Request capture on phone" when paired and an upload fallback always; shows a waiting state while a request is outstanding. `WizardLive`/`PairingLive` (client, via `useExperimentEvents` SSE hook) drive the live connection badge + auto-refresh/auto-advance.
  - **Phone client = a web page** `/join/[token]` (`getExperimentByTokenOnly` — token is the only key, no user session): joins over SSE, shows the requested capture, opens the camera (`<input capture="environment">`), uploads. The L2 QR now encodes the absolute `…/join/<token>` URL (scannable by any phone camera). This is the testable client + fallback; the **native Flutter camera app is still TODO** and would hit the same routes.
  - Verified end-to-end against the dev server: SSE auth (cookie/token/401), phone presence reaching the laptop, token-authed capture running the pipeline + notifying the laptop, wrong-token rejection, `pendingCapture` cleared.
  - **Capture pipeline** (`web/src/lib/capture.ts`, server-only) is now **persistence-only on the web path** (no image decode): `storeCapture` saves the full image + browser-rendered crop bytes + profile, persists calibration, and creates the role row; `persistClientCapture` wraps it for the web upload and calls `persistDerived`; `persistClientReextract` commits a browser re-extraction (profiles + crops + calibration). The **web upload** flow: `CaptureControls` (client) runs `analyzeCaptureBlob` (browser decode + extract + calibrate + crop) then **`fetch`-POSTs bytes+JSON to the Route Handler `POST /api/experiments/[id]/capture`** (session-authed; the ROI re-extract uses `POST …/reextract`). **These uploads go through Route Handlers, NOT Server Actions, on purpose:** the big JSON-laden multipart upload is a React Server *Function* call, and Cloudflare's managed WAF rule for **CVE-2025-55183 ("React — Leaking Server Functions")** false-positives on it and **403s the upload at the edge** (works locally with no proxy, "sticks" in prod behind Cloudflare). A plain HTTP endpoint carries no `Next-Action` header / RSC-encoded args, so that rule doesn't apply. (Our React/Next are already past the CVE fix — react ≥ 19.2.4; Next 16 bundles a 2026 RSC runtime — so this is purely to stop tripping the edge rule, plus it buys real HTTP status codes + proper error surfacing.) The shared persistence body lives in `web/src/lib/capture-form.ts` (`persistCaptureForm`/`persistReextractForm`); the legacy `persistCaptureAction`/`persistReextractAction` Server Actions remain as a deploy-skew fallback. Client transport + graceful HTML-403 handling: `web/src/lib/capture-upload.ts` (`uploadCapture`/`uploadReextract`). **The 1-D intensity profile is transported in a compact packed form** (`web/src/lib/profile-codec.ts`: `packProfile`/`unpackProfile`/`decodeProfile`) — `extractIntensityProfile` emits one `{x,y}` per pixel along the dispersion axis, so for a full-res phone photo the raw `{x,y}[]` JSON is hundreds of KB (the bulk of the `_1_profile` server-action field). The codec drops the redundant `x` (sequential index from `x0`) and quantises `y` to integers at 1e-6 (`{x0,s,y:[…]}`), ~6× smaller; the server **expands it back to `DataPoint[]` before storing**, so the persisted shape + every reader are unchanged. Used by all three producers (`CaptureControls`, `LaserCaptureStep`, `RoiBoxEditor` re-extract) and decoded by the capture/reextract Route Handlers (via `capture-form`, which also accept a legacy raw array across deploy skew). Pinned by `web/test/profile-codec.test.ts`. `processCapture` (sharp decode + extract here) is **retained only for the phone `/captures` route** (raw photo, no precomputed profile) as the structural stop-gap until the phone relays to the browser; it shares `storeCapture`. Binaries on disk (`web/src/lib/storage.ts` → `web/storage/`; crops under `croppedKey(id)`), served owner-scoped via `GET /api/experiments/[id]/images/[imageId]`. The pure-core path is still pinned by the golden test (sharp): lamp fixture → slope≈0.582, intercept≈397.9, R²≈0.9998, peaks≈[63,151,254,325,366].
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

**Calibration peak detection:** Uses `SpectralConstants.calibrationSmoothingWindow = 15` (vs `defaultSmoothingWindow = 5`) to merge JPEG sub-peaks within the same emission band, plus a minimum peak separation (`minSep`) to prevent multiple sub-peaks of one emission line from all being selected while still resolving the closely-spaced 587 nm / 611.5 nm pair (~40 px on the 550 px golden image). **`minSep` is sized to the spectral BAND, not the raw profile length** — see the dark-margin note below.

**Spectral-band restriction (dark-margin robustness):** Before peak selection, `candidatePeaks` restricts to the **spectral band** = the span of *bright* maxima (smoothed value ≥ 22% of the value range; the golden 002 dimmest real line, 587 nm, sits at ~33%, so every real line is kept with margin). This fixes a real failure: **a big dark region on one side of the strip** (e.g. the ROI extends well past the red end) used to (a) inflate `profile.length`, which inflated the old `minSep = profile.length/15` *past* the 587/611.5 nm pixel gap so the two were **merged** into one peak, and (b) inject a faint impostor maximum out in the dark margin that could win a near-tied collinear fit in the **wrong direction**, flipping the whole calibration (and the rendered strip) blue↔red — symptom: slope sign flips between two captures of the same setup (+0.30 vs −0.35). Now `minSep = round(bandWidth/15)` tracks the real line spacing and dark-margin impostors fall outside the band. Pinned by `web/test/calibration-peaks.test.ts` against `fixtures/lamp-dark-red-margin.json` (a real capture that exhibited the flip).

**Collinearity-based peak SELECTION (calibrateFromLampProfile):** Because pixel→λ is **linear** (small-angle grating `y = (nL/d)·λ`, so Δpixel ∝ Δλ), the *correct* 5 lines are the most **collinear** subset against the known wavelengths — not the 5 brightest. The old "pick 5 brightest, assign positionally" dropped a faint line (violet 434.5 / a decoder-blurred 486) and let an impostor mislabel everything (symptom: pixel gaps not proportional to wavelength gaps). The detector gathers a generous candidate set (`candidatePeaks`: local maxima with a **low 1%-of-range prominence threshold** — deliberately low so a faint-but-real line is never dropped, since the search rejects impostors — cluster-deduped by minSep, **sub-pixel parabolic refinement**, capped at 20 strongest) and picks the size-5 subset with the **highest R²** (trying both wavelength directions; tie-break by total prominence) via `combinations`. **The low threshold is load-bearing:** a 5% cut left only 5 candidates (one a noise bump), starving the search → R²≈0.946 on 002 and a mis-located violet line on real high-res captures; at 1% the real line reappears and the search nails R²≈0.9996. Robust to faint/missing lines and bright impostors. Falls back to the old brightness detector (`detectCalibrationPeaks`, still exported) when there are fewer than 5 candidates. **Raw-max snap:** peaks are *found* on the smoothed profile (robust) but their *position* is set on the **raw** profile — each is snapped to the raw maximum within ±½ the smoothing window then sub-pixel parabola-refined (`snapToRawMax`/`refinePeak`). The 15-px smoothing biases the argmax a few px off the visible spike; snapping lands the marker on the bright pixel (the profile is already ROI-averaged, so the raw peak is low-noise). Pinned by `web/test/calibration-peaks.test.ts` (synthetic: recovers 5 collinear lines, rejects a brighter impostor, R²>0.999; flipped capture → negative slope; **real dark-red-margin capture → correct negative slope, 587/611.5 pair not merged**). Runs in the **browser** on the web path (same pure core via `analysis-client`), so an existing experiment must re-capture the lamp or change ROI/orientation to recompute. **The calibration step shows a per-peak readout** (`CalibrationStep`): the `SpectrumChart` draws a dot on the curve at each peak (`PeakMarker.y`) plus a table of **wavelength / pixel / intensity / fit-λ** so a mis-located peak is visible (intensity should be near a local max; fit-λ should be near the known wavelength). **Peak markers are tinted by their real wavelength colour** (violet 434.5 → red 611.5) via `wavelengthToRgb` (`web/src/lib/wavelength-color.ts`) — the chart dashes/dots, the lamp-strip dashes, and a swatch in the table all use it. It uses the **standard CIE path** (CIE 1931 CMFs via Wyman/Sloan/Shirley's analytic fit → XYZ → linear sRGB → gamut-clamp → normalise → sRGB gamma), not the cruder Bruton piecewise hack — so out-of-gamut spectral colours clamp correctly (e.g. 611.5 nm → pure red, where Bruton gave amber).

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
- **Experiment mode (absorbance vs fluorescence)**: `ExperimentMode` on the experiment — `beerLambert` (default) or `fluorescence`. **Calibration, ROI, the blank step, λmax detection, the linear curve fit and the unknown back-calculation are shared**; only the per-pixel **signal** differs. The core abstracts this as `SignalMode` + `computeSignal(sample, blank, mode)` / `buildSignalSpectrum(...)` (`web/src/lib/analysis/absorbance.ts`):
  - **Absorbance** (`beerLambert`): `A = −log₁₀(I/I₀)`; λmax = max absorbance; curve `A = ε·l·c`.
  - **Fluorescence**: `F = I − I₀` (background-subtracted emission, clamped ≥0 — a *difference*, not a log ratio); λmax = max emission intensity; curve `F = k·c`. The blank step (still labelled **Blank** in both modes) is reused as a background capture that is subtracted (not divided).
  `deriveAnalysis` takes `mode` and threads it through; `signalMode(ExperimentMode)` maps to the core `SignalMode`. The persisted Json keys are unchanged (`Standard.absorbanceSpectrum`, `Unknown.absorbanceAtLambdaMax`, …) and reused as the generic signal in both modes. UI terminology is centralised in `experimentTerms(mode)` (`experiment-meta.ts`: signal name/symbol, "Blank (I₀)" vs "Blank", "Absorbance review" vs "Emission review", `Beer-Lambert` vs `Calibration` curve), plus `stepLabel`/`stepShort`/`stepGuidance(step, mode)`; charts take a `yLabel` prop. Pinned by the fluorescence cases in `web/test/analysis.unit.test.ts` + `web/test/experiment-analysis.test.ts`.
- **Wavelength calibration**: Linear fit of pixel position → wavelength (nm) using 5 known fluorescent lamp emission peaks: 434.5, 486.0, 544.0, 587.0, 611.5 nm. Stored as `slope` and `intercept` in `Calibration`; `pixelToWavelength(pixel) = slope * pixel + intercept`. **Auto-flip:** `calibrateFromLampProfile` doesn't assume the strip runs violet→red — it fits the known wavelengths both ascending and descending against the detected peaks and keeps the higher-R² assignment (the lamp lines are asymmetrically spaced, so the right direction fits markedly better). A red→violet capture calibrates correctly with a **negative slope** (handled transparently by `pixelToWavelength`); the calibration step flags it ("Auto-flipped"). Pinned by `web/test/flip.test.ts`.
- **Reference light (calibration source)**: `Experiment.lightType` (`ReferenceLight`) is what supplies the known wavelengths for the pixel→λ fit. **It is paired one-to-one with the experiment mode and is no longer a separate user choice** — the setup form derives it from the mode (`lightForMode`: `beerLambert`→`fluorescent`, `fluorescence`→`laser`). It stays a stored DB field because the calibration code branches on it (lamp collinearity vs 3-laser fit). Two options:
  - **`fluorescent`** (default): one lamp capture; the 5 known emission lines are auto-detected by the collinearity search (`calibrateFromLampProfile`).
  - **`laser`**: the user enters three known wavelengths up front (red/green/blue, defaults 650/532/405 nm, stored in `Experiment.laserWavelengths` as `[r,g,b]`). Each laser is captured **separately** as a single bright line (a `SpectralImage` with `role: "laser"` tagged with `laserWavelength`). The three are **max-blended (overlay) in the browser into one composite image**, stored as the single `role: "calibration"` image (so the ROI editor, calibration step and report use it unchanged). Calibration is fit by `calibrateFromLaserProfiles` — find each laser image's `dominantPeak` and pair it directly with its known wavelength (no collinearity/flip search needed; a red→blue layout just fits a negative slope). The composite + fit are built by `analysis-client.buildLaserCalibration` and persisted via the **existing** capture upload endpoint (role calibration); a ROI/orientation change recomputes the laser fit in `reextractAll` (`lightType === "laser"` branch). UI: L1 form shows 3 nm inputs; L3.1 `RoiStep` renders `LaserCaptureStep` (3 slots + "Combine the three captures") before the ROI editor; light-aware copy via `experimentPeaks` + `stepGuidance(step, mode, light)`. Pinned by `web/test/calibration-laser.test.ts`.
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
docker compose up -d         # Postgres + Mailpit (dev inbox at :8025 — reset emails)
cp .env.example .env         # then: npx auth secret  → AUTH_SECRET
npm run prisma:migrate       # applies prisma/migrations (creates them in dev)
npm run dev                  # http://localhost:3000 (runs `prisma generate` first)
npm test                     # vitest: analysis unit + golden-data tests
```
> **Schema-change gotcha:** the Prisma client is cached in the running `next dev`
> process, so after editing `schema.prisma` (+ a migration) you must **restart the
> dev server** — a mid-session `prisma generate` won't hot-reload, and writes to
> the new column fail with `Unknown argument`. The `dev` script regenerates on
> start, so a restart is always sufficient.

### Deploy (Docker, web/) — tag → GitLab CI → webhook → server
Release flow (unchanged shape, now ships **web/** not Flutter): push a `vX.Y.Z`
tag → `.gitlab-ci.yml` builds `web/Dockerfile` (context `web`) + pushes to the
GitLab registry → HMAC webhook → the server's `docker/cron-deploy.sh` (cron)
pulls the new tag and runs `docker compose up -d`. The image is Next.js
**standalone**; its entrypoint (`web/docker-entrypoint.sh`) runs **`prisma
migrate deploy`** on boot, then serves on **:3000** behind nginx-proxy.
- **`docker/docker-compose.yml`** runs two services: `db` (postgres:17, `pgdata`
  volume) + `app` (image, `uploads:/data/uploads` volume, `VIRTUAL_PORT=3000`).
  The `docker/` folder is **rsync'd** to the server; `.env` is **server-managed**
  (keep it out of the sync) and supplies every `${VAR}` — see `docker/.env.example`.
  - **Upload-size gotcha:** captures POST the full multi-MB photo (+ crop blob +
    profile JSON) through a server action. `web/next.config.ts` raises the
    server-action `bodySizeLimit` to `12mb`, but **nginx-proxy** defaults
    `client_max_body_size` to **1 MB** and 413s the upload before it reaches the
    app — so it works locally (no proxy) yet "sticks" in prod. The app service
    sets `CLIENT_MAX_BODY_SIZE` (default `16m`, headroom over the 12mb action cap)
    which nginx-proxy reads per-vhost. Keep it ≥ the Next bodySizeLimit.
- **Server setup checklist:** DNS A-record; nginx-proxy + acme-companion on an
  external `nginx-proxy` network (`docker network create nginx-proxy`); a deploy
  dir holding the synced compose + `.env` with `POSTGRES_*` / `DATABASE_URL`
  (host `db`) / `AUTH_SECRET` (`openssl rand -base64 33`) / `AUTH_URL=https://…`
  / **real SMTP** `EMAIL_SERVER`+`EMAIL_FROM` (password reset) / `VIRTUAL_HOST` /
  `LETSENCRYPT_HOST` / `SPECTRO_APP_IMAGE`; `docker login` to the registry (deploy
  token) for cron pulls; `cron-deploy.sh` in crontab; GitLab CI vars
  `DEPLOY_WEBHOOK_SECRET` + `DEPLOY_WEBHOOK_URL`; back up the `pgdata` volume.
- **`docker/deploy.sh`** is a manual SSH fallback (build → save → load → compose up).

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
