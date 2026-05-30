# Handoff: Continuous Camera Capture Session (Photo Spectrometer)

## Overview
The Photo Spectrometer is a two-device classroom experiment: a **laptop web app** (the "Spectro Web" wizard) drives the experiment and does the analysis, and a **paired phone** acts as the camera. The student walks through a calibration + measurement flow (frame → lamp → blank → standards → unknown), photographing a spectrum strip at each step. The laptop computes a Beer–Lambert calibration and reports the unknown's concentration.

This handoff documents a **specific architectural fix**: the capture flow must be **one continuous camera session**, not a series of independent camera open/close cycles.

### The problem being solved
In the original design, every capture step performed a full round-trip: open camera → lock focus/exposure → shoot → upload → **close camera**. The next step re-opened the camera from scratch, which forced the device to acquire a **brand-new auto-exposure (AE), auto-focus (AF), and ISO lock** each time. Because absorbance is computed by comparing light intensity across photos (I vs. I₀), photos taken under different exposure settings are scientifically invalid — the blank, standards, and unknown were each captured under different exposure baselines.

### The fix
The camera opens and locks **exactly once**, then stays live for the entire run. Each step swaps a **text overlay prompt** on top of the live viewfinder ("Now shoot · 3 of 5 · Capture the BLANK"). The shutter uploads in the **background** while the camera stays live. When the laptop receives a photo it advances and the overlay updates to the next prompt — so the student only ever taps the shutter; the camera is never torn down between captures and the exposure lock is held the whole time.

---

## About the Design Files
The files in this bundle are **design references created in HTML/React (via inline Babel JSX)** — a working prototype that demonstrates the intended look and the continuous-session behavior. They are **not production code to ship directly**. The task is to **recreate this behavior in the target codebase** — a real native camera app or web app — using its established camera APIs and patterns. The HTML prototype *simulates* the camera with a static spectrum strip; a real implementation must apply the same session/lock semantics to an actual camera stream.

The most important thing to carry over is the **state model and lifecycle**, not the pixels.

## Fidelity
**High-fidelity (hifi)** for layout, copy, color, and interaction flow. Exact tokens and component specs are below. The simulated viewfinder image is a placeholder — real camera preview replaces it.

---

## The Core Behavioral Contract (read this first)

This is the heart of the handoff. The implementation MUST guarantee:

1. **Single camera session.** The native camera/capture device is acquired **once** at the start of the run and released **only** when the experiment ends (or is explicitly cancelled). It is NOT released between individual captures.

2. **Single exposure/focus lock.** AE, AF, and ISO (white balance too, ideally) are locked **once**, right after the camera opens, and that lock is **held for every subsequent capture**. Implementation notes per platform:
   - **iOS (AVFoundation):** set `AVCaptureDevice.exposureMode = .locked`, `focusMode = .locked`, `whiteBalanceMode = .locked` after the first lock; do NOT reset to `.continuousAuto*` between shots. Keep one `AVCaptureSession` running.
   - **Android (CameraX/Camera2):** use a single bound `Camera` / `CameraCaptureSession`; apply `CONTROL_AE_LOCK = true`, `CONTROL_AWB_LOCK = true`, and a fixed/locked AF, persisted across capture requests.
   - **Web (getUserMedia):** keep one `MediaStream` / `<video>` track alive for the whole flow. Use `track.applyConstraints({ advanced: [{ exposureMode: 'manual', focusMode: 'manual', whiteBalanceMode: 'manual' }] })` where supported; never stop/restart the track between captures.

3. **Retake does NOT drop the lock.** Retaking a shot returns to the live aiming state with the **same** exposure lock retained.

4. **Background upload, camera stays live.** After the shutter, the photo uploads asynchronously while the viewfinder remains live and interactive. No full-screen "uploading" takeover that suspends the camera.

5. **Laptop drives the prompt hands-free.** When the laptop reaches a capture step it auto-requests the next shot; the phone overlay updates in place (no new "open camera" screen). When the laptop confirms receipt, it advances and the next prompt appears.

6. **Connection loss preserves the session.** If the laptop↔phone link drops, the camera session and the exposure lock are **retained**; the flow resumes on reconnect. Never tear down the camera on a transient disconnect.

---

## Capture Sequence

The run is a fixed ordered sequence of 5 capture types. The phone shows a progress rail (Frame · Lamp · Blank · Standards · Unknown).

| # | type | Prompt title | Why (shown to student) | Marks complete when |
|---|------|--------------|------------------------|---------------------|
| 1 | `framing` | Frame the strip | A still so you can lock the region every measurement shares. | `roi` set |
| 2 | `lamp` | Capture the lamp | Its known emission lines tell us which pixel is which colour. | `calib.done` |
| 3 | `blank` | Capture the BLANK | Solvent-only — your 100%-light reference (I₀). | `blank.done` |
| 4 | `standard` | Capture a STANDARD | A known concentration to anchor the calibration line. | ≥1 standard `done` (repeatable — one per added concentration) |
| 5 | `unknown` | Capture your UNKNOWN | The sample whose concentration we want to find. | `unknown.done` |

