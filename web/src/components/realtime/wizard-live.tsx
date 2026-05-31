"use client";

/**
 * Laptop-side liveness for the wizard: shows the phone connection badge from
 * live SSE presence and refreshes the server component when the phone captures
 * (or the request/step changes), so the new spectrum appears without a reload.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnBadge } from "@/components/ui/primitives";
import { useExperimentEvents } from "@/components/realtime/use-experiment-events";

export function WizardLive({
  experimentId,
  initialPhoneOnline,
}: {
  experimentId: string;
  initialPhoneOnline: boolean;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(initialPhoneOnline);

  useExperimentEvents(experimentId, (e) => {
    switch (e.type) {
      case "hello":
        setOnline(Boolean((e.data as { phoneOnline?: boolean } | undefined)?.phoneOnline));
        break;
      case "phone-online":
        setOnline(true);
        router.refresh();
        break;
      case "phone-offline":
        setOnline(false);
        router.refresh();
        break;
      case "captured":
      case "pending":
      case "step":
        router.refresh();
        break;
    }
  });

  return <ConnBadge status={online ? "connected" : "offline"} />;
}
