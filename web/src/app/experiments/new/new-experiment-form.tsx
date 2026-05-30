"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Icon } from "@/components/ui/primitives";
import {
  EXPERIMENT_MODES,
  REFERENCE_LIGHTS,
  type ModeMeta,
  type LightMeta,
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
  const [light, setLight] = useState<LightMeta["value"]>(REFERENCE_LIGHTS[0].value);

  const selectedLight = REFERENCE_LIGHTS.find((l) => l.value === light) ?? REFERENCE_LIGHTS[0];

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
          <p className="text-xs text-t3">What kind of measurement you&apos;re making.</p>
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

      {/* Reference light */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-t1">Reference light type</h2>
          <p className="text-xs text-t3">Sets the known peaks we calibrate against.</p>
        </div>
        <div className="flex flex-col gap-3">
          {REFERENCE_LIGHTS.map((l) => (
            <OptionCard
              key={l.value}
              name="lightType"
              value={l.value}
              label={l.label}
              tagline={l.tagline}
              description={l.description}
              selected={light === l.value}
              onSelect={(v) => setLight(v as LightMeta["value"])}
            />
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-t3">
          <Icon name="wave" size={14} style={{ color: "var(--accent-color)" }} />
          We&apos;ll calibrate using these emission lines:{" "}
          <span className="mono text-t2">{selectedLight.peaks.join(" · ")} nm</span>
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