`standard` is repeatable: the student adds N known concentrations on the laptop and captures one photo each, all within the same continuous session.

---

## State Management

Single reducer store (see `store.jsx`). Key capture-related state:

```
phone:     'P0' | 'P1' | 'P2' | 'P3' | 'PCAM'   // current phone screen
camOpen:   boolean   // camera session opened — STAYS true for the whole run
camLocked: boolean   // AE/AF/ISO locked once — held for every capture
conn:      'offline' | 'pairing' | 'connected' | 'lost'
capture:   null | {
             type:     'framing'|'lamp'|'blank'|'standard'|'unknown',
             conc:     number|null,   // for standards
             id:       string|null,   // standard row id
             phase:    'aim'|'review'|'uploading'|'receiving'|'done',
             progress: number          // 0–100 upload %
           }
```

### Phone screens
- `P0` — phone home
- `P1` — QR scanner (pairing)
- `P2` — idle / paired, waiting
- `P3` — **one-time** "Open your camera once — keep it open" primer (shown ONLY before `camOpen` is true)
- `PCAM` — **the continuous live camera session** (used for ALL captures once open)

### Capture phases (within `PCAM`)
- `aim` — live viewfinder, shutter armed, overlay shows the current prompt
- `review` — froze the shot for confirm/retake (lock retained)
- `uploading` — background upload pill over the live camera; `progress` animates 0→100
- `receiving` — laptop is receiving + analysing; camera stays live
- `done` — analysis applied; auto-clears, ready for next prompt

### Key actions and transitions
```
REQUEST_CAPTURE {capType,conc,id}
   → sets capture {phase:'aim'}; phone = camOpen ? 'PCAM' : 'P3'
     (if session already live, ONLY the overlay updates — no re-open)
PHONE_OPEN_CAMERA   → phone='PCAM', camOpen=true   (first capture only)
PHONE_LOCK          → camLocked=true               (once; held thereafter)
PHONE_SHOOT         → capture.phase='review'
PHONE_RETAKE        → capture.phase='aim'           (lock NOT dropped)
PHONE_USE           → capture.phase='uploading'
UPLOAD_PROGRESS {v} → capture.progress=v
UPLOAD_DONE         → phone='PCAM', capture.phase='receiving'  (camera stays live)
PROCESS_CAPTURE     → applies result to step data; capture.phase='done'
CLEAR_CAPTURE       → capture=null
```

### Choreography timers (prototype simulation — replace with real async)
- `uploading`: progress ticks ~+6–18% every 130ms; at 100% waits 320ms → `UPLOAD_DONE`. **Real app:** drive `progress` from the actual upload; fire the receiving step on server ack.
- `receiving`: after ~1500ms → `PROCESS_CAPTURE`. **Real app:** when the laptop confirms it has the image + finished analysis.
- `done`: after ~1600ms → `CLEAR_CAPTURE`. **Real app:** when the laptop advances to the next step.

### Laptop-side auto-request (hands-free)
On arriving at a capture step, the laptop's `CaptureCTA` fires `REQUEST_CAPTURE` once (on mount, only if no capture is in progress). This is what makes the phone overlay track the laptop automatically.

---

## Screens / Views

### Phone — `P3` one-time camera primer
- Shown only before the session is live. Full-height dark panel, vertically centered.
- Chip "One camera session" (accent). Heading 25px/700: "Open your camera once — keep it open".
- Body 14px `--t2`: explains a single locked session shares one baseline.
- Three feature rows (icon + 13px `--t2`): "Camera opens and stays live", "Lock exposure once — held all session", "Each photo uploads in the background".
- Primary button "Open camera" (icon `cam`) → `PHONE_OPEN_CAMERA`.

### Phone — `PCAM` continuous camera (the main screen)
Full-bleed black. Rendered ONCE; never unmounted between captures.

- **Live viewfinder** (`position:absolute; inset:0`): radial dark gradient backdrop; centered 80%-width framing region with a guide border — `dashed rgba(255,255,255,.26)` when unlocked, `solid rgba(82,224,166,.55)` when locked. (Prototype draws a `SpectrumStrip` here; real app draws the camera preview.)
- **Top chrome** (`top:52px`, two rows, `z-index:6`):
  - Lock badge pill: unlocked = "exposure unlocked" (`--t3`, `--line`); locked = "AE · AF · ISO held" (`--ok`, green border, lock icon). This badge is the visible proof the lock is held.
  - Record dot + status ("REC" when connected, else the conn state) with a pulsing dot.
  - Progress rail card (`rgba(0,0,0,.42)`, blur): the 5 segments Frame/Lamp/Blank/Standards/Unknown — done = `--ok`, active = `--accent` (glow), pending = faint.
