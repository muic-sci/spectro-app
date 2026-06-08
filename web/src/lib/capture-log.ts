/**
 * Lightweight client-side timing logs for the capture/upload pipeline.
 *
 * The browser is Spectro Web's compute engine: a capture decodes + extracts +
 * crops on the main thread before the upload POST. When an upload "sticks", we
 * need to know WHICH phase is slow (heavy main-thread pixel loops) vs. whether
 * the POST itself never returns (server). These logs make that visible in the
 * browser console — grep for "[spectro:capture]".
 *
 * Pure, browser-targeted helpers (only called from client components).
 */
const PREFIX = "[spectro:capture]";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function captureLog(msg: string, extra?: Record<string, unknown>): void {
  console.log(`${PREFIX} ${msg}`, extra ?? {});
}

export interface PhaseTimer {
  /** Log a phase with ms since the previous mark and ms since the timer started. */
  mark(phase: string, extra?: Record<string, unknown>): void;
}

/** Start a phase timer for `label`; each mark logs dt (since last) + total elapsed. */
export function startTimer(label: string, extra?: Record<string, unknown>): PhaseTimer {
  const t0 = now();
  let last = t0;
  captureLog(`${label} ▶ start`, extra);
  return {
    mark(phase: string, markExtra?: Record<string, unknown>) {
      const t = now();
      captureLog(`${label} · ${phase}`, {
        dt_ms: Math.round(t - last),
        total_ms: Math.round(t - t0),
        ...markExtra,
      });
      last = t;
    },
  };
}
