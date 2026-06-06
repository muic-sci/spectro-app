"use client";

/**
 * Report-only light/dark theming. The rest of the app is dark-only (`.dark` on
 * <html>), but the report is a document — it should be readable in light and,
 * crucially, **print on white**. `ReportThemeShell` scopes a theme to the report
 * subtree via `data-theme` (light tokens are defined in globals.css), persists
 * the choice in localStorage, and forces light while printing regardless of the
 * on-screen theme. `ReportThemeToggle` (placed in the header) flips it.
 *
 * The preference is a tiny external store read via useSyncExternalStore — that
 * keeps SSR on the dark default (no hydration mismatch) without a setState-in-
 * effect, and lets the toggle update every subscriber.
 */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "spectro-report-theme";

let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function serverTheme(): Theme {
  return "dark";
}

function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore quota/availability errors */
  }
  for (const l of listeners) l();
}

const ReportThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ReportThemeShell({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Always print on a white (light) background. Mutate the DOM attribute directly
  // in the (synchronous) print events so it applies before the print snapshot,
  // then restore the on-screen theme afterwards.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const before = () => {
      el.dataset.theme = "light";
    };
    const after = () => {
      el.dataset.theme = readTheme();
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const toggle = () => writeTheme(theme === "dark" ? "light" : "dark");

  return (
    <ReportThemeContext.Provider value={{ theme, toggle }}>
      <div ref={wrapRef} data-theme={theme} className="min-h-dvh bg-desk text-t1">
        {children}
      </div>
    </ReportThemeContext.Provider>
  );
}

export function ReportThemeToggle() {
  const { theme, toggle } = useContext(ReportThemeContext);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-t2 transition-colors hover:text-t1"
    >
      {theme === "dark" ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}
