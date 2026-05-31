# Spectro Web

The laptop-side **guide & analysis** app for the Lego Spectrophotometer. The
phone (the native Flutter app in [`../mobile`](../mobile)) is a focus-locked
camera; everything else — guidance, ROI, charts, results, export — happens here.

See the planning docs in [`../docs`](../docs): `web-refactor-plan.md`
(architecture), `web-ux-brief.md` (screens), and
`design_handoff_continuous_camera/` (visual system + continuous-capture state
machine).

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) · **React 19** |
| UI | **HeroUI v3** components, re-skinned with the design-handoff dark OKLCH tokens (**Tailwind v4**) |
| Auth | **Auth.js (NextAuth v5)** Credentials provider — email + password (`bcryptjs`), JWT sessions; register + self-service reset |
| DB | **Prisma 7** + **PostgreSQL** (via the `@prisma/adapter-pg` driver adapter) |
| Image decode | **sharp** (libvips), server-only |
| Analysis | **TypeScript port** of the Dart algorithms — `src/lib/analysis` |
| Charts | Recharts (added; wired in the wizard pass) |

## Getting started

```bash
# 1. install
npm install

# 2. start Postgres + a dev mail inbox (Mailpit)
docker compose up -d

# 3. configure env
cp .env.example .env       # then: npx auth secret  → paste into AUTH_SECRET

# 4. create the schema
npm run prisma:migrate     # or: npm run db:push

# 5. run
npm run dev                # http://localhost:3000
```

Register at `/login` → "Create an account". Password-reset emails (the only
email the app sends) land in Mailpit at <http://localhost:8025> in development.

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — Vitest (unit + golden-data analysis tests)
- `npm run lint` — ESLint (flat config)
- `npm run typecheck` — `tsc --noEmit`
- `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` / `db:push`

## The "middle ground" theme

We use **HeroUI v3** for accessible, community-maintained interactive components
(Button, Card, Input, Modal, Tabs…) and re-skin its semantic CSS variables
(`--background`, `--surface`, `--accent`, `--default`, `--border`, …) with the
**design handoff's** dark, low-emission OKLCH palette in
[`src/app/globals.css`](src/app/globals.css). The signature scientific pieces the
component library doesn't provide — the spectrum logo mark, the visible-spectrum
gradient bar, the connection badge, status chips and the big mono readouts — are
ported as token-styled primitives in
[`src/components/ui/primitives.tsx`](src/components/ui/primitives.tsx).

Dark mode is an **experimental requirement** (stray screen light contaminates the
measurement), so the app is dark-only (`.dark` is always on `<html>`).

Browse it all at **`/showcase`**.

## Analysis core (the science)

`src/lib/analysis` is a faithful TypeScript port of the Dart algorithms in
`../mobile/lib/core`, behind a single module seam so it can later be swapped for
a Python sidecar (see `web-refactor-plan.md` §5):

- `gamma` (sRGB→linear) · `extractIntensityProfile` (luminance vs max-channel) ·
  `checkSaturation`
- `linearRegression` · `movingAverage` · `findLocalMaxima`
- `detectCalibrationPeaks` / `buildCalibration` (pixel→λ)
- `computeAbsorbance` (A = −log₁₀(I/I₀)) · λmax · Beer-Lambert curve

`decodeImage` (sharp) is **server-only** — import it from
`@/lib/analysis/decode`, not the barrel.

**Decoder note:** the web port decodes JPEGs with sharp + EXIF auto-orient
(`.rotate()`), which the Dart `image` package does implicitly. Omitting it
silently mirrors the spectrum (wavelength axis reversed). sharp and the Dart
`image` package can still differ at the sub-peak level; the golden test
(`test/analysis.golden.test.ts`) therefore pins the decoder-robust science
(λmax, Beer-Lambert linearity, absorbance ordering) tightly and the calibration
as a structural + snapshot anchor.

## Data model

`prisma/schema.prisma` holds the Auth.js tables plus the spectro domain — an
`Experiment` (the shared two-device unit; named to avoid colliding with Auth.js's
`Session`) owning pairing/step state, the ROI, the calibration, `SpectralImage`s,
`Standard`s and `Unknown`s. See `web-refactor-plan.md` §7.

## What's next (not in this foundation pass)

Guided wizard UI (setup → pairing → capture → calibration → blank → standards →
absorbance review → unknown → results), the SSE realtime channel + capture
upload route handlers, the ROI editor, charts, and CSV export.
