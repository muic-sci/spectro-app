import { getExperimentByTokenOnly } from "@/lib/experiments";
import { parseCaptureRequest } from "@/lib/experiment-meta";
import { SpectroMark, SpectrumBar } from "@/components/ui/primitives";
import { PhoneCaptureClient } from "./phone-capture-client";

export const metadata = { title: "Spectro — phone camera" };

/**
 * Phone entry point, reached by scanning the laptop's QR. Resolves the
 * experiment from the join token alone (no user session — the token is the key)
 * and hands off to the live capture client.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const experiment = await getExperimentByTokenOnly(token);

  if (!experiment) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
        <SpectroMark size={32} />
        <h1 className="text-lg font-semibold text-t1">This code has expired</h1>
        <p className="text-sm text-t3">
          Join codes last 30 minutes. Generate a fresh one on your laptop&apos;s pairing screen and
          scan again.
        </p>
        <SpectrumBar height={6} />
      </main>
    );
  }

  return (
    <PhoneCaptureClient
      experimentId={experiment.id}
      token={token}
      name={experiment.name}
      initialPending={parseCaptureRequest(experiment.pendingCapture)}
    />
  );
}
