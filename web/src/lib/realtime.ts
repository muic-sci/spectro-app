/**
 * In-process realtime bus for the cross-device loop (web-refactor-plan.md §4.2:
 * "SSE to start"). The laptop and phone both subscribe to an experiment's event
 * stream; the capture/step routes publish to it.
 *
 * Scope caveat: this is a single-process EventEmitter, so it works for one
 * server instance (dev + a single-container deploy). Scaling horizontally would
 * mean swapping this module for Postgres LISTEN/NOTIFY or Redis pub/sub — the
 * SSE routes and publishers stay the same.
 */
import "server-only";
import { EventEmitter } from "node:events";

export type ExperimentEventType =
  | "hello" // initial state sent to a new subscriber
  | "phone-online"
  | "phone-offline"
  | "pending" // laptop requested a capture (pendingCapture changed)
  | "captured" // a capture arrived + was processed
  | "step"; // current step changed

export interface ExperimentEvent {
  type: ExperimentEventType;
  data?: unknown;
}

const g = globalThis as unknown as {
  __spectroBus?: EventEmitter;
  __spectroPhones?: Map<string, number>;
};

const bus = g.__spectroBus ?? new EventEmitter();
bus.setMaxListeners(0); // many SSE subscribers
if (!g.__spectroBus) g.__spectroBus = bus;

const phoneCounts = g.__spectroPhones ?? new Map<string, number>();
if (!g.__spectroPhones) g.__spectroPhones = phoneCounts;

/** Publish an event to everyone subscribed to this experiment. */
export function publish(experimentId: string, event: ExperimentEvent): void {
  bus.emit(experimentId, event);
}

/** Subscribe to an experiment's events; returns an unsubscribe function. */
export function subscribe(
  experimentId: string,
  listener: (event: ExperimentEvent) => void,
): () => void {
  bus.on(experimentId, listener);
  return () => bus.off(experimentId, listener);
}

export function isPhoneOnline(experimentId: string): boolean {
  return (phoneCounts.get(experimentId) ?? 0) > 0;
}

/** Mark a phone SSE connection open; emits phone-online on the first one. */
export function phoneConnected(experimentId: string): void {
  const next = (phoneCounts.get(experimentId) ?? 0) + 1;
  phoneCounts.set(experimentId, next);
  if (next === 1) publish(experimentId, { type: "phone-online" });
}

/** Mark a phone SSE connection closed; emits phone-offline when the last drops. */
export function phoneDisconnected(experimentId: string): void {
  const next = Math.max(0, (phoneCounts.get(experimentId) ?? 0) - 1);
  if (next === 0) phoneCounts.delete(experimentId);
  else phoneCounts.set(experimentId, next);
  if (next === 0) publish(experimentId, { type: "phone-offline" });
}
