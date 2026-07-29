# Spectro Web — Architecture Decision Record

> **Status: HISTORICAL, with living decisions.**
> This was written as the forward plan for a **two-device** refactor (a laptop "brain" +
> a paired phone camera, joined over a QR code, with a Next.js backend doing the image
> processing). **That architecture was built and then removed.** The app today is a
> **fully static, in-browser** single-device app: no server, no database, no auth, no
> phone client, no API routes. Data lives in the browser's IndexedDB.
>
> This document is kept because several decisions made here are **still load-bearing**
> — the science port, the algorithm constants, the module seam, and the golden test.
> Those are collected in [§A. Decisions that still hold](#a-decisions-that-still-hold).
> Everything after §B is the superseded two-device design, retained only so a future
> reader knows what was tried and why it was dropped.
>
> **For the current architecture, read [`../CLAUDE.md`](../CLAUDE.md)** — that is the
> authoritative, maintained description. Companion UX document:
> [web-ux-brief.md](web-ux-brief.md) (same historical framing).

---

## A. Decisions that still hold

These survived the static refactor unchanged and describe the app as it exists today.

### A.1 The science is ported, not re-derived
The Flutter app's domain logic was the asset worth preserving. It was ported **once**,
faithfully, from Dart to TypeScript and has not been re-derived since. The port lives in
`web/src/lib/analysis/` as **pure functions with no native dependencies**
(`math` / `image` / `calibration` / `absorbance` / `roi-margins`).

### A.2 One module seam for the analysis core
The core sits behind a single module boundary (`web/src/lib/analysis/`, re-exported from
`index.ts`) with one entry function per operation. This was originally insurance for
swapping Node for a Python sidecar. **It paid off differently than expected**: because
the core was pure and decoder-agnostic, moving the whole pipeline from the server into
the browser only required replacing the *decoder*, not the science. Today
`analysis/decode.client.ts` (`createImageBitmap` → canvas → `getImageData`) is the only
platform-specific piece, and `analysis-client.ts` orchestrates decode + extract +
calibrate + crop entirely client-side.

> The lesson worth keeping: **the seam is what made the architecture reversible.** Keep
> the analysis core free of `window`, `sharp`, DOM, and storage concerns.

### A.3 The golden-data regression test
Recommended here, and built: `web/test/analysis.golden.test.ts` runs the 002 fixture
through the pure core and pins the science. It decodes with **`sharp`** (a devDependency,
Node-only) purely as a test decoder — the browser decoder is the source of truth for the
live app, and the two differ at the sub-pixel level.

### A.4 The load-bearing algorithm constants
Ported faithfully and still in force (see `web/src/lib/analysis/constants.ts`):

- **Gamma linearisation** (per channel, before any averaging):
  `norm ≤ 0.04045 → norm/12.92`, else `((norm + 0.055)/1.055)^2.4`. On by default; now a
  persisted per-experiment toggle (`lineariseGamma`).
- **Two intensity methods**: luminance `0.299R + 0.587G + 0.114B` (blank/standards/unknown)
  vs **max-channel `max(R,G,B)` for the calibration lamp only** — luminance weights blue at
  0.114 and hides the lamp's violet lines.
- **Saturation**: any channel ≥ **250**/255 → `{saturatedCount, totalCount, fraction, isSaturated}`.
- **Calibration smoothing window = 15** (`calibrationSmoothingWindow`).
- **Lamp lines**: 434.5 / 486.0 / 544.0 / 587.0 / 611.5 nm; OLS fit `λ = slope·px + intercept`.
- **Expected on the 550 px sample**: slope ≈ 0.582 nm/px, intercept ≈ 397.9 nm, R² ≈ 0.9998;
  peaks at px ≈ 61, 153, 249, 316, 365.
- **Default ROI fallback** (effectively the full image, clamped to actual size) is preserved
  for pre-cropped strips.

> Two constants in this file have **moved on** from what was planned here, and the current
> behaviour is documented in `CLAUDE.md`:
> - Minimum peak separation is `round(bandWidth/15)` — sized to the detected **spectral
>   band**, not `profile.length/15`. The original form merged the 587/611.5 nm pair whenever
>   a capture had a large dark margin.
> - Peaks are selected by **collinearity** (highest-R² size-5 subset of a generous candidate
>   set, both fit directions tried), not by brightness. A near-tied collinear fit in the wrong
>   direction used to flip the calibration blue↔red.
> - `defaultSmoothingWindow = 5` is defined but **never referenced** — dead code. Sample
>   spectra are analysed unsmoothed.

### A.5 The workflow shape
The step sequence planned here is the sequence shipped, with two later changes:
`absorbanceReview` was **merged into `standards`** (one live step: add standards, see the
spectra and the curve update immediately), and `experimentSetup` moved **before** the
wizard onto the setup form. Both remain in the `WorkflowStep` union for their labels.

### A.6 Data model
The types sketched in §7 below are essentially the shipped shapes, minus the pairing
fields. See `web/src/lib/domain-types.ts` for the current definitions, and `CLAUDE.md` for
the record layout. Notable divergences from the sketch: there is one **experiment-global**
concentration `unit` (not per-standard); `calibrationCurve` **is** persisted (the app stores
every computed step); `standards`/`unknowns` reference images by `imageId`; and `unknowns`
is a real list — many unknowns per experiment.

---

## B. Why the two-device design was abandoned

The plan below optimised for a hardware advantage: the native phone app could **lock focus
and exposure**, which matters because absorbance compares light intensity across photos. The
cost was an entire distributed system — a server, a database, auth, a realtime channel, image
upload, a pairing handshake, and a second codebase to ship and install.

The user chose to drop all of it in favour of a **single static page the student just opens**:
no install, no account, no server to run or pay for, no data leaving the machine (a real
benefit for classroom/institutional use). Photos are taken with whatever camera app the
student has and uploaded from the file picker.

**The trade-off that was accepted:** exposure consistency is now the student's
responsibility rather than being enforced by the app. This is mitigated by guidance rather
than hardware control — the saturation warning after every capture, and the fact that a
blank captured under different exposure than the standards produces a visibly bad
calibration curve.

> If exposure lock ever becomes worth revisiting, the design work is **not** lost: the
> continuous-camera-session design in
> [`design_handoff_continuous_camera/`](design_handoff_continuous_camera/) specifies the
> lock semantics per platform (including a `getUserMedia` path that would work *inside* the
> current static app, with no server and no second device).

---

# ⬇ SUPERSEDED — the original two-device plan (2026, pre-refactor)

*Everything below describes an architecture that no longer exists. Retained for context only.*

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

## 2. What we are keeping (the science is already correct)

*(Superseded framing — the port happened; see §A.1. The Dart source paths below no longer
exist in this repo.)*

| Concern | Original Dart location | Ported to |
|---|---|---|
| sRGB → linear gamma | `image_processing.dart › _srgbToLinear` | `analysis/image.ts` |
| Intensity profile (ROI → 1-D) | `image_processing.dart › extractIntensityProfile` | `analysis/image.ts` |
| Saturation check | `image_processing.dart › checkSaturation` | `analysis/image.ts` |
| Moving average | `math_utils.dart › movingAverage` | `analysis/math.ts` |
| Local maxima / prominence | `math_utils.dart › findLocalMaxima` | `analysis/math.ts` |
| Linear regression (OLS + R²) | `math_utils.dart › linearRegression` | `analysis/math.ts` |
| Absorbance `A = −log₁₀(I/I₀)` | `absorbance_spectra_screen.dart › _computeAbsorbance` | `analysis/absorbance.ts` |
| λmax detection + curve build | `absorbance_spectra_screen.dart` | `analysis/absorbance.ts` + `experiment-analysis.ts` |

## 3. Workflow mapping (mobile steps → web-guided flow)

*(Superseded — see §A.5 for what shipped.)*

| Planned web step | From the Flutter app | Photo needed? | What the web guides / explains |
|---|---|---|---|
| **0. Experiment setup** *(new)* | — | No | Choose **experiment mode** and **reference light type**. Sets defaults: lamp peak set, units, expected ranges. |
| **1. Camera + ROI setup** | `setup` | Yes (live framing) | Explain framing the spectral strip; lock focus/exposure on phone; **draw ROI on the web** over a still frame. |
| **2. Wavelength calibration** | `calibration` | Yes (lamp) | Capture lamp; auto-detect 5 peaks (max-channel); fit pixel→λ; show R². |
| **3a. Blank (I₀)** | `references › blank` | Yes (blank) | Explain I₀ as the incident-light reference. |
| **3b. Standards** | `references › standards` | Yes (≥2) | Capture ≥2 known concentrations. |
| **3c. Absorbance review** | `absorbance_analysis` | No | Pure computation. Confirm λmax; show Beer-Lambert curve + R². |
| **4. Unknown** | `unknown` | Yes (unknown) | Back-calculate concentration `c = (A − b)/m`. |
| **5. Results & export** | `results` | No | Summary charts, data table, CSV download / share. |

**Per-step explanation pattern** — every step shows a short *Why this step matters* panel, a
*What to do* checklist, and *What we measured* after the photo returns. **This survived** and
is the `GuidancePanel` in the shipped app.

## 4. System architecture *(superseded — no server, no phone client)*

Three logical pieces:

1. **Web app (the brain)** — guidance UI, ROI selection, charts, results, export. Holds session state. Next.js (React).
2. **Phone camera client (the lens)** — the existing native Flutter app, stripped to a camera role. Scans QR → joins session → locks focus/exposure → captures → uploads.
3. **Analysis core (the math)** — the ported domain algorithms.

### 4.1 Session linking via QR (the pairing model)

```
Laptop                         Server                  Phone (native app)
  │  create session            │                               │
  │ ─────────────────────────▶ │  session {id, joinToken}      │
  │  show QR(deep-link+token)  │                               │
  │                            │     scan QR (in-app) ────────▶ │ deep-link → join
  │                            │ ◀──── join(token) ──────────── │
  │ ◀─ "phone connected" ───── │ ───── "you're in" ──────────▶ │
  │  step needs photo:         │                               │
  │  "capture blank" ────────▶ │ ──── prompt: capture blank ─▶ │ show capture UI
  │                            │ ◀──── upload(image) ────────── │ focus-lock + shutter
  │ ◀─ image ready + spectrum ─│  (core runs here)             │
```

- A **session** was the unit both devices shared, carrying `mode`, `lightType`, `roi`, `calibration`, `blank`, `standards[]`, `unknowns[]`, plus `currentStep` and a `pendingCapture` slot.
- The QR encoded a **session id + short-lived token**, scanned inside the native app.
- The laptop **drove**; the phone **reacted** to a `pendingCapture` request.

### 4.2 Realtime sync options

| Option | How | Pros | Cons |
|---|---|---|---|
| **Server-Sent Events + REST upload** *(chosen)* | Laptop & phone subscribe to `/session/:id/events`; phone POSTs image | Simple, fits "laptop drives", easy on Next.js | Two channels (SSE down, POST up) |
| **WebSocket** | Bidirectional socket per session | Lowest latency, symmetric | More infra |
| **Polling** | Poll session state | Trivial | Laggy, wasteful |
| **Managed realtime** (Supabase / Pusher / Ably) | Hosted pub/sub | No socket infra | External dependency, cost |

SSE was implemented, then deleted with the rest of the server.

## 5. Key decision: where does image processing run?

> *"Handing off to Python may slow down the response, but processing in Next.js we may not have sufficient image libraries."*

### 5.1 What the workload actually is

- Decode one JPEG (~1–4 MP, often pre-cropped to a strip).
- Read pixels inside a rectangular ROI.
- Per column: linearise R/G/B, average → one number.
- A moving average, local maxima, **two** OLS fits, and a per-pixel `−log₁₀` ratio.

**Light numeric work over a 1-D array** — milliseconds of CPU. The only non-trivial primitive is JPEG decode + raw pixel access.

> **This analysis is the part that aged best, and it is *why* the static refactor was even
> possible.** Because the workload is milliseconds of 1-D math, moving it from a server to
> the browser cost nothing in user-perceived latency — and removed an entire backend.
> The browser's own `createImageBitmap` + canvas turned out to be a perfectly good decoder,
> so `sharp` was not needed at runtime after all.

### 5.2 The two options considered *(at the time: server-side)*

| | **A. Node/Next.js backend** (chosen then) | **B. Python microservice** |
|---|---|---|
| Image decode / pixels | `sharp` → raw `Buffer` of RGB | Pillow / OpenCV / NumPy |
| Math | TypeScript port of the Dart (near 1:1) | NumPy / SciPy |
| Latency | In-process — no network hop | Extra HTTP/IPC hop per photo |
| Deploy | One service, one language | Two services |
| When it wins | Simple math, lowest latency | If processing grows heavy |

**Outcome:** option A was built, then superseded by a third option that wasn't on this
list — **run it in the browser**, which is in-process *and* serverless. `sharp` remains
only as a test-time decoder.

### 5.3 Design for a swap

Put the core behind a single module boundary. See §A.2 — this is the decision that still holds.

## 6. Technology stack *(as planned; see CLAUDE.md for what shipped)*

| Layer | Planned | Shipped |
|---|---|---|
| Web framework | Next.js (React) | Next.js 16, `output: "export"` (static) |
| Phone client | Flutter app, camera role | **none** — file upload in the browser |
| Image decode | `sharp` (Node) | `createImageBitmap` + canvas; `sharp` is test-only |
| Analysis core | TypeScript port | same |
| Charts | Recharts / visx / Plotly (TBD) | **Recharts** |
| Realtime | SSE | **none** |
| Persistence | TBD (§9) | **IndexedDB** in the browser |
| Export | CSV download + Web Share | CSV download + `.spectro.zip` bundle |
| Heavy science later | Python FastAPI sidecar | not needed |

## 7. Data model (as sketched) *(see §A.6 for the divergences)*

```ts
type WorkflowStep =
  | 'experimentSetup' | 'cameraRoiSetup' | 'calibration' | 'blank'
  | 'standards' | 'absorbanceReview' | 'unknown' | 'results';

interface Session {
  id: string; name: string; createdAt: string; updatedAt: string;
  mode: ExperimentMode; lightType: ReferenceLight;
  currentStep: WorkflowStep;
  pendingCapture: CaptureRequest | null;  // drives the phone — DROPPED
  roi: Rect | null;
  calibration: Calibration | null;
  calibrationImage: SpectralImage | null;
  blankImage: SpectralImage | null;
  standards: StandardMeasurement[];
  unknowns: UnknownResult[];
}
```

## 8. Core algorithms to port

*(Fully superseded by §A.4, which states the current values. Three of the constants here are
now wrong — `minSep`, the brightness-based peak choice, and the expected slope figure.)*

## 9. Persistence *(superseded)*

Because the session had to be reachable by **two devices**, it needed a server-side store —
options weighed were in-memory, SQLite/Postgres + blob storage, or Supabase/Firebase.
Postgres + Prisma + a disk blob store was built.

**With one device, the constraint vanished.** Persistence is now IndexedDB (`experiments`
JSON + `blobs` binaries), and portability is a user-driven `.spectro.zip` export/import
instead of a server.

## 10. API surface *(superseded — all of these were deleted)*

```
POST   /api/sessions                      → create session
GET    /api/sessions/:id                  → full session state
GET    /api/sessions/:id/events           → SSE stream
POST   /api/sessions/:id/join             → native app joins with token
POST   /api/sessions/:id/step             → advance step / set pendingCapture
POST   /api/sessions/:id/captures         → phone multipart image upload
POST   /api/sessions/:id/roi              → set ROI, re-extract
POST   /api/sessions/:id/lambda-max       → adjust λmax, rebuild curve
GET    /api/sessions/:id/export.csv       → results CSV
```

Each has a direct client-side descendant: `createExperiment`, `readExperiment`,
*(none — no realtime)*, *(none — no pairing)*, `goToStep`, `persistCapture`,
`persistReextract`, `setLambdaMax`, `downloadResultsCsv`.

## 11. Phased roadmap *(historical)*

1. **Core port + tests** — done, and still the foundation.
2. **Session + pairing** — built, then deleted.
3. **Capture loop** — built as upload-over-HTTP, then rebuilt in-browser.
4. **Guided wizard** — done, and still the shape of the app.
5. **Results & export** — done, plus a full report page and zip bundle.
6. **Polish** — reconnect handling was moot after the refactor.
7. *(Optional)* **Python sidecar** — never needed.

## 12. Open design questions *(all resolved or moot)*

1. **Realtime transport** — moot, no realtime.
2. **Persistence** — resolved: IndexedDB, per-browser, with zip export.
3. **Auth / ownership** — resolved: no auth at all; data never leaves the browser.
4. **Native-app refactor scope** — moot; `mobile/` was deleted entirely.
5. **Experiment modes** — resolved: two shipped, `beerLambert` and `fluorescence`.
6. **Reference light types** — resolved: `fluorescent` (5-line lamp) and `laser` (3 user-set lines), paired 1:1 with the mode.
7. **Charts library** — resolved: Recharts.
8. **Native app: strip vs fork** — moot.
9. **Hosting** — resolved: static nginx image deployed by deployd (see CLAUDE.md).

## 13. Summary of decisions made at the time

- Phone = native Flutter app in a camera role, focus/exposure lock retained. **← reversed**
- Web = Next.js, front-end **and** backend in one project. **← reversed (front-end only)**
- Image processing = Next.js backend (Node + `sharp`), behind a swappable seam. **← the seam held; the location moved to the browser**
- Science is preserved, not re-derived, and pinned with a golden-data test. **← still true**
