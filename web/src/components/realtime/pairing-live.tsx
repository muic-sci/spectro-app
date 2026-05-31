"use client";

/**
 * Pairing-screen liveness (L2): the connection badge tracks the phone over SSE,
 * and once the phone joins we auto-advance into the wizard (web-ux-brief.md §4
 * moment 3: "Joined → auto-advance to first step").
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnBadge } from "@/components/ui/primitives";
import { useExperimentEvents } from "@/components/realtime/use-experiment-events";

export function PairingLive({
  experimentId,
  initialPhoneOnline,
}: {
  experimentId: string;
  initialPhoneOnline: boolean;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(initialPhoneOnline);

  useExperimentEvents(experimentId, (e) => {
    if (e.type === "hello") setOnline(Boolean((e.data as { phoneOnline?: boolean } | undefined)?.phoneOnline));
    else if (e.type === "phone-online") setOnline(true);
    else if (e.type === "phone-offline") setOnline(false);
  });

  useEffect(() => {
    if (!online) return;
    const t = setTimeout(() => router.push(`/experiments/${experimentId}`), 1200);
    return () => clearTimeout(t);
  }, [online, experimentId, router]);

  return (
    <div className="flex flex-col items-center gap-2">
      <ConnBadge status={online ? "connected" : "pairing"} />
      {online && <span className="text-xs text-ok">Phone connected — taking you to the wizard…</span>}
    </div>
  );
}
