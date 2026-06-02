import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { buttonVariants } from "@heroui/react";
import { requireUserId } from "@/auth-helpers";
import { getExperiment, joinTokenExpired } from "@/lib/experiments";
import { modeMeta, lightMeta, experimentPeaks } from "@/lib/experiment-meta";
import { parseLaserWavelengths } from "@/lib/experiment-json";
import { isPhoneOnline } from "@/lib/realtime";
import { Icon, SpectroMark, SpectrumBar, StatusChip } from "@/components/ui/primitives";
import { PairingLive } from "@/components/realtime/pairing-live";
import { regenerateJoinTokenAction } from "../../actions";

export const metadata = { title: "Pair your phone · Spectro Web" };

/** Absolute URL the phone opens after scanning (the join token is the key). */
async function joinUrl(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/join/${token}`;
}

/** L2 — pairing. Show the QR + join code; the phone scans to join the session. */
export default async function PairPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const experiment = await getExperiment(id, userId);
  if (!experiment) notFound();

  const expired = joinTokenExpired(experiment.joinTokenExpires);
  const token = experiment.joinToken;
  const showQr = Boolean(token) && !expired;

  const qrSvg = showQr
    ? await QRCode.toString(await joinUrl(token!), {
        type: "svg",
        margin: 1,
        width: 220,
        color: { dark: "#0b1016", light: "#e6edf3" },
      })
    : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 px-6 py-14">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Home" title="Home" className="shrink-0">
          <SpectroMark size={28} />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-t1">Pair your phone</h1>
          <p className="text-sm text-t3">
            {experiment.name} · {modeMeta(experiment.mode).label}
          </p>
        </div>
        <PairingLive experimentId={experiment.id} initialPhoneOnline={isPhoneOnline(experiment.id)} />
      </header>

      <SpectrumBar height={8} />

      <section className="flex flex-col items-center gap-5 rounded-lg border border-line bg-panel p-7 text-center">
        <p className="max-w-sm text-sm text-t2">
          Scan this with your phone&apos;s camera to open the capture screen. Your phone becomes the
          camera — everything else happens here.
        </p>

        {showQr ? (
          <>
            <div
              className="rounded-xl p-3"
              style={{ background: "#e6edf3" }}
              // QR SVG is generated server-side from our own data — safe to inline.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs uppercase tracking-wide text-t3">Or enter this code</span>
              <span className="mono text-2xl font-semibold tracking-[0.3em] text-t1">{token}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <StatusChip tone="warn">
              <Icon name="warn" size={12} /> Join code expired
            </StatusChip>
            <p className="max-w-sm text-sm text-t3">
              Join codes last 30 minutes. Generate a fresh one to pair your phone.
            </p>
            <form action={regenerateJoinTokenAction}>
              <input type="hidden" name="id" value={experiment.id} />
              <button type="submit" className={buttonVariants({ variant: "primary" })}>
                <Icon name="qr" size={16} /> Generate a new code
              </button>
            </form>
          </div>
        )}
      </section>

      {showQr && (
        <form action={regenerateJoinTokenAction} className="-mt-4 text-center">
          <input type="hidden" name="id" value={experiment.id} />
          <button type="submit" className="text-xs text-t4 underline-offset-2 hover:text-t2 hover:underline">
            Code not working? Generate a new one
          </button>
        </form>
      )}

      <div className="rounded-lg border border-dashed border-line bg-bg p-4 text-xs text-t3">
        <p className="flex items-center gap-2 text-t2">
          <Icon name="phone" size={14} /> Once paired, the phone shows{" "}
          <span className="text-t1">exactly what to shoot</span> for each step.
        </p>
        <p className="mt-1.5">
          Reference light: {lightMeta(experiment.lightType).label} — calibrating at{" "}
          <span className="mono">
            {experimentPeaks(
              experiment.lightType,
              parseLaserWavelengths(experiment.laserWavelengths),
            ).join(" · ")}{" "}
            nm
          </span>
          .
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link href="/experiments" className="text-sm text-t3 hover:text-t1">
          ← All experiments
        </Link>
        {/* Realtime auto-advance lands with the SSE pass; for now the student
            continues into the wizard manually once the phone is connected. */}
        <Link
          href={`/experiments/${experiment.id}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Continue to the wizard <Icon name="arrowR" size={16} />
        </Link>
      </div>
    </main>
  );
}
