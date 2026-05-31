// Build version, baked in at build time. CI passes the git tag (e.g. v1.2.3)
// as the APP_VERSION build arg → NEXT_PUBLIC_APP_VERSION (see web/Dockerfile);
// local builds fall back to "dev". NEXT_PUBLIC_ vars are inlined at build, so
// this renders on both server and client without any runtime lookup.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/**
 * A small, unobtrusive build-version stamp pinned to the bottom-right corner.
 * Rendered once in the root layout so it appears on every page. Hidden from
 * print output (the report is print-first).
 */
export function VersionBadge() {
  return (
    <span
      className="no-print"
      aria-label={`App version ${APP_VERSION}`}
      style={{
        position: "fixed",
        bottom: "0.5rem",
        right: "0.625rem",
        zIndex: 50,
        fontFamily: "var(--font-mono)",
        fontSize: "0.6875rem",
        lineHeight: 1,
        letterSpacing: "0.02em",
        color: "var(--muted)",
        opacity: 0.65,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {APP_VERSION}
    </span>
  );
}
