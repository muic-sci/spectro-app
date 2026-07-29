# Spectro Web — UX/UI Design Brief

> **Status: PARTLY LIVE.**
> §§1–3, 5, 7, 8, 9, 10 describe the app **as it works today** and are maintained.
> This document is a live reference — `web/src/lib/experiment-meta.ts` cites **§5** as the
> source of the per-step guidance copy (`STEP_GUIDANCE`), and `CLAUDE.md` uses the
> **L3.x screen IDs** from §3 to name the wizard steps.
>
> **What changed since it was written:** this brief was authored for a **two-device** app
> (a laptop brain + a paired phone camera). That architecture was built and then removed —
> the app is now **one static page in one browser**, with photos coming from the file
> picker. So the phone screens (P0–P6), the QR pairing screen (L2), and the pairing
> choreography are **superseded**; they are quarantined in
> [Appendix H](#appendix-h--superseded-the-two-device-flow). The dark-UI constraint, the
> guidance-first teaching model, the ROI interaction spec, and the state catalogue all
> survived intact.
>
> **Companion documents:** [web-refactor-plan.md](web-refactor-plan.md) (architecture ADR,
> same historical framing) and [`../CLAUDE.md`](../CLAUDE.md) (authoritative current
> architecture).

---

## 1. The product in one line

One browser tab, no account, no server: the student is taught Beer-Lambert quantitative
analysis one step at a time, uploading photos of the spectrum strip and seeing everything
explained and computed **locally, in their own browser**.

---

## 2. Design principles & hard constraints

**Hard constraints (non-negotiable):**

1. **Dark UI everywhere — this is an experimental requirement, not a preference.** The
   screen is physically near the spectrophotometer; stray screen light contaminates the
   measurement. Avoid large bright/white areas. *(Implemented as dark-only: `.dark` is
   always on `<html>`. The one exception is the **report**, which has its own light/dark
   toggle and always prints on white — by then the measuring is over.)*
2. **The science must read clearly.** Charts, peaks, R², λmax, and concentrations are the
   payload — they get visual priority over chrome.
3. **Nothing leaves the browser.** No uploads, no accounts, no telemetry. Data lives in
   IndexedDB; the only way out is a user-initiated export. Say so where the student can see it.

**Guiding principles:**

- **Guidance-first.** Every step answers *Why am I doing this?*, *What do I do?*, and
  *What did we measure?* The teaching is the product. *(Implemented as `GuidancePanel` +
  `STEP_GUIDANCE` in `experiment-meta.ts` — `{why, todo}` per step, mode-aware.)*
- **One step at a time.** A linear wizard; no overwhelming dashboards.
- **Show the working.** Every intermediate (profile, peaks, fit, crop) is visible, because
  the app replaces a manual ImageJ workflow the student used to see with their own eyes.
- **Fail gently and instructively.** Saturation, a bad calibration, a too-tight ROI — each
  failure is a teaching moment with a clear fix, not a dead end.

---

## 3. Screen inventory (single device)

| ID | Screen | Route | Purpose |
|----|--------|-------|---------|
| L0 | Experiment list / landing | `/`, `/experiments` | Create, resume, rename, delete, **export/import** an experiment |
| L1 | Experiment setup | `/experiments/new` | Name + mode + concentration unit (+ laser wavelengths in fluorescence mode) |
| ~~L2~~ | ~~Pairing~~ | — | **Removed** — nothing to pair (see [Appendix H](#appendix-h--superseded-the-two-device-flow)) |
| L3 | Wizard shell | `/experiment?id=…` | Persistent frame: step rail + guidance panel + main canvas + nav |
| L3.1 | Step — Camera & ROI setup | ″ | Upload the lamp; pick orientation; drag the ROI box |
| L3.2 | Step — Wavelength calibration | ″ | Peaks, slope/intercept/R², pixel→λ fit |
| L3.3 | Step — Blank (I₀) | ″ | The incident-light / background reference |
| L3.4 | Step — **Standards & curve** | ″ | Add standards **and** review the spectra + calibration curve live |
| L3.5 | Step — Unknown | ″ | Upload one or many unknowns; read off concentrations |
| L3.6 | Step — Results & export | ″ | Summary, table, CSV export, link to the report |
| L4 | Full report | `/report?id=…` | Print-friendly write-up of the whole run |
| L5 | Design showcase | `/showcase` | Internal design-system page (not part of the student flow) |

> **Two changes from the original brief:** the old **L3.5 Absorbance review** was **merged
> into L3.4** — the spectra overlay and the Beer-Lambert curve now build *live* as standards
> are added, so there is no separate confirm-then-continue step. That renumbered Unknown and
> Results to L3.5/L3.6, which is the numbering `CLAUDE.md` uses. The **report (L4)** is new
> since this brief was written.

The step rail therefore shows **6** steps (Camera & ROI · Calibration · Blank · Standards ·
Unknown · Results); the setup choices happen on L1, before the wizard.

---

## 4. The capture moment

*(This section replaces the two-device pairing choreography — see
[Appendix H](#appendix-h--superseded-the-two-device-flow) for the original.)*

There is no hand-off. On any step that needs a photo, the canvas shows a **file-upload
control** (`CaptureControls`) and everything happens in-page:

```
MOMENT                    WHAT THE STUDENT SEES
──────────────────────────────────────────────────────────────────────
1. Step needs a photo     Guidance (why + what to do) + an upload control
2. They pick a file       Decode + ROI extract + analysis run in the browser
                          (milliseconds — no network, no spinner worth showing)
3. Result appears         The spectrum/profile renders, plus the saturation %
4. Continue               Nav enables once the step's requirement is met
```

**Design requirements:**
- Because analysis is local and instant, **do not** design "uploading / receiving" states
  for it. Reserve progress affordances for genuinely slow work (re-extracting *every* stored
  capture after an ROI change; building an export zip).
- The **saturation percentage is reported after every capture** — it is the app's only
  defence against inconsistent exposure now that no hardware lock is enforced. Make it
  visible, not buried.
- **Retake = just upload again.** Keep that obvious; there is no separate retake flow.

> **Design note worth preserving:** the removed phone client existed to hold a hardware
> **focus/exposure lock** across every photo, which matters because absorbance compares
> intensities *between* photos. That guarantee is gone; guidance and the saturation warning
> replace it. If it is ever worth restoring, the full behavioural contract — including a
> browser `getUserMedia` path that needs no second device and no server — is specified in
> [`design_handoff_continuous_camera/`](design_handoff_continuous_camera/).

---

## 5. Screens (detailed)

> **This section is load-bearing.** `web/src/lib/experiment-meta.ts` (`STEP_GUIDANCE`) cites
> it as the source of the *why/what to do* copy. Keep the two in sync in both directions.

### L0 — Experiment list / landing
- **Purpose:** start fresh, resume, or move an experiment between machines.
- **Layout intent:** dark, calm. A prominent **"New experiment"** action; below it, the list
  of saved experiments (name, mode, unit, date, step reached, capture counts).
- **Elements:** New-experiment button; per-experiment **Rename**, **Export**, **Delete**
  (each confirmed in a modal); a top-level **Import**; empty state for first-time users.
- **Why export/import exists:** data lives only in *this* browser. Export is how a student
  backs the work up, hands it in, or moves it to another machine. Make that consequence
  explicit — a student who clears site data without exporting loses everything.
- **States:** empty (friendly intro + single CTA); populated; loading; rename/export/delete
  confirmation; import in progress.
- **Copy (empty):** *"No experiments yet. Start one and we'll walk you through measuring
  concentration with light."*

### L1 — Experiment setup
- **Purpose:** the up-front choices the workflow needs.
- **Elements:**
  - **Name** the experiment.
  - **Experiment mode** — Beer-Lambert quantitation or fluorescence. Each shows a one-line
    description. **The mode also fixes the reference light** (`lightForMode`: Beer-Lambert →
    fluorescent lamp; fluorescence → laser), so light type is *not* a separate question.
  - **Concentration unit** (µM / mg/L / %) — chosen **once** here and applied to every
    standard and unknown, so it is never re-typed per capture.
  - In fluorescence mode: the **three laser wavelengths** (defaults 650 / 532 / 405 nm).
  - Continue → straight into the wizard at L3.1.
- **Layout intent:** form-light, explanatory. Each choice has a short *why it matters* note.
- **States:** default; validation (name required); mode descriptions on hover/focus.
- **Copy (mode):** *"Beer-Lambert quantitation — measure an unknown concentration by
  comparing how much light your sample absorbs against known standards."*

### L3 — Wizard shell (persistent frame for all steps)
Every step canvas lives inside one consistent frame:
- **Step rail:** the 6 steps with current/done/upcoming states.
- **Guidance panel:** the teaching surface — *Why this step*, *What to do*, and after a
  capture, *What we measured*.
- **Main canvas:** the step's working area (chart, ROI editor, table…).
- **Nav:** Back / Continue, with Continue disabled until the step's requirement is met, and
  the prerequisite stated ("Capture a blank to continue").
- **Version stamp:** an unobtrusive build-version badge, bottom-right, on every page (hidden
  in print).

#### L3.1 — Camera & ROI setup
- **Goal:** define the region every measurement shares.
- **Canvas:** upload the **lamp photo first** — you can't mark a region without seeing the
  strip. Then pick **orientation** (horizontal/vertical) and **drag a box** over the strip
  (mouse **and** touch), with a live *"Region used for analysis"* canvas preview and a
  "Use full strip" shortcut. Plus a **gamma-linearisation switch** (see below).
- **Orientation auto-detects** from the ROI's colour gradient (a one-way ANOVA: η² per axis;
  the larger axis is the suggestion and doubles as a *"Region clarity"* percentage). A manual
  pick sticks; "↺ Auto-detect" re-enables it.
- **The dark-margin gate:** the box must keep dark background at **each end** of the
  spectrum along the dispersion axis — ≥10% of the box length per end for the lamp, ≥20% for
  laser lines. Assessed live: a failing box turns the box + handles **orange**, shows the
  measured per-end percentages with a fix-it message, and **disables "Save region"**.
  *"Use full strip" stays enabled* — the escape hatch for pre-cropped strips.
- **Gamma toggle:** phone JPEGs are sRGB gamma-encoded, so pixel values aren't proportional
  to photon count and `I/I₀` is meaningless without undoing it. On by default; exposed here
  because it is a real scientific choice, and it is **experiment-global** — flipping it
  re-extracts every stored capture so an experiment never mixes settings.
- **Interaction:** see [§7 ROI spec](#7-roi-selection-interaction-spec).
- **Guidance:** *Why:* "Every measurement must come from the exact same region so they're
  comparable." *Do:* "Upload the lamp photo, then drag a box around the strip."
- **States:** no image yet; image present + drawing; margin check failing (orange, save
  blocked); ROI set (Continue enabled); re-extracting all captures.

#### L3.2 — Wavelength calibration
- **Goal:** turn pixel positions into wavelengths.
- **Canvas:** the lamp **intensity profile** with the detected peaks marked and **tinted by
  their real wavelength colour**; the **cropped strip drawn directly under the pixel axis**
  (blue→red, flipped when the calibration slope is negative) so the student can see each
  peak sitting on a real emission line; a **detected-peaks table** (wavelength / pixel /
  intensity / fitted λ); a **pixel→λ fit chart**; and slope / intercept / **R²**.
- **Guidance:** *Why:* "A fluorescent lamp emits at known, fixed wavelengths. By finding
  those bright lines in your photo, we learn which pixel = which colour." *Do:* "Capture the
  lamp spectrum. We'll find the lines automatically — check they landed on the bright peaks."
- **States:** awaiting lamp capture; peaks detected & good (R² ≳ 0.999); **low-R² warning**.
- **Quality cue:** surface R² prominently with a plain-language verdict ("Excellent fit ✓" /
  "This doesn't look right — try recapturing the lamp").
- **Laser variant:** in fluorescence mode this step is fed by a **three-slot laser capture**
  screen (one photo per laser line, then "Combine the three captures") instead of one lamp photo.

#### L3.3 — Blank (I₀)
- **Goal:** capture the reference the signal is measured against.
- **Canvas:** the blank profile, drawn with the same profile-plus-strip treatment as L3.2.
- **Guidance:** *Why:* "The blank is your 100%-light reference — the solvent and cuvette with
  no sample. Absorbance is measured **against** this." *(In fluorescence mode it is the
  background that gets **subtracted**, not divided — the copy is mode-aware.)*
- **States:** awaiting capture; captured; **saturated → warning** (see §8).

#### L3.4 — Standards & curve *(the merged step)*
- **Goal:** capture the known concentrations **and** see the calibration line form.
- **Canvas, in one live view:**
  - add a standard (concentration → capture), the list of standards with signal@λmax, delete;
  - the **overlaid signal spectra** of every standard, each with a slim cropped strip beside
    it and the λmax line marked;
  - once ≥2 standards are measurable, the **calibration curve** with R² and slope.
- **λmax is set by dragging the line on the graph.** The chart is controlled; the card owns
  the optimistic value so the chart marker and every strip line move together as you drag,
  then commits. A bare numeric control in the card header commits on blur/Enter, and an
  **Auto** button reverts to the auto-derived λmax. **Marker colour encodes provenance:**
  amber = auto, accent = manually set.
- **Guidance:** *Why:* "Known concentrations let us draw the calibration line that converts
  absorbance into concentration. Two points make a line; more make it trustworthy. λmax is
  the wavelength your compound absorbs most — measuring there gives the strongest signal."
  *Do:* "For each standard: type its concentration, then capture it. Check λmax sits on the peak."
- **States:** zero standards; 1 standard ("add at least one more"); ≥2 **usable** standards →
  curve appears and Continue enables; λmax being dragged (live recompute); poor-fit warning.

#### L3.5 — Unknown
- **Goal:** measure the unknowns and read their concentrations.
- **Canvas:** each unknown's signal spectrum with the λmax marker; a **result readout** of
  signal@λmax → **determined concentration** with unit; the unknown plotted **on** the
  calibration line for visual confirmation.
- **Supports many unknowns** — each photo is its own row, and the upload control accepts
  multiple files at once.
- **Guidance:** *Why:* "Now we reverse the line: measure the unknown's absorbance and read
  its concentration off the calibration curve (c = (A − b)/m)." *Do:* "Capture your unknown
  sample — you can add several."
- **States:** awaiting capture; result shown; saturation / **out-of-range** warning
  ("extrapolating — result less reliable").

#### L3.6 — Results & export
- **Goal:** summarise and take the data away.
- **Canvas:** key results (λmax, calibration equation + R², each unknown's concentration), a
  **data table**, **Export CSV**, and a link to the full **report (L4)**.
- **The CSV carries two tables:** the summary (metadata + per-sample concentration and
  signal@λmax) **and** a wide signal-vs-wavelength table — `wavelength_nm` then one column
  per standard/unknown — so the full spectra can be re-plotted elsewhere.
- **Guidance:** *Why:* "Here's everything you measured, ready to record in your lab report."

### L4 — Full report (`/report?id=…`)
- **Purpose:** a standalone, print-friendly write-up of the whole run — the thing a student
  hands in.
- **Built from the same components as the wizard**, deliberately, so the report can never
  drift from what the student saw: the same profile-plus-strip charts, the same peaks table,
  the same spectra card rendered **read-only** (non-draggable λmax), plus the ROI box drawn
  over the lamp image.
- **Elements:** a top **"Method"** section walking the whole pixel→concentration pipeline; a
  mode-aware explainer opening every section; a **Print** button.
- **Theme:** the report has its **own light/dark toggle** (persisted), scoped to the report
  subtree — and **printing is always forced to light**, on white, with colours preserved.
  This is the one sanctioned exception to §2.1.

### L5 — Design showcase (`/showcase`)
Internal reference page for the design system (primitives, chart styles, status states).
Not part of the student flow. *Note: it renders a `ConnBadge` connection-status primitive
that is a leftover from the two-device era and is no longer used anywhere in the app.*

---

## 6. *(removed — phone screens)*

The six phone screens that were specified here (P0–P6) no longer exist; there is no phone
client. See [Appendix H](#appendix-h--superseded-the-two-device-flow).

---

## 7. ROI selection interaction spec (L3.1)

Still the most detailed interaction in the app, and still a named component
(`RoiBoxEditor`).

- **Surface:** the uploaded lamp photo, shown at a workable size (the strip is wide and short).
- **Create:** drag to draw a rectangle; or accept **"Use full strip"** (the pre-cropped default).
- **Adjust:** drag the box body to move; drag edge/corner handles to resize. Constrain within
  image bounds. **Mouse and touch both required** (tablet is a first-class size); the rect is
  stored in **image pixels**, not display pixels.
- **Feedback:** live readout of the rectangle, a live canvas preview of the extracted region,
  the live **orientation suggestion + "Region clarity" %**, and the live **dark-margin verdict**.
- **Validation:** a zero-area box is blocked. A box without enough dark margin at each end
  turns the box and handles orange, names the measured per-end percentages, and blocks
  **Save region** — but never blocks "Use full strip".
- **Persistence:** the ROI is fixed for the whole experiment (every measurement reuses it).
  Make "this applies to every measurement" explicit.
- **Re-extract:** changing the ROI, the orientation, or the gamma switch **re-extracts every
  stored capture** and recomputes the calibration. This is the one genuinely slow operation
  in the app — it deserves a progress affordance, and the student should be told prior
  captures are being recomputed.
- **States:** no image; no ROI yet; drawing; margin check failing; set; re-extracting.

---

## 8. State catalogue (design these explicitly)

| State | Where | What the student sees / does |
|-------|-------|------------------------------|
| **Saturation warning** | after any capture | Non-blocking but attention-getting: "X% of pixels are over-exposed — your reading may be too low. Reduce the light or add a filter and recapture." |
| **ROI margin failure** | L3.1 | Box + handles turn orange; measured per-end percentages; **Save region** disabled; "Use full strip" still offered. |
| **Low calibration R²** | L3.2 | "This fit doesn't look right — the peaks may be mis-detected. Recapture the lamp." |
| **Too few standards** | L3.4 | Continue blocked: "Add at least 2 standards to build a calibration curve." (Counts *usable* standards.) |
| **Out-of-range unknown** | L3.5 | "This absorbance is outside your standards' range — the result is extrapolated and less reliable." |
| **Re-extracting all captures** | L3.1 | Progress + "recomputing your earlier measurements with the new region". |
| **Empty** | L0, L3.4 | Friendly first-use guidance + a single clear CTA. |
| **Not found** | `/experiment?id=…`, `/report?id=…` | The id isn't in *this* browser's IndexedDB — say that plainly, and offer Import. Data is per-browser, so a shared link genuinely won't work. |
| **Storage lost** | L0 | Clearing site data wipes everything. Surface Export as the mitigation *before* it matters. |
| ~~Loading / processing~~ | ~~after every capture~~ | **Not needed** — analysis is local and instant. |
| ~~Connection lost / expired QR / upload failed~~ | ~~both devices~~ | **Removed** — nothing to connect to. |

---

## 9. Content & tone

- **Audience:** students learning the concepts for the first time. Plain language, no
  unexplained jargon; introduce terms (I₀, λmax, absorbance, Beer-Lambert) *with* their
  meaning the first time.
- **Voice:** encouraging lab-partner, not a textbook. Short sentences. Always answer "why am
  I doing this?"
- **Mode-aware wording is centralised** in `experimentTerms(mode)` — absorbance vs
  fluorescence relabel the blank, the signal, and the review step. Don't hard-code either
  vocabulary in a component.
- **Draft copy** is embedded per screen in §5 and lives in code as `STEP_GUIDANCE`.

---

## 10. Accessibility & responsive notes

- **Dark theme must still meet contrast** for text and chart lines (dark ≠ low-contrast).
  This is a real tension with §2.1 — legibility must be achieved *within* a dark, low-emission
  palette.
- **Charts need non-colour cues** (labels, markers, shapes) — don't rely on hue alone for
  peaks or series. *(Peak markers are deliberately tinted by true wavelength colour, so the
  labels and the table carry the identity.)*
- **Target sizes:** desktop/laptop first; **tablet** as a secondary size (the wizard reflows).
- **Touch + pointer:** ROI editing and λmax dragging must work with both.
- **Print:** the report must print legibly on white — see L4.

---

## Appendix H — SUPERSEDED: the two-device flow

*Retained so a future reader knows what was designed and why it went away. None of this
exists in the app.*

The app originally paired a **laptop** (the brain: guidance, ROI, charts, results) with a
**phone running the native Flutter app** (the lens: scan QR → join session → lock
focus/exposure → capture → upload). The rationale was hardware **focus/exposure lock** —
absorbance compares intensity across photos, so a camera that re-runs auto-exposure between
shots invalidates the comparison.

**Screens that no longer exist:**

| ID | Screen | Purpose |
|----|--------|---------|
| L2 | Pairing | Show the QR, confirm the phone connected, manual join-code fallback |
| P0 | Phone home / join | "Scan to join a session" |
| P1 | QR scanner | Scan the laptop's QR; invalid/expired handling |
| P2 | Connected / idle | "Connected ✓ — watch your laptop for steps" |
| P3 | Capture prompt | "Capture the BLANK" / "Capture Standard 2 (5 mg/L)" — reactive to the laptop |
| P4 | Camera / shooting | Live view, focus/exposure **lock**, framing guide, shutter |
| P5 | Review capture | Confirm / retake |
| P6 | Uploading / done | Progress, then "Sent ✓ — look at your laptop" |

**The pairing & capture choreography** (the novel UX, designed as a synchronised two-screen
sequence):

```
MOMENT                    LAPTOP shows                          PHONE shows
─────────────────────────────────────────────────────────────────────────────────
1. Setup done             L2: large QR + "Scan with the         P0/P1: "Scan to join"
                          Spectro app on your phone"                → scanner
2. Phone scans            QR + "Waiting for phone…"             P1: framing the QR
3. Joined                 ✓ "Phone connected" (badge fills,     P2: "Connected ✓ — watch
                          auto-advance to first step)               your laptop for steps"
4. Step needs photo       L3.x: guidance + "📷 Capture on       P3: prompt card "Capture
                          your phone" + waiting indicator           the BLANK" + [Open camera]
5. Student shoots         still "Waiting for capture…"          P4: live view, lock, shutter
6. Review on phone        still waiting                        P5: photo + [Retake] [Use]
7. Upload                 spinner "Receiving image…"            P6: progress bar
8. Processed              spectrum appears + "What we measured" P2: "Sent ✓ — check laptop"
9. Next step              advances; repeats from moment 4       returns to idle
```

Its design requirements were: connection state always visible on both devices; a patient,
unmistakable "waiting for capture" state on the laptop; a phone that is purely **reactive**
(it shows exactly what the laptop asked for, so the student never has to remember the order);
and easy **re-pairing** without losing progress.

A later refinement — never shipped — required the camera to be a **single continuous session
with a single exposure lock held across every capture**, rather than reopening the camera per
shot. That is fully specified, with per-platform lock semantics (AVFoundation, CameraX,
`getUserMedia`) and a working prototype, in
[`design_handoff_continuous_camera/`](design_handoff_continuous_camera/). **Its
`getUserMedia` path is the one route by which exposure lock could return to the current
static app** — in-browser, one device, no server.

**Why it all went away:** the cost was an entire distributed system (server, database, auth,
realtime channel, upload endpoint, pairing handshake, plus a second app to ship and install)
for one hardware guarantee. The user chose a single static page instead: nothing to install,
no account, no server, no data leaving the machine. Exposure consistency became a matter of
guidance and the saturation warning rather than hardware enforcement — a trade-off made
knowingly. See [web-refactor-plan.md §B](web-refactor-plan.md#b-why-the-two-device-design-was-abandoned).
