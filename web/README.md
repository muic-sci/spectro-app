# Spectro Web

A **fully static, in-browser** guide & analysis app for the Lego
Spectrophotometer. You open a static site, upload photos of the spectrum strip,
and everything — ROI selection, wavelength calibration, absorbance/fluorescence,
the calibration curve, the report and CSV — runs **entirely in your browser**.
There is no account, no server and no database; experiments and image binaries
live in your browser's **IndexedDB**, and nothing is uploaded anywhere.

See the planning docs in [`../docs`](../docs) and the project summary in
[`../CLAUDE.md`](../CLAUDE.md) for the full architecture + science reference.

## Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, `output: "export"` → static `out/`) · **React 19** |
| UI | **HeroUI v3** re-skinned with the design-handoff dark OKLCH tokens (**Tailwind v4**) · **Recharts** |
| Storage | Browser **IndexedDB** (`src/lib/store`) — experiment JSON + image blobs; export/import to a `.spectro.json` bundle |
| Image decode | **Browser** (`createImageBitmap` + canvas) — `src/lib/analysis/decode.client.ts` |
| Analysis | **TypeScript** algorithms in `src/lib/analysis` (run client-side) |

No Prisma/Postgres, no Auth.js, no server actions, no API routes. `sharp` is a
**devDependency** used only by the Node golden/orientation tests.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000 (dev server; the app itself is static)
```

Open the app, click **Start measuring**, create an experiment, and follow the
wizard. Your experiments persist in this browser; use **Export/Import** on the
list page to back them up or move them between machines.

## Scripts

- `npm run dev` — Next dev server
- `npm run build` — static export → `out/`
- `npm run preview` — serve the built `out/` locally (`npx serve out`)
- `npm test` — Vitest (unit + golden-data analysis tests)
- `npm run lint` — ESLint (flat config)
- `npm run typecheck` — `tsc --noEmit`

## The "middle ground" theme

**HeroUI v3** provides accessible interactive components; we re-skin its semantic
CSS variables with the **design handoff's** dark OKLCH palette in
[`src/app/globals.css`](src/app/globals.css). The signature scientific pieces
(spectrum logo mark, visible-spectrum bar, status chips, mono readouts) are ported
primitives in [`src/components/ui/primitives.tsx`](src/components/ui/primitives.tsx).
Dark mode is an **experimental requirement** (stray screen light contaminates the
measurement), so the app is dark-only — except the **report**, which has its own
light/dark toggle and always prints on white. Browse it all at **`/showcase`**.

## Analysis core (the science)

`src/lib/analysis` holds the pure algorithms (no native deps), run in the browser:

- `srgbToLinear` · `extractIntensityProfile` (luminance vs max-channel) · `checkSaturation` · `scoreOrientation`
- `linearRegression` · `movingAverage` · `findLocalMaxima`
- `calibrateFromLampProfile` / `calibrateFromLaserProfiles` (pixel→λ, collinearity selection, auto-flip)
- `buildSignalSpectrum` (A = −log₁₀(I/I₀) or F = I − I₀) · λmax · calibration curve · `determineConcentration`

`analysis-client.ts` orchestrates decode → ROI extract → calibrate → crop in the
browser; `decode.client.ts` decodes via `createImageBitmap` + canvas. The golden
test (`test/analysis.golden.test.ts`) decodes the `materials/002` fixture with
**sharp** (Node-only devDependency) to pin the decoder-robust science.

## Storage & data

There is no database. `src/lib/store` is the IndexedDB layer:

- `db.ts` — IndexedDB wrapper (`experiments` + `blobs` stores)
- `experiments.ts` — CRUD + capture persistence (`persistCapture`/`persistReextract`/…) + derived-science recompute
- `blobs.ts` — image binaries + `blob:` object-URL cache
- `transfer.ts` — export/import a portable `.spectro.json` bundle
- `export-csv.ts` — build + download the results CSV
- `use-experiment.ts` — the `useExperiment(id)` React hook the wizard/report use

Domain types (the old Prisma enums/models) live in `src/lib/domain-types.ts`.

## Deploy

`npm run build` emits a static `out/` — host it on any static host (or open
`out/index.html`). Production runs through **deployd**: push a `vX.Y.Z` tag →
GitLab CI (`../.gitlab-ci.yml`) builds the root `Dockerfile` (nginx serving
`out/`) and pushes it as `:vX.Y.Z` → deployd verifies tag + green pipeline +
registry image via the GitLab API, then deploys `../docker-compose.prod.yml`,
which pins the image via the injected `${DEPLOYD_TAG}` and gets domain routing
(traefik) from deployd's generated override. See [`../CLAUDE.md`](../CLAUDE.md).
