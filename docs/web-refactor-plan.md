# Spectro Web — Refactor & Design Plan

> **Purpose of this document**
> The current Spectro app is a Flutter mobile app. Running the full analytical workflow on a small phone screen is awkward. This document plans a **web-first refactor**: the *thinking, guiding, and analysis* happen on a large screen (laptop/tablet browser), and the **phone is used only as a camera**. The two devices are paired into one shared session via a QR code.
>
> This is a **planning / design document**, not an implementation. Use it as the brief to decide the final design (e.g. in Claude design / artifacts) before any code is written. Decisions still open are collected in [§12 Open Design Questions](#12-open-design-questions).

---

## 1. Vision in one paragraph

A student opens **Spectro Web** on a laptop. They pick an *experiment mode* and the *reference light type*, then the web app walks them through the spectrophotometry workflow **one guided step at a time**, explaining the *why* behind each step. When a step needs a photo (blank, calibration lamp, a standard, the unknown), the web screen shows a **QR code**. The student scans it with the **native Spectro phone app**, which joins the **same session**. The phone keeps its hardware **focus/exposure lock**, frames the spectral strip, captures, and uploads the photo. Within a second the web app shows the extracted spectrum, lets the student confirm/adjust the ROI and results, explains what was learned, and advances to the next step. The phone is a dedicated camera; **all guidance, analysis, charts, and export live on the web.**

```
┌──────────────────────────┐         shared session          ┌──────────────────────────┐
│   LAPTOP  (Spectro Web)   │ ◀──────  realtime sync  ──────▶ │  PHONE (native app)        │
│  • guidance + explanations│                                 │  • scan QR → join session  │
│  • ROI selection          │   QR encodes session join URL   │  • focus/exposure LOCK     │
│  • charts, results, export│ ──────────────────────────────▶ │  • frame + capture + upload│
│  • runs the analysis      │                                 │  (no analysis here)        │
└──────────────────────────┘                                 └──────────────────────────┘
```

---

## 2. What we are keeping (the science is already correct)

The Flutter app's **domain logic is the asset worth preserving**. It is well-tested and documented. The refactor is about *moving the workflow/analysis UI to the web while keeping the native app as a focus-locked camera*, **not** re-deriving the science. The algorithms to carry over verbatim (see [§8](#8-core-algorithms-to-port-source-of-truth)):

| Concern | Current Dart location | Notes |
|---|---|---|
| sRGB → linear gamma | `image_processing.dart › _srgbToLinear` | Must run in *linear light* before any ratio |
| Intensity profile (ROI → 1-D) | `image_processing.dart › extractIntensityProfile` | Luminance vs max-channel modes |
| Saturation check | `image_processing.dart › checkSaturation` | ≥250/255 on any channel |
| Moving average | `math_utils.dart › movingAverage` | Smoothing before peak detection |
| Local maxima / prominence | `math_utils.dart › findLocalMaxima` | Calibration peak auto-detect |
| Linear regression (OLS + R²) | `math_utils.dart › linearRegression` | Used for both pixel→λ and Beer-Lambert |
| Absorbance `A = −log₁₀(I/I₀)` | `absorbance_spectra_screen.dart › _computeAbsorbance` | Per-pixel against blank |
| λmax detection + curve build | `absorbance_spectra_screen.dart` | A@λmax vs concentration |

These are **not heavy algorithms** — they are column averages, a few passes over a 1-D array, and two least-squares fits. This fact drives the architecture decision in [§5](#5-key-decision-where-does-image-processing-run).

---

## 3. Workflow mapping (mobile steps → web-guided flow)

The existing 5-step workflow (`WorkflowStep` enum) is preserved, but **reframed as a guided wizard** and extended with two up-front choices the user asked for.

| New web step | From current app | Photo needed? | What the web guides / explains |
|---|---|---|---|
| **0. Experiment setup** *(new)* | — | No | Choose **experiment mode** (e.g. Beer-Lambert quantitation) and **reference light type** (e.g. fluorescent lamp for calibration). Sets defaults: lamp peak set, units, expected ranges. |
| **1. Camera + ROI setup** | `setup` | Yes (live framing) | Explain framing the spectral strip; lock focus/exposure on phone; **draw ROI on the web** over a still frame. |
| **2. Wavelength calibration** | `calibration` | Yes (lamp) | Capture lamp; auto-detect 5 peaks (max-channel); fit pixel→λ; show R² and explain calibration. |
| **3a. Blank (I₀)** | `references › blank` | Yes (blank) | Explain I₀ as the incident-light reference; capture solvent/cuvette. |
| **3b. Standards** | `references › standards` | Yes (≥2) | Capture ≥2 known concentrations; explain why a curve needs multiple points. |
| **3c. Absorbance review** | `absorbance_analysis` (interstitial) | No | Pure computation. Confirm/adjust λmax by tapping the chart; show Beer-Lambert curve + R². |
| **4. Unknown** | `unknown` | Yes (unknown) | Capture unknown; back-calculate concentration `c = (A − b)/m`. |
| **5. Results & export** | `results` | No | Summary charts, data table, CSV download / share. |

**Per-step explanation pattern** (the "guide" the user asked for): every step shows a short *Why this step matters* panel (mirrors the existing `info_card.dart` content), a *What to do* checklist, and *What we measured* after the photo returns.

---

## 4. System architecture

Three logical pieces, regardless of where the line between them is drawn:

1. **Web app (the brain)** — guidance UI, ROI selection, charts, results, export. Holds session state. Target stack: **Next.js (React)** per the decision in [§6](#6-technology-stack).
2. **Phone camera client (the lens)** — the **existing native Flutter app, stripped to a camera role**. Scans QR → joins session → locks focus/exposure → captures → uploads. Deliberately minimal; reuses the app's proven camera + focus-lock code, drops the on-phone workflow/analysis UI.
3. **Analysis core (the math)** — the ported domain algorithms from [§2](#2-what-we-are-keeping-the-science-is-already-correct). *Where this runs is the central decision* — see [§5](#5-key-decision-where-does-image-processing-run).

### 4.1 Session linking via QR (the pairing model)

```
Laptop                         Server                  Phone (native app)
  │  create session            │                               │
  │ ─────────────────────────▶ │  session {id, joinToken}      │
  │  show QR(deep-link+token)   │                               │
  │                            │     scan QR (in-app) ────────▶ │ deep-link → join
  │                            │ ◀──── join(token) ──────────── │
  │ ◀─ "phone connected" ───── │ ───── "you're in" ──────────▶ │
  │                            │                               │
  │  step needs photo:         │                               │
  │  "capture blank" ────────▶ │ ──── prompt: capture blank ─▶ │ show capture UI
  │                            │ ◀──── upload(image) ────────── │ focus-lock + shutter
  │ ◀─ image ready + spectrum ─│  (core runs here)             │
```

- A **session** is the unit both devices share — analogous to today's `Project`. It carries `mode`, `lightType`, `roi`, `calibration`, `blank`, `standards[]`, `unknowns[]`, plus a `currentStep` and a `pendingCapture` slot.
- The QR encodes a **session id + short-lived token**. The phone scans it **inside the native app** (in-app QR scanner) and binds to the session; alternatively a deep link / universal link (e.g. `spectro://join?s=<sessionId>&t=<token>`) can hand off into the app. No browser is involved on the phone.
- The laptop **drives**; the phone **reacts** to a `pendingCapture` request and replies with an upload. This keeps the phone UI trivial and avoids the student navigating the workflow on the small screen.

### 4.2 Realtime sync options (to be chosen in design)

| Option | How | Pros | Cons |
|---|---|---|---|
| **Server-Sent Events + REST upload** *(recommended start)* | Laptop & phone subscribe to `/session/:id/events`; phone POSTs image | Simple, one-directional push fits "laptop drives", easy on Next.js | Two channels (SSE down, POST up) |
| **WebSocket** | Bidirectional socket per session | Lowest latency, symmetric | More infra (sticky sessions / a socket server) |
| **Polling** | Phone/laptop poll session state | Trivial, no infra | Laggy, wasteful |
| **Managed realtime** (Supabase Realtime / Pusher / Ably) | Hosted pub/sub | No socket infra to run | External dependency, cost |

> The image **upload itself** is always a plain multipart POST (photos are too big for a socket frame). Realtime is only for *state/prompt* sync.

---

## 5. Key decision: where does image processing run?

You raised exactly the right tension:

> *"Handing off to Python may slow down the response, but processing in Next.js we may not have sufficient image libraries."*

Here is the honest analysis for **this specific workload**.

### 5.1 What the workload actually is

- Decode one JPEG (a phone photo, e.g. ~1–4 MP, often pre-cropped to a strip).
- Read pixels inside a rectangular ROI.
- For each column: linearise R/G/B, average → one number. (≈ a few hundred columns × ROI-height pixels.)
- Run a moving average, find local maxima, do **two** ordinary least-squares fits, and a per-pixel `−log₁₀` ratio.

This is **light numeric work over a 1-D array** — milliseconds of CPU. The only non-trivial primitive is **JPEG decode + raw pixel access**, and Node has an excellent, fast native library for exactly that: **`sharp`** (libvips). Peak detection and regression are ~30 lines each and already written in Dart.

### 5.2 The two viable answers

| | **A. Node/Next.js backend** (recommended) | **B. Python microservice** |
|---|---|---|
| Image decode / pixels | `sharp` → raw `Buffer` of RGB | Pillow / OpenCV / NumPy |
| Math | TypeScript port of existing Dart (near 1:1) | NumPy / SciPy (`scipy.signal.find_peaks`) |
| Latency | **In-process** — no network hop | Extra HTTP/IPC hop per photo |
| Deploy | **One service, one language** | Two services to build, deploy, monitor |
| Library richness | Sufficient for *this* workload | Richest scientific ecosystem |
| When it wins | Now — simple math, lowest latency | If processing later grows heavy (curve fitting, deconvolution, ML) |

### 5.3 Recommendation

**Do the processing in the Next.js backend (Route Handlers / server actions) using `sharp` for decode and a TypeScript port of the existing Dart algorithms.** Reasons:

1. The math is small and already written — porting Dart → TS is nearly mechanical (same formulas, same structure).
2. **One runtime, one deploy, lowest latency** — no Python handoff, which is exactly the slowdown you were worried about.
3. `sharp` covers the only "hard" part (fast JPEG decode + raw pixel buffer). We do **not** need NumPy/SciPy for column averages and two line fits.

**But design for a swap.** Put the core behind a single module boundary (`analysis/` with one entry function per operation). If a future experiment mode needs heavy science (multi-peak Gaussian fitting, baseline correction, chemometrics), the same interface can be re-implemented as a **Python FastAPI sidecar** without touching the UI. The boundary is the insurance policy; we don't pay for it now.

> Net: **Node now, Python optional later, behind the same seam.** This directly answers the latency-vs-libraries trade-off in favour of latency, because the libraries we'd gain aren't needed yet.

---

## 6. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Web framework | **Next.js (React)** | Per your direction; SSR + Route Handlers give us the backend in the same project |
| Phone client | **Existing native Flutter app**, stripped to camera role | Keeps hardware **focus/exposure lock**; reuses proven camera code; in-app QR scan / deep link to join |
| Image decode | **`sharp`** (Node, libvips) | Fast native JPEG decode + raw pixel access |
| Analysis core | **TypeScript port** of Dart algorithms | Single source of truth, swappable to Python |
| Charts | **Recharts / visx / Plotly** (TBD) | Replace `fl_chart` line + scatter |
| Realtime | **SSE** to start (see §4.2) | Simple, fits "laptop drives" |
| Persistence | TBD — see [§9](#9-persistence) | Session store |
| Export | CSV via browser download + Web Share API | Replaces `csv` + `share_plus` |
| *(optional later)* Heavy science | **Python FastAPI** sidecar | Only if a mode needs it |

---

## 7. Data model (port of the Dart models)

The Dart models in `project.dart` translate directly to TypeScript types. A **Session** is the web analogue of **Project**, with pairing/step-control fields added.

```ts
type WorkflowStep =
  | 'experimentSetup'   // NEW: mode + light type
  | 'cameraRoiSetup'    // was 'setup'
  | 'calibration'
  | 'blank'             // split out of 'references'
  | 'standards'         // split out of 'references'
  | 'absorbanceReview'  // was interstitial
  | 'unknown'
  | 'results';

interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // NEW up-front choices
  mode: ExperimentMode;        // e.g. 'beerLambert'
  lightType: ReferenceLight;   // e.g. 'fluorescent' → selects lamp peak set

  currentStep: WorkflowStep;
  pendingCapture: CaptureRequest | null;  // drives the phone

  roi: Rect | null;            // {left, top, width, height} in image coords
  calibration: Calibration | null;
  calibrationImage: SpectralImage | null;
  blankImage: SpectralImage | null;        // I₀
  standards: StandardMeasurement[];
  unknowns: UnknownResult[];
}

interface DataPoint { x: number; y: number; }
interface IntensityProfile { points: DataPoint[]; }
interface CalibrationPeak { pixelPosition: number; knownWavelength: number; }
interface Calibration { slope: number; intercept: number; rSquared: number; peaks: CalibrationPeak[]; }
interface SpectralImage { id: string; url: string; capturedAt: string; intensityProfile?: IntensityProfile; }
interface AbsorbanceSpectrum { points: DataPoint[]; lambdaMax?: number; absorbanceAtLambdaMax?: number; }
interface StandardMeasurement { concentration: number; unit: string; image: SpectralImage; absorbanceSpectrum?: AbsorbanceSpectrum; }
interface UnknownResult { image: SpectralImage; absorbanceSpectrum?: AbsorbanceSpectrum; absorbanceAtLambdaMax?: number; determinedConcentration?: number; }
// CalibrationCurve stays computed-in-memory, not persisted (as today).
```

> **New vs today:** `mode`, `lightType`, `pendingCapture`, and the split of `references` into `blank`/`standards` steps. `roi` becomes `{left, top, width, height}` (no Flutter `Rect`). The default-ROI fallback (`0,0,9999,9999` → clamped to image size) is preserved for pre-cropped strips.

---

## 8. Core algorithms to port (source of truth)

These must be ported **faithfully** — the constants and formulas are load-bearing. (Values from `CLAUDE.md` and the Dart source.)

### 8.1 Gamma linearisation (per channel, applied before any averaging)
```
norm = c8bit / 255
if norm ≤ 0.04045:  linear = norm / 12.92
else:               linear = ((norm + 0.055) / 1.055) ^ 2.4
return linear * 255
```
On by default. Off only for debugging.

### 8.2 Intensity profile (ROI → 1-D), two modes
- **Luminance** (default): `0.299R + 0.587G + 0.114B` — for blank, standards, unknown.
- **Max-channel**: `max(R,G,B)` — **calibration lamp only** (keeps blue lamp lines detectable).
- Average down each ROI column → `DataPoint(x = column index, y = mean intensity)`.
- Clamp ROI to actual image size.

### 8.3 Saturation
- A pixel is saturated if **any** channel ≥ **250**. Return `{saturatedCount, totalCount, fraction, isSaturated}`. Warn after every capture.

### 8.4 Calibration peak detection (load-bearing constants)
- Smoothing window = **15** (`calibrationSmoothingWindow`), vs **5** default.
- Minimum peak separation = `profile.length / 15` (≈40 px on a 550 px image).
- Detect 5 peaks → map to lamp lines `[434.5, 486.0, 544.0, 587.0, 611.5]` nm → OLS fit `λ = slope·px + intercept`.
- **Expected (550 px sample):** slope ≈ 0.59 nm/px, intercept ≈ 397 nm, R² > 0.999; peaks at px ≈ 61, 153, 249, 316, 365.

### 8.5 Absorbance, λmax, Beer-Lambert curve
- Per pixel: `A(λ) = −log₁₀(I/I₀)` against the blank; map pixel → λ via calibration. (Guard I₀ = 0.)
- λmax = wavelength of max A from the highest-concentration standard; user-adjustable by tapping the chart.
- Beer-Lambert: OLS of `A@λmax` vs concentration across standards → `A = m·c + b`; back-calc unknown `c = (A − b)/m`.

> **Recommended: a golden-data regression test.** Run the existing sample 550-px dataset through the TS port and assert the expected slope/intercept/peaks above, so the port is provably faithful to the Dart original.

---

## 9. Persistence

The current app uses Hive (local). On the web, the session must be reachable by **two devices**, so it needs a **server-side store**. Options (decide in design):

| Option | Fit |
|---|---|
| **In-memory + object storage for images** | Simplest for a classroom/demo; sessions are ephemeral |
| **SQLite / Postgres** + blob store (S3/local disk) | Durable; supports saved experiments and history |
| **Supabase / Firebase** | Bundles DB + storage + realtime (pairs with §4.2 managed-realtime) |

Images are the bulk of the data — store **files in object/blob storage**, keep only URLs + extracted profiles in the session record (mirrors today's `SpectralImage.filePath` + `intensityProfile`).

---

## 10. API surface (illustrative)

```
POST   /api/sessions                      → create session {id, joinToken, mode, lightType}
GET    /api/sessions/:id                   → full session state (laptop hydrate)
GET    /api/sessions/:id/events            → SSE stream of state/prompts (both devices)
POST   /api/sessions/:id/join              → native app joins with token (from in-app QR scan)
POST   /api/sessions/:id/step              → laptop advances step / sets pendingCapture
POST   /api/sessions/:id/captures          → phone multipart image upload → triggers core
                                             → returns/streams extracted profile + warnings
POST   /api/sessions/:id/roi               → set ROI, re-extract affected profiles
POST   /api/sessions/:id/lambda-max        → adjust λmax, rebuild curve
GET    /api/sessions/:id/export.csv        → results CSV
```

The **core** ([§5](#5-key-decision-where-does-image-processing-run)) is invoked inside `POST /captures`, `/roi`, and `/lambda-max` — all in-process (Node) for now.

---

## 11. Phased implementation roadmap

1. **Core port + tests** — TS port of §8 with `sharp`; golden-data regression test against the 550-px sample. *(De-risks the science first; no UI.)*
2. **Session + pairing** — create session, QR (id+token), SSE channel; add in-app QR scanner + join flow to the native app so it connects and shows "connected".
3. **Capture loop** — laptop requests a capture → phone shutter → multipart upload → core extracts profile → laptop renders spectrum. Saturation warning.
4. **Guided wizard** — experiment-mode + light-type setup, ROI-on-web, calibration, blank, standards, absorbance review (λmax tap), unknown, results. Port `info_card` explanations.
5. **Results & export** — charts, data table, CSV download, Web Share.
6. **Polish** — phone-app reconnect handling, error states, multi-session, saved history.
7. *(Optional)* **Python sidecar** — only if a new experiment mode needs heavy science.

---

## 12. Open design questions

1. **Realtime transport** — SSE (recommended) vs WebSocket vs managed (Supabase/Pusher)? Affects hosting.
2. **Persistence** — ephemeral in-memory vs durable DB? Do students need to revisit past experiments?
3. **Auth / ownership** — anonymous sessions (QR is the only key) vs student logins? Token lifetime & re-pairing.
4. **Native-app refactor scope** — how much of the existing Flutter app to keep? Minimum is: home/session-join screen, QR scanner, the camera + focus-lock screen, and upload. The on-phone workflow, calibration, analysis, ROI, and results screens become dead code (remove vs hide). Focus/exposure lock is **retained** — that was the reason for keeping the native app.
5. **Experiment modes** — what is the initial set beyond Beer-Lambert? Each mode defines its lamp peak set, units, expected ranges, and explanation copy.
6. **Reference light types** — fluorescent (current 5-peak set) plus others? Each needs its own known-peak table.
7. **Charts library** — Recharts vs visx vs Plotly (interactivity for λmax tapping).
8. **Native app: strip vs fork** — turn the existing Flutter app into the camera client in place, or fork a lean "Spectro Capture" app and keep the full app as an offline fallback? (This plan assumes the native app is repurposed to the camera role and the web app becomes primary for analysis.)
9. **Hosting** — the repo already has GitLab CI/CD + webhook deploy; align the web app's deploy with it.

---

## 13. Summary of decisions already made

- **Phone = existing native Flutter app, stripped to a camera role** (in-app QR scan → join → focus/exposure lock → capture → upload). **Focus/exposure lock retained** — no web browser is used for photos.
- **Web = Next.js (React)**, front-end **and** backend in one project.
- **Image processing = Next.js backend (Node + `sharp`)** with a TypeScript port of the existing Dart algorithms — chosen for **lowest latency and one runtime**, behind a swappable seam so a **Python FastAPI** core can replace it later if the science gets heavy.
- **Science is preserved, not re-derived** — algorithms and constants in §8 are ported faithfully and pinned with a golden-data test.
