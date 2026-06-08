"use client";

/**
 * Wizard reload context. In the static app there is no server to revalidate —
 * the wizard page owns the experiment in React state (useExperiment) and exposes
 * a `reload()` that re-reads it from IndexedDB. Mutating components (capture,
 * delete, λmax, step nav) call `useWizardReload()` after writing to the store, so
 * the page re-renders with fresh data. Outside a provider it's a no-op (e.g. the
 * read-only report reuses SignalSpectraCard, which never mutates).
 */
import { createContext, useContext } from "react";

type Reload = () => void | Promise<void>;

const WizardReloadContext = createContext<Reload>(() => {});

export function WizardReloadProvider({
  reload,
  children,
}: {
  reload: Reload;
  children: React.ReactNode;
}) {
  return <WizardReloadContext.Provider value={reload}>{children}</WizardReloadContext.Provider>;
}

export function useWizardReload(): Reload {
  return useContext(WizardReloadContext);
}
