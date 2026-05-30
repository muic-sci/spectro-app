/**
 * Spectro design primitives — ported from docs/design_handoff_continuous_camera
 * (ui.jsx). These are the signature scientific pieces HeroUI doesn't provide:
 * the spectrum logo mark, the visible-spectrum gradient bar, the connection
 * badge, status chip, and the big mono data readout. They're styled entirely
 * from the design tokens defined in globals.css, so they sit naturally beside
 * HeroUI's components (the "middle ground").
 *
 * All are presentational (no hooks) → safe as server components.
 */
import type { CSSProperties, ReactNode } from "react";

// ── icon set (subset of the handoff's ICONS) ────────────────────────────────
const ICONS: Record<string, string | string[]> = {
  plus: "M12 5v14M5 12h14",
  arrowR: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 6.5",
  cam: [
    "M3 8.5a2 2 0 012-2h2l1.2-1.8a1 1 0 01.83-.45h5.94a1 1 0 01.83.45L17 6.5h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    "M12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  ],
  qr: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z", "M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"],
  phone: ["M7 2.5h10a2 2 0 012 2v15a2 2 0 01-2 2H7a2 2 0 01-2-2v-15a2 2 0 012-2z", "M11 18.5h2"],
  warn: ["M12 3l9.5 16.5H2.5z", "M12 10v4M12 17.5v.5"],
  flask: ["M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3", "M7.5 15h9"],
  wave: "M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 017 0v3"],
  spark: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
};

export type IconName = keyof typeof ICONS | string;

export function Icon({
  name,
  size = 18,
  stroke = 2,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}) {
  const d = ICONS[name] ?? ICONS.dot ?? "M12 12h.01";
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

// ── spectrum logo mark ──────────────────────────────────────────────────────
export function SpectroMark({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        position: "relative",
        overflow: "hidden",
        background: "var(--spectrum)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 0 14px -2px var(--accent-glow)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.28) 2px 3px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 2,
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.55)",
        }}
      />
    </div>
  );
}

// ── visible-spectrum gradient bar ───────────────────────────────────────────
export function SpectrumBar({ height = 10, rounded = true }: { height?: number; rounded?: boolean }) {
  return (
    <div
      style={{
        height,
        background: "var(--spectrum)",
        borderRadius: rounded ? "var(--r-sm)" : 0,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    />
  );
}

// ── connection badge (severity-aware) ───────────────────────────────────────
export type ConnStatus = "offline" | "pairing" | "connected" | "reconnecting" | "lost";

const CONN_MAP: Record<ConnStatus, { c: string; t: string; pulse: boolean }> = {
  offline: { c: "var(--t4)", t: "Phone not linked", pulse: false },
  pairing: { c: "var(--warn)", t: "Waiting for phone…", pulse: true },
  connected: { c: "var(--ok)", t: "Phone connected", pulse: false },
  reconnecting: { c: "var(--warn)", t: "Reconnecting…", pulse: true },
  lost: { c: "var(--danger-color)", t: "Connection lost", pulse: true },
};

export function ConnBadge({ status }: { status: ConnStatus }) {
  const m = CONN_MAP[status];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 11px 5px 9px",
        borderRadius: 999,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        fontSize: 12,
        color: "var(--t2)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: m.c,
          boxShadow: `0 0 8px ${m.c}`,
          animation: m.pulse ? "pulse-soft 1.1s infinite" : "none",
        }}
      />
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="phone" size={13} style={{ opacity: 0.6 }} />
        {m.t}
      </span>
    </div>
  );
}

// ── status chip ─────────────────────────────────────────────────────────────
export type ChipTone = "neutral" | "ok" | "warn" | "danger" | "accent";

const CHIP_TONES: Record<ChipTone, [string, string, string]> = {
  neutral: ["var(--panel-2)", "var(--t2)", "var(--line)"],
  ok: ["var(--ok-bg)", "var(--ok)", "transparent"],
  warn: ["var(--warn-bg)", "var(--warn)", "transparent"],
  danger: ["var(--danger-soft-bg)", "var(--danger-color)", "transparent"],
  accent: ["var(--accent-glow)", "var(--accent-color)", "transparent"],
};

export function StatusChip({
  children,
  tone = "neutral",
  mono = false,
}: {
  children: ReactNode;
  tone?: ChipTone;
  mono?: boolean;
}) {
  const [bg, c, b] = CHIP_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        background: bg,
        color: c,
        border: `1px solid ${b}`,
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

// ── data readout (label over big mono value) ────────────────────────────────
export function Readout({
  label,
  value,
  unit,
  tone = "var(--t1)",
  sub,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: string;
  sub?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "var(--t3)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{ fontSize: 23, fontWeight: 600, color: tone, lineHeight: 1, letterSpacing: -0.5 }}
      >
        {value}
        {unit && <span style={{ fontSize: 13, color: "var(--t3)", marginLeft: 4 }}>{unit}</span>}
      </span>
      {sub && <span style={{ fontSize: 11, color: "var(--t3)" }}>{sub}</span>}
    </div>
  );
}
