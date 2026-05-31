/**
 * Phone capture upload (web-refactor-plan.md §10 /captures). Token-authed (the
 * phone carries no user session). The phone shoots whatever the laptop asked for
 * — the role/concentration come from the experiment's pendingCapture, not the
 * phone — then we run the pipeline, clear the request, and notify both devices.
 */
import { NextResponse } from "next/server";
import { getExperimentByToken } from "@/lib/experiments";
import { processCapture } from "@/lib/capture";
import { parseCaptureRequest } from "@/lib/experiment-meta";
import { publish } from "@/lib/realtime";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData();
  const token = String(form.get("token") ?? "") || new URL(req.url).searchParams.get("token");

  const experiment = await getExperimentByToken(id, token);
  if (!experiment) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const pending = parseCaptureRequest(experiment.pendingCapture);
  if (!pending) {
    return NextResponse.json({ error: "Nothing to capture right now" }, { status: 409 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file isn't an image" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const res = await processCapture({
      experimentId: id,
      roi: experiment.roi,
      role: pending.role,
      bytes,
      vertical: experiment.orientation === "vertical",
      concentration: pending.concentration,
      unit: pending.unit,
    });
    await prisma.experiment.update({
      where: { id },
      data: { pendingCapture: Prisma.DbNull },
    });
    const saturatedPct = res.saturation.fraction * 100;
    publish(id, { type: "captured", data: { role: pending.role, saturatedPct } });
    return NextResponse.json({ ok: true, role: pending.role, saturatedPct });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't process that image" },
      { status: 500 },
    );
  }
}
