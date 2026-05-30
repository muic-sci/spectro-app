# Spectro Web — UX/UI Design Brief

> **What this document is**
> A **screen-by-screen UX brief** for the web-first Spectro refactor, written to be handed to a designer (e.g. Claude design) to produce detailed UI. It covers every screen on both devices, their states, the interactions, the cross-device pairing choreography, and **draft educational copy**.
>
> **Companion document:** [web-refactor-plan.md](web-refactor-plan.md) — the architecture/engineering plan (data model, algorithms, API, stack). Read that for *how it's built*; read this for *what the student sees and does*.
>
> **Scope note:** this brief specifies **layout intent, content, states, and behaviour** — the *what* and *why* of each screen. It deliberately does **not** prescribe the visual design (colour palette, type scale, spacing, component styling) beyond the hard constraints in §2. Those are for the designer to create.

---

## 1. The product in one line

Two devices, one session: a **laptop guides and analyses**, a **phone (native app) is a focus-locked camera**. The student is taught Beer-Lambert quantitative analysis one step at a time, capturing photos on the phone and seeing everything explained and computed on the laptop.

---

## 2. Design principles & hard constraints

**Hard constraints (non-negotiable):**

1. **Dark UI everywhere — this is an experimental requirement, not a preference.** The phone and laptop are physically near the spectrophotometer; stray screen light contaminates the measurement. Both the web app and the phone capture screens must be dark, low-emission, and avoid large bright/white areas. Favour dark backgrounds, restrained accent colour, and a "darkest practical" capture screen on the phone. *(The detailed palette is the designer's call — the darkness is not.)*
2. **Two devices, clear division of labour.** The laptop is the brain (guidance, ROI, charts, results). The phone only captures and uploads. Never make the student do analysis on the small screen.
3. **The science must read clearly.** Charts, peaks, R², λmax, and concentrations are the payload — they get visual priority over chrome.

**Guiding principles (designer should honour the spirit):**

- **Guidance-first.** Every step answers *Why am I doing this?*, *What do I do?*, *What did we measure?* The teaching is the product.
- **One step at a time.** A linear wizard; no overwhelming dashboards. The student always knows where they are and what's next.
- **The cross-device hand-off must feel effortless.** Pairing and "now take a photo" are the novel moments — they must feel obvious and reassuring, never confusing.
- **Fail gently and instructively.** Saturation, bad calibration, dropped connection — each failure is a teaching moment with a clear fix, not a dead end.

---

## 3. Device roles & screen inventory

### Laptop (Spectro Web — the guide & analysis)
| ID | Screen | Purpose |
|----|--------|---------|
| L0 | Session list / landing | Create a new experiment or resume one |
| L1 | Experiment setup | Choose mode + reference light type + name |
| L2 | Pairing | Show QR, confirm phone connected |
| L3 | Wizard shell | Persistent frame: step rail + guidance panel + main canvas + nav |
| L3.1 | Step — Camera & ROI setup | Frame strip on phone; draw ROI on web |
| L3.2 | Step — Wavelength calibration | Capture lamp; detect peaks; fit pixel→λ |
| L3.3 | Step — Blank (I₀) | Capture incident-light reference |
| L3.4 | Step — Standards | Capture ≥2 known concentrations |
| L3.5 | Step — Absorbance review | Confirm λmax; view Beer-Lambert curve |
| L3.6 | Step — Unknown | Capture unknown; read off concentration |
| L3.7 | Step — Results & export | Summary, table, CSV/share |

### Phone (native app — the camera)
| ID | Screen | Purpose |
|----|--------|---------|
| P0 | Home / join | Entry; "Scan to join a session" |
| P1 | QR scanner | Scan the laptop's QR |
| P2 | Connected / idle | "Connected — waiting for the next step" |
| P3 | Capture prompt | Short "what to shoot & why" for the requested capture |
| P4 | Camera / shooting | Live view, focus/exposure lock, framing guide, shutter |
| P5 | Review capture | Confirm / retake the photo |
| P6 | Uploading / done | Progress, then "sent — look at your laptop" |

### Shared overlays / global states (both devices)
Capture-in-progress (laptop waiting), saturation warning, low calibration R² warning, connection lost / reconnecting, generic error, empty/loading.

---

## 4. The pairing & capture choreography (the novel UX)

This is the riskiest, most important flow. It must be designed as a **synchronised two-screen sequence**. The brief below pairs laptop state ↔ phone state at each moment.

```
MOMENT                    LAPTOP shows                          PHONE shows
─────────────────────────────────────────────────────────────────────────────────
1. Setup done             L2: large QR + "Scan with the         P0/P1: "Scan to join"
                          Spectro app on your phone"                → scanner
2. Phone scans            QR + "Waiting for phone…"             P1: framing the QR
3. Joined                 ✓ "Phone connected" (badge fills,     P2: "Connected ✓ — watch
                          auto-advance to first step)               your laptop for steps"
4. Step needs photo       L3.x: guidance + "📷 Capture on        P3: prompt card "Capture
                          your phone" + waiting indicator           the BLANK" + [Open camera]
5. Student shoots         still "Waiting for capture…"          P4: live view, lock, shutter
6. Review on phone        still waiting                         P5: photo + [Retake] [Use]
7. Upload                 spinner "Receiving image…"            P6: progress bar
8. Processed              spectrum appears + "What we measured"  P2: "Sent ✓ — check laptop"
                          + saturation check
9. Next step              advances; repeats from moment 4       returns to idle, awaits prompt
```

**Design requirements for this flow:**
- The **connection state is always visible** on both devices (a persistent badge: connected / reconnecting / lost).
- The laptop's "waiting for capture" state must be unmistakable and patient — it's normal to wait while the student walks to the rig.
- The phone is **reactive**: it shows *exactly* what the laptop asked for (blank vs standard vs unknown), so the student never has to remember the order.
- **Re-pairing** must be easy if the phone disconnects (re-show QR / one-tap reconnect) without losing session progress.

---

## 5. Laptop screens (detailed)

### L0 — Session list / landing
- **Purpose:** start fresh or resume.
- **Layout intent:** dark, calm. A prominent **"New experiment"** action; below it, a list of saved/in-progress sessions (name, mode, date, step reached).
- **Elements:** New-experiment button; session cards with a small progress indicator; empty state for first-time users.
- **States:** empty (no sessions → friendly intro + single CTA); populated; loading.
- **Copy (empty):** *"No experiments yet. Start one and we'll walk you through measuring concentration with light."*

### L1 — Experiment setup
- **Purpose:** the two up-front choices the workflow needs.
- **Elements:**
  - **Name** the experiment.
  - **Experiment mode** selector (initially Beer-Lambert quantitation; designed to grow). Each mode shows a one-line description.
  - **Reference light type** selector (e.g. fluorescent lamp → loads the 5 known peaks 434.5 / 486 / 544 / 587 / 611.5 nm). Show the implication ("we'll calibrate using these known emission lines").
  - Continue → goes to pairing.
- **Layout intent:** form-light, explanatory. Each choice has a short *why it matters* note.
- **States:** default; validation (name required); mode/light descriptions on hover/focus.
- **Copy (mode):** *"Beer-Lambert quantitation — measure an unknown concentration by comparing how much light your sample absorbs against known standards."*

### L2 — Pairing
- **Purpose:** connect the phone to this session.
- **Elements:** large **QR card** (dark-friendly, high-contrast within the dark theme); step text ("Open the Spectro app → Scan to join"); a **connection badge** that animates from "waiting" → "connected"; a manual fallback (short join code) in case the scan fails.
- **Layout intent:** the QR dominates; minimal else. Reassuring.
- **States:** waiting for scan; phone connected (success → auto-advance); phone disconnected later (badge reverts, "re-scan to reconnect").
- **Copy:** *"Scan this with the Spectro app on your phone. Your phone becomes the camera — everything else happens here."*

### L3 — Wizard shell (persistent frame for all steps)
Every step screen (L3.1–L3.7) lives inside one consistent frame:
- **Step rail** (left or top): the 7 steps with current/done/upcoming states. Shows the student where they are.
- **Guidance panel:** the teaching surface — *Why this step* (collapsible, like today's `info_card`), *What to do* checklist, and after a capture, *What we measured*.
- **Main canvas:** the step's working area (chart, ROI editor, table…).
- **Connection badge:** persistent.
- **Nav:** Back / Continue (Continue disabled until the step's requirement is met). Continue states must make prerequisites obvious ("Capture a blank to continue").

The sub-screens below describe only their **main canvas + guidance specifics**.

#### L3.1 — Camera & ROI setup
- **Goal:** lock the framing once, define the ROI all measurements share.
- **Canvas:** a still frame returned from the phone; the student **draws/drags a rectangle (ROI)** over the spectral strip. Live numeric feedback (position/size). A "use full strip" shortcut (maps to the pre-cropped default).
- **Interaction:** see [§7 ROI spec](#7-roi-selection-interaction-spec).
- **Guidance:** *Why:* "Every measurement must come from the exact same region so they're comparable." *Do:* "On your phone, frame the rainbow strip and lock focus. Here, drag a box around the strip."
- **States:** no frame yet (prompt to capture a framing shot); frame present + ROI drawing; ROI set (Continue enabled).

#### L3.2 — Wavelength calibration
- **Goal:** turn pixel positions into wavelengths.
- **Canvas:** the lamp **intensity profile chart** with the **5 auto-detected peaks** marked; each peak labelled with its assigned known wavelength; a small **pixel→λ fit readout** (slope, intercept, **R²**) and the fitted line. Allow nudging a misassigned peak.
- **Guidance:** *Why:* "A fluorescent lamp emits at known, fixed wavelengths. By finding those bright lines in your photo, we learn which pixel = which colour." *Do:* "Capture the lamp spectrum. We'll find the 5 lines automatically — check they landed on the bright peaks."
- **States:** awaiting lamp capture; peaks detected & good (R² high, e.g. ≳0.999); **low-R² warning** (peaks likely mis-detected → guidance to re-capture or adjust); manual peak adjustment in progress.
- **Quality cue:** surface R² prominently with a plain-language verdict ("Excellent fit ✓" / "This doesn't look right — try recapturing the lamp").

#### L3.3 — Blank (I₀)
- **Goal:** capture the incident-light reference.
- **Canvas:** the blank intensity profile chart; saturation check result.
- **Guidance:** *Why:* "The blank is your 100%-light reference — the solvent and cuvette with no sample. Absorbance is measured **against** this." *Do:* "Put the solvent-only cuvette in the holder and capture."
- **States:** awaiting capture; captured (profile shown); **saturated → warning** (see §6).

#### L3.4 — Standards
- **Goal:** capture ≥2 solutions of known concentration.
- **Canvas:** a **list/table of standards** (concentration + unit + thumbnail + status), an **add-standard** action (enter concentration, then capture), and overlaid intensity profiles. Enforce ≥2 before the curve.
- **Guidance:** *Why:* "Known concentrations let us draw the calibration line that converts absorbance into concentration. Two points make a line; more make it trustworthy." *Do:* "For each standard: type its concentration, then capture it."
- **States:** zero standards (prompt); 1 standard ("add at least one more"); ≥2 (can proceed to absorbance review); per-row capture/saturation states; edit/delete a standard.

#### L3.5 — Absorbance review (interstitial → its own step)
- **Goal:** confirm λmax and see the Beer-Lambert curve. **No capture here — pure computation.**
- **Canvas:** two linked charts — (a) **absorbance spectra** of all standards with a **draggable/tappable λmax marker**; (b) the **Beer-Lambert scatter** (A@λmax vs concentration) with regression line, slope/intercept/**R²**.
- **Interaction:** tapping/dragging on the spectrum chart sets λmax; the curve rebuilds live.
- **Guidance:** *Why:* "λmax is the wavelength your compound absorbs most — measuring there gives the strongest, most reliable signal. The straight line through your standards is Beer's law: A = ε·l·c." *Do:* "Check λmax sits on the peak. Confirm the line fits your points well."
- **States:** computed & good; **adjust λmax** (live recompute); **poor curve fit warning**.

#### L3.6 — Unknown
- **Goal:** measure the unknown and read its concentration.
- **Canvas:** the unknown's absorbance spectrum with the λmax marker; a **result readout**: A@λmax → **determined concentration** with unit; the unknown's point plotted **on** the calibration line for visual confirmation.
- **Guidance:** *Why:* "Now we reverse the line: measure the unknown's absorbance and read its concentration off the calibration curve (c = (A − b)/m)." *Do:* "Capture your unknown sample."
- **States:** awaiting capture; result shown; saturation/out-of-range warning (absorbance beyond the standards' range → "extrapolating — result less reliable").

#### L3.7 — Results & export
- **Goal:** summarise and take the data away.
- **Canvas:** key results (λmax, calibration equation + R², unknown concentration), the combined charts, a **data table**, and **Export CSV** + **Share**.
- **Guidance:** *Why:* "Here's everything you measured, ready to record in your lab report." *Do:* "Download the CSV or share it."
- **States:** complete; export in progress; share success/fail.

---

## 6. Phone screens (detailed) — native app, camera role

All phone screens are **dark and low-emission** (§2.1). The capture screen especially should minimise on-screen brightness around the live view.

### P0 — Home / join
- **Elements:** app identity; a single primary action **"Scan to join a session"**; (optional) recently joined session to reconnect.
- **Copy:** *"Your phone is the camera. Scan the code on your computer to begin."*

### P1 — QR scanner
- **Elements:** camera viewfinder with a scan reticle; cancel; manual-code entry fallback.
- **States:** scanning; detected (success haptic) → joins; invalid/expired code → "That code's expired — get a fresh one on your computer."

### P2 — Connected / idle
- **Purpose:** the resting state between captures. Reassures the student the phone is linked and waiting.
- **Elements:** big **"Connected ✓"**; session name; a calm "Watch your laptop for the next step" message; connection badge.
- **States:** connected/idle; reconnecting; disconnected (one-tap reconnect / re-scan).

### P3 — Capture prompt
- **Purpose:** tell the student *exactly what to shoot* for the laptop's current request.
- **Elements:** a short title (**"Capture the BLANK"** / "Capture Standard 2 (5 mg/L)" / "Capture the lamp" / "Capture your unknown"), a one-line why, and **[Open camera]**. The phone shows only what was requested — no workflow navigation.
- **States:** prompt active; (if the laptop cancels/changes) prompt updates.

### P4 — Camera / shooting
- **Elements:** live view; **focus & exposure LOCK** control + clear locked indicator (reuse the existing app's focus-lock UX); a **framing guide** for the strip; shutter; the requested-capture label persists at the top so they can't forget what they're shooting.
- **Layout/brightness:** maximise the dark area; keep controls minimal and dim.
- **States:** unlocked (prompt to lock); locked (ready); capturing.

### P5 — Review capture
- **Elements:** the captured photo; **[Retake]** / **[Use this]**. Optionally a quick "looks too bright?" hint if obvious clipping is detected on-device.
- **States:** reviewing; confirmed → upload.

### P6 — Uploading / done
- **Elements:** upload progress; on success **"Sent ✓ — look at your laptop"** then auto-return to idle (P2).
- **States:** uploading; success; failure (retry / re-capture).

---

## 7. ROI selection interaction spec (L3.1)

The single most detailed interaction; designers should treat it as a named component.

- **Surface:** the still frame from the phone, shown at a workable size (the strip is wide and short).
- **Create:** drag to draw a rectangle; or accept a **suggested ROI** (full strip / pre-cropped default).
- **Adjust:** drag the box body to move; drag edge/corner handles to resize. Constrain within image bounds.
- **Feedback:** live readout of the ROI rectangle; ideally a **live preview of the extracted profile** updating as the box changes, so the student sees cause/effect.
- **Persistence:** the ROI is fixed for the whole session (all later measurements reuse it). Make "this applies to every measurement" explicit.
- **Re-extract:** changing the ROI later must re-extract affected profiles (warn that it recomputes prior captures).
- **States:** no ROI yet; drawing; set; invalid (zero-area) blocked with a hint.

---

## 8. State catalogue (design these explicitly)

Every screen needs its non-happy states designed. Recurring ones:

| State | Where | What the student sees / does |
|-------|-------|------------------------------|
| **Loading / processing** | after every capture | laptop: "Receiving / analysing image…"; phone: upload progress |
| **Saturation warning** | after any capture | laptop banner (non-blocking, attention-getting): "X% of pixels are over-exposed — your reading may be too low. Reduce the light or add a filter and recapture." |
| **Low calibration R²** | L3.2 | "This fit doesn't look right — the peaks may be mis-detected. Recapture the lamp or adjust the peaks." |
| **Too few standards** | L3.4 | Continue blocked: "Add at least 2 standards to build a calibration curve." |
| **Out-of-range unknown** | L3.6 | "This absorbance is outside your standards' range — the result is extrapolated and less reliable." |
| **Connection lost** | both | persistent badge + banner; phone offers reconnect/re-scan; laptop holds progress |
| **Expired/invalid QR** | P1 | "Code expired — refresh it on your computer." |
| **Upload failed** | P6 | retry / recapture |
| **Empty** | L0, L3.4 | friendly first-use guidance + single clear CTA |

---

## 9. Content & tone

- **Audience:** students learning the concepts for the first time. Plain language, no unexplained jargon; introduce terms (I₀, λmax, absorbance, Beer-Lambert) *with* their meaning the first time.
- **Voice:** encouraging lab-partner, not a textbook. Short sentences. Always answer "why am I doing this?"
- **Reuse:** the existing app's `info_card` content is a strong starting point for the *Why* panels — port and lightly rewrite for the web.
- **Draft copy** is embedded per screen above; treat it as a starting point for the designer/educator to refine.

---

## 10. Accessibility & responsive notes

- **Dark theme must still meet contrast** for text and chart lines (dark ≠ low-contrast). This is a real tension with §2.1 — the designer must hit legibility *within* a dark, low-emission palette.
- **Charts need non-colour cues** (labels, markers, shapes) — don't rely on hue alone for peaks/series.
- **Laptop target:** desktop/laptop first; **tablet** as a secondary size (the wizard should reflow). The phone app is its own native layout.
- **Touch + pointer:** ROI editing and λmax adjustment must work with both mouse and touch (tablet).
- **Latency feel:** every cross-device action needs an immediate acknowledgement so neither screen feels frozen while the other acts.

---

## 11. What the designer still needs to decide (open for Claude design)

1. **Visual system** — palette (within the dark constraint), type scale, spacing, component styling, motion. *(Intentionally unspecified here.)*
2. **Step-rail placement** — left rail vs top stepper; how the guidance panel coexists with the canvas.
3. **Guidance density** — how much teaching is always-visible vs progressive-disclosure.
4. **Chart styling & interactivity** — how λmax dragging, peak markers, and the regression line look and feel.
5. **Pairing screen treatment** — how to make the QR moment delightful and obvious.
6. **Phone capture screen** — how dark/minimal, where the lock and framing-guide controls sit.
7. **Branding** — does the web app share identity with the existing native app, or get its own?

---

## 12. Verdict on readiness

With this brief **plus** [web-refactor-plan.md](web-refactor-plan.md), a designer has: the screen inventory, each screen's purpose/elements/states, the cross-device choreography, the key interactions (ROI, λmax), draft copy, and explicit constraints (dark = experimental requirement). That is enough to design **detailed UX/UI**. What's intentionally left open is the **visual design itself** (§11) — by your instruction, that's Claude design's job.
