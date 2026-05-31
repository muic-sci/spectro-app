"use client";

/**
 * Subscribe to an experiment's SSE stream. The laptop omits `token` (its session
 * cookie authenticates); the phone passes the join `token`. EventSource handles
 * reconnection automatically.
 */
import { useEffect, useRef } from "react";
import type { ExperimentEvent } from "@/lib/realtime";

export function useExperimentEvents(
  experimentId: string,
  onEvent: (event: ExperimentEvent) => void,
  token?: string,
) {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const es = new EventSource(`/api/experiments/${experimentId}/events${qs}`);
    es.onmessage = (ev) => {
      try {
        handler.current(JSON.parse(ev.data) as ExperimentEvent);
      } catch {
        // ignore malformed frame / heartbeat comment
      }
    };
    return () => es.close();
  }, [experimentId, token]);
}