- **Prompt overlay** (`top:150px`, `z-index:6`, swaps per phase, `.fade` keyed by type):
  - idle (no capture): "Camera held open & locked / Waiting for your laptop's next step…"
  - aim/review: uppercase accent eyebrow "Now shoot · N of 5", 19px/700 title, 12.5px `--t2` why-text.
  - uploading/sent: pill with spinner→check, "Uploading {title}" with a thin progress bar → "Sent — analysing on your laptop"; a small "background" tag.
- **Connection-lost veil** (`z-index:7`, only when `conn==='lost'`): dark overlay, "Reconnecting…", reassurance that lock + progress are kept. Camera/lock are NOT torn down.
- **Bottom controls** (`bottom:30px`, `z-index:6`):
  - If not locked: explainer + primary "Lock focus & exposure" button → `PHONE_LOCK`.
  - If reviewing: a raised card with thumbnail + verdict ("Sharp & well-exposed" in `--ok`, or "Too bright — may clip. Retake." in `--warn`) + Retake (ghost) / "Use & upload" buttons.
  - Else (locked, aiming/uploading/sent): the **shutter** — 72px ring, enabled only in `aim`; caption reflects state ("Hold steady and tap the shutter" / "Uploading in the background…" / "Saved — next prompt coming up").

### Laptop — `CaptureCTA` (in `wizard.jsx`)
The main-canvas content while a capture step is active.
- Before request: dashed card with `cam` icon, step title + why, "Ask phone to capture" button (auto-fires on mount anyway), subtext "Updates the prompt on your live camera".
- While active: centered pulsing camera/spinner ring; "Phone is shooting the …" / "Receiving image…"; phase subtext; and once the session is live, a reassurance line with a lock icon: "Same locked exposure as every other shot — no re-calibration."

---

## Interactions & Behavior
- **Auto-advance:** student only taps the shutter (and Lock once, Use/Retake on review). Laptop arrival → auto request → overlay update → shoot → background upload → laptop receive → auto advance.
- **Animations:** `.fade` (0.4s) on screen/overlay swaps, keyed so each new prompt re-animates; `.rise` on the review card; `pulse-soft` on the REC dot; `pulse-ring` on the laptop waiting ring; progress bars transition `width .12s`.
- **Saturation warning** (`demoSat` scenario): blank/unknown review shows the "Too bright — may clip" warning instead of the OK verdict.
- **Connection loss** (`conn==='lost'`): veil over the live camera; session retained.

---

## Design Tokens (exact, from `styles.css`)

Colors are OKLCH. Surfaces are intentionally dark / low-emission (the phone is a light source near the sample).
```
--desk      oklch(0.145 0.012 255)   --bg        oklch(0.178 0.012 256)
--panel     oklch(0.214 0.013 256)   --panel-2   oklch(0.246 0.014 256)
--raised    oklch(0.285 0.015 256)   --line      oklch(0.318 0.016 256)
--line-soft oklch(0.262 0.014 256)
--t1 oklch(0.945 0.005 250)  --t2 oklch(0.745 0.011 256)
--t3 oklch(0.585 0.013 258)  --t4 oklch(0.475 0.013 258)
--accent      oklch(0.825 0.118 199)   (spectral cyan; user-overridable)
--accent-dim  oklch(0.46 0.07 199)     --accent-glow oklch(0.825 0.118 199 / .30)
--ok     oklch(0.80 0.15 152)   --warn  oklch(0.82 0.135 79)   --danger oklch(0.685 0.175 26)
(+ matching *-bg at ~0.13–0.15 alpha)
spectrum gradient (400→700nm): #7b2ff7 → #4453ff → #2b8fff → #1ad6d6 → #38d65a → #d6d61a → #ff9a1a → #ff3b3b
```
Type: `Space Grotesk` (sans), `IBM Plex Mono` (mono).
Radii: `--r-sm 7px · --r-md 11px · --r-lg 16px · --r-xl 22px`.
Shadow: `0 18px 50px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.02)`.
Phone device frame in prototype: 332×684.

## Assets
No raster assets. Icons are inline SVG (`Ic` component in `ui.jsx`). The spectrum strip is CSS-gradient generated. The viewfinder image is simulated — replace with the real camera preview.

## Files (in this bundle)
- `store.jsx` — reducer, capture state machine, choreography timers (**primary reference for the behavioral contract**)
- `phone.jsx` — phone screens incl. `P3_Prompt` (one-time primer) and `P_Camera` (the continuous session)
- `wizard.jsx` — laptop `CaptureCTA` (auto-request, waiting states)
- `steps.jsx` — per-step laptop canvas content
- `laptop.jsx`, `shell.jsx` — laptop sessions/pairing + wizard shell
- `app.jsx` — desk composition (laptop + phone side by side) + Tweaks
- `ui.jsx`, `sci.jsx`, `charts.jsx`, `data.jsx`, `styles.css` — primitives, science helpers, charts, scenario data, tokens
- `index.html` — entry point / script load order

To run the prototype: open `index.html`. Pixel reference lives in `phone.jsx` (`P_Camera`) and the behavioral source of truth in `store.jsx`.
