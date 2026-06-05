import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@heroui/react";
import { requireUserId } from "@/auth-helpers";
import { prisma } from "@/lib/db";
import { modeMeta, lightMeta, experimentTerms } from "@/lib/experiment-meta";
import { parseRoi, parseProfile } from "@/lib/experiment-json";
import { deriveAnalysis } from "@/lib/experiment-analysis";
import { wavelengthToRgb } from "@/lib/wavelength-color";
import { SpectrumChart } from "@/components/charts/spectrum-chart";
import { AbsorbanceChart, type AbsorbanceSeries } from "@/components/charts/absorbance-chart";
import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { CalibrationFitChart } from "@/components/charts/calibration-fit-chart";
import { SpectrumWithStrip } from "@/components/wizard/spectrum-with-strip";
import { DetectedPeaksTable } from "@/components/wizard/detected-peaks-table";
import { PrintButton } from "@/components/report/print-button";
import { RoiPreview } from "@/components/report/roi-preview";
import { Readout, SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";

export const metadata = { title: "Report · Spectro Web" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" });
const SERIES_COLORS = ["#4453ff", "#1ad6d6", "#38d65a", "#d6d61a", "#ff9a1a", "#ff3b3b"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-4">
      <h2 className="border-b border-line-soft pb-2 text-sm font-semibold uppercase tracking-wider text-t3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ImageStrip({ src, label }: { src: string; label: string }) {
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob */}
      <img src={src} alt={label} className="max-h-32 w-auto rounded-md border border-line bg-black" />
      <figcaption className="text-xs text-t3">{label}</figcaption>
    </figure>
  );
}

