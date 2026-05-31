/**
 * Token → experiment resolver for the native phone app (the web /join/[token]
 * page resolves this server-side; the native app needs JSON). Returns the
 * experiment id, name and current pendingCapture, or 404 if the token is
 * unknown/expired. The token is the only credential.
 */
import { NextResponse } from "next/server";
import { getExperimentByTokenOnly } from "@/lib/experiments";
import { parseCaptureRequest } from "@/lib/experiment-meta";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const experiment = await getExperimentByTokenOnly(token);
  if (!experiment) {
    return NextResponse.json({ error: "expired" }, { status: 404 });
  }
  return NextResponse.json({
    id: experiment.id,
    name: experiment.name,
    pending: parseCaptureRequest(experiment.pendingCapture),
  });
}
