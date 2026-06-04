"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import {
  EXPERIMENT_MODES,
  LASER_CHANNELS,
  lightForMode,
  lightMeta,
  type ModeMeta,
} from "@/lib/experiment-meta";
import { createExperimentAction, type NewExperimentState } from "../actions";

const INITIAL: NewExperimentState = {};

/** A selectable option card (mode / light). Drives a hidden radio input. */
function OptionCard({
  name,
  value,
  label,
  tagline,
  description,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  tagline: string;
  description: string;
  selected: boolean;
  onSelect: (v: string) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border p-4 transition-colors ${
        selected
          ? "border-accent bg-panel-2"
          : "border-line bg-panel hover:border-line-soft"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          value={value}
          checked={selected}
          onChange={() => onSelect(value)}
          className="sr-only"
        />
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-accent" : "border-line"
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="font-semibold text-t1">{label}</span>
      </div>
      <span className="pl-6 text-sm text-t2">{tagline}</span>
      <span className="pl-6 text-xs text-t3">{description}</span>
    </label>
  );
}

export function NewExperimentForm() {
  const [state, action, pending] = useActionState(createExperimentAction, INITIAL);
  const [mode, setMode] = useState<ModeMeta["value"]>(EXPERIMENT_MODES[0].value);
  const [laser, setLaser] = useState<Record<string, string>>(() =>
    Object.fromEntries(LASER_CHANNELS.map((c) => [c.key, String(c.default)])),
  );

  // The reference light is paired one-to-one with the mode (absorbance →
  // fluorescent lamp, fluorescence → lasers), so this form is a single choice;
  // the server derives the light from the mode (lightForMode).
  const isLaser = lightForMode(mode) === "laser";
  const peaksLabel = isLaser
    ? LASER_CHANNELS.map((c) => laser[c.key] || "?").join(" · ")
    : lightMeta("fluorescent").peaks.join(" · ");

  return (
    <form action={action} className="flex flex-col gap-8">
      {/* Name */}
      <section className="flex flex-col gap-2">
        <label htmlFor="name" className="text-xs font-semibold uppercase tracking-wide text-t3">
          Experiment name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={80}
          autoFocus
          defaultValue={state.values?.name}
          placeholder="e.g. Blue dye concentration"
          className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-sm text-t1 outline-none placeholder:text-t4 focus:border-accent"
        />
      </section>

      {/* Mode */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-t1">Experiment mode</h2>
          <p className="text-xs text-t3">
            This sets both the signal you measure and the light you calibrate against.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {EXPERIMENT_MODES.map((m) => (
            <OptionCard
              key={m.value}
              name="mode"
              value={m.value}
              label={m.label}
              tagline={m.tagline}
              description={m.description}
              selected={mode === m.value}
              onSelect={(v) => setMode(v as ModeMeta["value"])}
            />
          ))}
        </div>
      </section>

      {/* Reference light is derived from the mode; only lasers need wavelengths. */}
      <section className="flex flex-col gap-3">
        {isLaser && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2 p-4">
            <p className="text-xs text-t3">
              Enter each laser&apos;s wavelength (nm). You&apos;ll shoot them one at a time in the
              next steps.
            </p>
            <div className="flex flex-wrap gap-3">
              {LASER_CHANNELS.map((c) => (
                <label key={c.key} className="flex flex-1 flex-col gap-1" style={{ minWidth: 96 }}>
                  <span className="text-xs uppercase tracking-wide text-t3">{c.label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      name={`laser_${c.key}`}
                      type="number"
                      step="any"
                      min={0}
                      required
                      value={laser[c.key]}
                      onChange={(e) => setLaser((p) => ({ ...p, [c.key]: e.target.value }))}
                      className="w-full rounded-md border border-line bg-panel px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
                    />
                    <span className="text-xs text-t4">nm</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <p className="flex items-center gap-2 text-xs text-t3">
          <Icon name="wave" size={14} style={{ color: "var(--accent-color)" }} />
          We&apos;ll calibrate using these {isLaser ? "laser lines" : "emission lines"}:{" "}
          <span className="mono text-t2">{peaksLabel} nm</span>
        </p>
      </section>

      {state.error && (
        <p className="flex items-center gap-2 text-sm text-danger" role="alert">
          <Icon name="warn" size={15} /> {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "Creating…" : "Continue to pairing"}
          {!pending && <Icon name="arrowR" size={16} />}
        </Button>
        <Link href="/experiments" className="text-sm text-t3 hover:text-t1">
          Cancel
        </Link>
      </div>
    </form>
  );
}
