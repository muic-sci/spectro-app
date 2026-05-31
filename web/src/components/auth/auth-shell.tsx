import type { ReactNode } from "react";
import { SpectroMark, SpectrumBar } from "@/components/ui/primitives";

/**
 * Shared frame for the auth pages (login / register / forgot / reset): centred
 * card with the Spectro mark and the signature spectrum bar.
 */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 px-6 py-16">
      <div className="flex items-center gap-3">
        <SpectroMark size={30} />
        <h1 className="text-lg font-semibold text-t1">{title}</h1>
      </div>

      <div
        className="flex flex-col gap-5 rounded-lg border border-line bg-panel p-6"
        style={{ boxShadow: "var(--shadow-design)" }}
      >
        {children}
      </div>

      <SpectrumBar height={6} />
    </main>
  );
}

/** A labelled text/password input matching the rest of the form styling. */
export function AuthField({
  id,
  name,
  label,
  type = "text",
  required = true,
  autoComplete,
  placeholder,
  defaultValue,
  autoFocus,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-t3">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-sm text-t1 outline-none placeholder:text-t4 focus:border-accent"
      />
    </div>
  );
}