/** Full experiment report — every captured strip, every plot, every result. */
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();

  const experiment = await prisma.experiment.findFirst({
    where: { id, userId },
    include: {
      images: { orderBy: { capturedAt: "asc" } },
      standards: { include: { image: true }, orderBy: { concentration: "asc" } },
      unknowns: { include: { image: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!experiment) notFound();

  const derived = deriveAnalysis({
    mode: experiment.mode,
    calibration: experiment.calibration,
    lambdaMaxOverride: experiment.lambdaMax,
    images: experiment.images,
    standards: experiment.standards,
    unknowns: experiment.unknowns,
  });

  const calImage = experiment.images.find((im) => im.role === "calibration");
  const calProfile = calImage ? parseProfile(calImage.intensityProfile) : null;
  const blankImage = experiment.images.find((im) => im.role === "blank");
  const roi = parseRoi(experiment.roi);

  // Cropped-to-ROI image URL (exactly what was analysed); ?v= busts on ROI change.
  const version = experiment.updatedAt.getTime();
  const cropped = (url: string) => `${url}/cropped?v=${version}`;
  const unit = derived.standards[0]?.unit;
  const { calibration, curve, lambdaMax } = derived;
  const t = experimentTerms(experiment.mode);
  const isFluor = experiment.mode === "fluorescence";
  const isLaser = experiment.lightType === "laser";

  const absSeries: AbsorbanceSeries[] = derived.standards
    .filter((s) => s.spectrum)
    .map((s, i) => ({
      key: `s${i}`,
      label: `${s.concentration} ${s.unit}`,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: s.spectrum!.points,
    }));
  const curvePoints = derived.standards
    .filter((s) => s.absorbanceAtLambdaMax != null)
    .map((s) => ({ concentration: s.concentration, absorbance: s.absorbanceAtLambdaMax as number }));
  const unknownPoints = derived.unknowns
    .filter((u) => u.concentration != null && u.absorbanceAtLambdaMax != null)
    .map((u) => ({ concentration: u.concentration as number, absorbance: u.absorbanceAtLambdaMax as number }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Home" title="Home" className="shrink-0">
            <SpectroMark size={30} />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-t1">{experiment.name}</h1>
            <p className="text-sm text-t3">
              {modeMeta(experiment.mode).label} · {lightMeta(experiment.lightType).label} ·{" "}
              {dateFmt.format(experiment.updatedAt)}
            </p>
          </div>
        </div>
        <SpectrumBar height={8} />
        <div className="no-print flex flex-wrap items-center gap-3">
          <PrintButton />
          <a
            href={`/api/experiments/${experiment.id}/export.csv`}
            className={buttonVariants({ variant: "secondary" })}
            download
          >
            Export CSV
          </a>
          <Link href={`/experiments/${experiment.id}`} className="text-sm text-t3 hover:text-t1">
            ← Back to wizard
          </Link>
        </div>
      </header>

      {/* Summary */}
      <Section title="Summary">
        <div className="grid grid-cols-2 gap-5 rounded-lg border border-line bg-panel p-5 sm:grid-cols-4">
          <Readout label="λmax" value={lambdaMax != null ? Math.round(lambdaMax) : "—"} unit="nm" tone="var(--accent-color)" />
          {calibration && <Readout label="Pixel→λ R²" value={calibration.rSquared.toFixed(3)} sub="calibration" />}
          {curve && (
            <Readout
              label={isFluor ? "Calibration R²" : "Beer-Lambert R²"}
              value={curve.rSquared.toFixed(3)}
              sub={`${t.signalSymbol} vs c`}
            />
          )}
          <Readout label="Standards" value={derived.standards.length} sub={`${derived.unknowns.length} unknown${derived.unknowns.length === 1 ? "" : "s"}`} />
        </div>
        {derived.unknowns.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {derived.unknowns.map((u, i) => (
              <div key={u.id} className="rounded-lg border border-line bg-panel p-5">
                <Readout
                  label={`Unknown #${i + 1}`}
                  value={u.concentration != null ? +u.concentration.toFixed(3) : "—"}
                  unit={unit}
                  tone="var(--accent-color)"
                  sub={u.outOfRange ? "extrapolated — less reliable" : `${t.signalSymbol} = ${u.absorbanceAtLambdaMax?.toFixed(3) ?? "—"}`}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Camera & calibration */}
      {calImage && (
        <Section title="1 · Camera, region & calibration">
          <div className="flex flex-wrap gap-5">
            <div className="flex flex-col gap-2">
              <RoiPreview imageUrl={calImage.url} roi={roi} />
              <p className="text-xs text-t3">
                {isLaser ? "Combined lasers" : "Lamp capture"} · {experiment.orientation} ·{" "}
                {roi ? `ROI ${roi.width}×${roi.height} px` : "full strip"}
              </p>
            </div>
            {calibration && (
              <div className="grid flex-1 grid-cols-2 content-start gap-4 self-start">
                <Readout label="Slope" value={calibration.slope.toFixed(3)} unit="nm/px" />
                <Readout label="Intercept" value={calibration.intercept.toFixed(1)} unit="nm" />
                <Readout label="R²" value={calibration.rSquared.toFixed(4)} tone="var(--ok)" />
                <Readout label="Peaks" value={calibration.peaks.length} sub={isLaser ? "laser lines" : "lamp lines"} />
              </div>
            )}
          </div>
          {calProfile && calibration && (
            <>
              <SpectrumWithStrip
                points={calProfile}
                calibration={calibration}
                croppedImageUrl={cropped(calImage.url)}
                orientation={experiment.orientation}
                caption={
                  <>
                    {isLaser ? "Combined laser" : "Lamp"} intensity profile; coloured lines + dots
                    are the detected {isLaser ? "laser lines" : "emission peaks"} (nm). The strip
                    below the axis is the captured spectrum, blue (short λ) → red (long λ), left to
                    right.
                  </>
                }
              />
              <DetectedPeaksTable calibration={calibration} profile={calProfile} />
              <div className="rounded-lg border border-line bg-panel p-4">
                <h3 className="mb-1 text-sm font-semibold text-t2">Wavelength vs pixel fit</h3>
                <p className="mb-2 text-xs text-t4">
                  Each dot is a detected {isLaser ? "laser line" : "emission line"} at its pixel
                  position (x) vs known wavelength (y). The line is the least-squares fit{" "}
                  <span className="mono text-t3">
                    λ = {calibration.slope.toFixed(3)}·px + {calibration.intercept.toFixed(1)}
                  </span>{" "}
                  (R² = {calibration.rSquared.toFixed(4)}).
                </p>
                <CalibrationFitChart calibration={calibration} />
              </div>
            </>
          )}
        </Section>
      )}

      {/* Blank */}
      {blankImage && derived.blankProfile && (
        <Section title={`2 · ${t.blankLabel}`}>
          {calibration ? (
            <SpectrumWithStrip
              points={derived.blankProfile}
              calibration={calibration}
              croppedImageUrl={cropped(blankImage.url)}
              orientation={experiment.orientation}
              caption={
                <>
                  {isFluor
                    ? "The blank profile, subtracted from each standard so they show only the dye's emission."
                    : "The incident-light profile (I₀); absorbance compares each sample against this."}{" "}
                  Coloured lines mark the calibration wavelengths (nm); the strip below the axis is
                  the captured spectrum, blue → red, left to right.
                </>
              }
            />
          ) : (
            <div className="flex flex-wrap items-start gap-5">
              <ImageStrip src={cropped(blankImage.url)} label={`${t.blankShort} (cropped)`} />
              <div className="min-w-[260px] flex-1 rounded-lg border border-line bg-panel p-4">
                <SpectrumChart points={derived.blankProfile} xLabel="pixel column" yLabel="intensity" yPrecision={0} height={200} />
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Standards */}
      {derived.standards.length > 0 && (
        <Section title="3 · Standards">
          <div className="flex flex-wrap gap-4">
            {derived.standards.map((s) => (
              <div key={s.id} className="flex flex-col gap-1">
                {s.imageUrl && <ImageStrip src={cropped(s.imageUrl)} label={`${s.concentration} ${s.unit} · ${t.signalSymbol}=${s.absorbanceAtLambdaMax?.toFixed(3) ?? "—"}`} />}
              </div>
            ))}
          </div>
          {absSeries.length > 0 && lambdaMax != null && (
            <div className="rounded-lg border border-line bg-panel p-4">
              <h3 className="mb-2 text-sm font-semibold text-t2">{t.signal} spectra</h3>
              <AbsorbanceChart series={absSeries} lambdaMax={lambdaMax} yLabel={t.signalAxis} />
            </div>
          )}
          {curve && (
            <div className="rounded-lg border border-line bg-panel p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-t2">
                  {isFluor ? "Calibration curve" : "Beer-Lambert curve"}
                </h3>
                <StatusChip tone="accent" mono>
                  {t.signalSymbol} = {curve.slope.toFixed(4)}·c {curve.intercept >= 0 ? "+" : "−"} {Math.abs(curve.intercept).toFixed(4)}
                </StatusChip>
                <StatusChip tone="accent" mono>R² {curve.rSquared.toFixed(4)}</StatusChip>
              </div>
              <CalibrationCurveChart slope={curve.slope} intercept={curve.intercept} standards={curvePoints} unknowns={unknownPoints} unit={unit} yLabel={`${t.signalSymbol} @ λmax`} />
            </div>
          )}
        </Section>
      )}

      {/* Unknowns */}
      {derived.unknowns.length > 0 && (
        <Section title="4 · Unknown samples">
          {derived.unknowns.map((u, i) => (
            <div key={u.id} className="flex flex-wrap items-start gap-5 rounded-lg border border-line bg-panel p-4">
              {u.imageUrl && <ImageStrip src={cropped(u.imageUrl)} label={`Unknown #${i + 1} (cropped)`} />}
              {u.spectrum && (
                <div className="min-w-[240px] flex-1">
                  <SpectrumChart
                    points={u.spectrum.points}
                    peaks={
                      lambdaMax != null
                        ? [{ x: lambdaMax, label: "λmax", color: wavelengthToRgb(lambdaMax) }]
                        : undefined
                    }
                    xLabel="wavelength (nm)"
                    yLabel={t.signalAxis}
                    height={180}
                  />
                </div>
              )}
              <div className="flex flex-col justify-center gap-3">
                <Readout label={`${t.signalSymbol} @ λmax`} value={u.absorbanceAtLambdaMax?.toFixed(3) ?? "—"} />
                <Readout label="Concentration" value={u.concentration != null ? +u.concentration.toFixed(3) : "—"} unit={unit} tone="var(--accent-color)" />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Data table */}
      <Section title="Data">
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-2 text-left text-xs uppercase tracking-wide text-t3">
                <th className="px-3 py-2 font-semibold">Sample</th>
                <th className="px-3 py-2 font-semibold">Concentration</th>
                <th className="px-3 py-2 font-semibold">{t.signalSymbol} @ λmax</th>
              </tr>
            </thead>
            <tbody className="mono">
              {derived.standards.map((s, i) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-3 py-2 text-t2">Standard #{i + 1}</td>
                  <td className="px-3 py-2 text-t1">{s.concentration} {s.unit}</td>
                  <td className="px-3 py-2 text-t1">{s.absorbanceAtLambdaMax?.toFixed(4) ?? "—"}</td>
                </tr>
              ))}
              {derived.unknowns.map((u, i) => (
                <tr key={u.id} className="border-t border-line-soft">
                  <td className="px-3 py-2 text-accent">Unknown #{i + 1}</td>
                  <td className="px-3 py-2 text-t1">{u.concentration != null ? `${+u.concentration.toFixed(3)} ${unit ?? ""}` : "—"}</td>
                  <td className="px-3 py-2 text-t1">{u.absorbanceAtLambdaMax?.toFixed(4) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <footer className="border-t border-line-soft pt-4 text-xs text-t4">
        Generated by Spectro Web · {dateFmt.format(experiment.updatedAt)}
      </footer>
    </main>
  );
}
