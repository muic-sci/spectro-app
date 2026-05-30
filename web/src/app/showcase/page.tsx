import { Button, Card } from "@heroui/react";
import {
  ConnBadge,
  Icon,
  Readout,
  SpectroMark,
  SpectrumBar,
  StatusChip,
  type ConnStatus,
} from "@/components/ui/primitives";

export const metadata = { title: "Design system · Spectro Web" };

const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "tertiary",
  "ghost",
  "outline",
  "danger",
  "danger-soft",
] as const;

const CONN_STATES: ConnStatus[] = ["offline", "pairing", "connected", "reconnecting", "lost"];

const SWATCHES: { name: string; varName: string }[] = [
  { name: "desk", varName: "--desk" },
  { name: "bg", varName: "--bg" },
  { name: "panel", varName: "--panel" },
  { name: "panel-2", varName: "--panel-2" },
  { name: "raised", varName: "--raised" },
  { name: "line", varName: "--line" },
  { name: "accent", varName: "--accent-color" },
  { name: "ok", varName: "--ok" },
  { name: "warn", varName: "--warn" },
  { name: "danger", varName: "--danger-color" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-t3">{title}</h2>
        {hint && <span className="text-xs text-t4">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ShowcasePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-14">
      <header className="flex items-center gap-3">
        <SpectroMark size={32} />
        <div>
          <h1 className="text-xl font-semibold text-t1">Spectro Design System</h1>
          <p className="text-sm text-t3">HeroUI components · design-handoff tokens</p>
        </div>
        <div className="ml-auto">
          <ConnBadge status="connected" />
        </div>
      </header>

      <SpectrumBar height={14} />

      <Card className="border border-line bg-panel p-5 text-sm text-t2">
        <p>
          <span className="font-semibold text-t1">The middle ground.</span> Interactive components
          come from <span className="text-accent">HeroUI v3</span> (accessible, react-aria based,
          community maintained). Their semantic tokens are re-skinned with the{" "}
          <span className="text-accent">design handoff&apos;s</span> dark OKLCH palette, and the
          signature scientific pieces (logo, spectrum bar, connection badge, readouts) are ported as
          token-styled primitives. One coherent dark, low-emission look — an experimental
          requirement, since stray screen light contaminates the measurement.
        </p>
      </Card>

      <Section title="Palette" hint="design tokens → HeroUI semantic tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SWATCHES.map((s) => (
            <div key={s.name} className="flex flex-col gap-2">
              <div
                className="h-14 rounded-md border border-line"
                style={{ background: `var(${s.varName})` }}
              />
              <span className="mono text-xs text-t3">{s.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons" hint="HeroUI &lt;Button&gt;, themed">
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm">
            small
          </Button>
          <Button variant="primary" size="md">
            medium
          </Button>
          <Button variant="primary" size="lg">
            large
          </Button>
          <Button variant="primary" isDisabled>
            disabled
          </Button>
        </div>
      </Section>

      <Section title="Status chips" hint="design primitive">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="neutral">neutral</StatusChip>
          <StatusChip tone="accent">λmax 578 nm</StatusChip>
          <StatusChip tone="ok">
            <Icon name="check" size={12} /> Excellent fit
          </StatusChip>
          <StatusChip tone="warn">
            <Icon name="warn" size={12} /> 4% saturated
          </StatusChip>
          <StatusChip tone="danger">low R²</StatusChip>
          <StatusChip tone="accent" mono>
            R² 0.9991
          </StatusChip>
        </div>
      </Section>

      <Section title="Connection badge" hint="cross-device pairing states">
        <div className="flex flex-wrap items-center gap-3">
          {CONN_STATES.map((s) => (
            <ConnBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Science readouts" hint="big mono values">
        <Card className="grid grid-cols-2 gap-6 border border-line bg-panel p-6 sm:grid-cols-4">
          <Readout label="Slope" value="0.477" unit="nm/px" />
          <Readout label="Intercept" value="392.0" unit="nm" />
          <Readout label="R²" value="0.946" tone="var(--ok)" sub="good fit" />
          <Readout label="λmax" value="578" unit="nm" tone="var(--accent-color)" />
          <Readout label="A @ λmax" value="1.316" sub="standard 5" />
          <Readout label="Conc." value="4.8" unit="mg/L" tone="var(--accent-color)" />
          <Readout label="Saturated" value="0.0" unit="%" tone="var(--ok)" />
          <Readout label="Standards" value="5" sub="≥ 2 required" />
        </Card>
      </Section>

      <footer className="pb-6 text-xs text-t4">
        Spectro Web foundation · analysis core ported &amp; golden-tested · ready for the guided
        wizard.
      </footer>
    </main>
  );
}
