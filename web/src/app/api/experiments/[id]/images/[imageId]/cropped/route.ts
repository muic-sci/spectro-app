/**
 * Serve a captured image cropped to the experiment's ROI — i.e. *exactly* the
 * pixels the analysis profiles (same EXIF auto-orient + same clamp as
 * extractIntensityProfile). Lets the student confirm the right region was
 * selected. Owner-scoped. ROI changes bust the cache via a ?v= param.
 */
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUserId } from "@/auth-helpers";
import { getExperiment } from "@/lib/experiments";
import { prisma } from "@/lib/db";
import { readImageBytes } from "@/lib/storage";
import { parseRoi } from "@/lib/experiment-json";
import { DEFAULT_ROI, roiPixelBounds } from "@/lib/analysis";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  const userId = await requireUserId();

  const experiment = await getExperiment(id, userId);
  if (!experiment) return new NextResponse("Not found", { status: 404 });

  const image = await prisma.spectralImage.findFirst({
    where: { id: imageId, experimentId: id },
    select: { id: true },
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readImageBytes(imageId);
  } catch {
    return new NextResponse("Image data missing", { status: 410 });
  }

  try {
    // Auto-orient (matching the decoder), then extract the same clamped ROI the
    // analysis uses.
    const oriented = await sharp(bytes).rotate().toBuffer();
    const meta = await sharp(oriented).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const { x0, x1, y0, y1 } = roiPixelBounds(w, h, parseRoi(experiment.roi) ?? DEFAULT_ROI);

    const out = await sharp(oriented)
      .extract({ left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) })
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(new Uint8Array(out), {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("Crop failed", { status: 500 });
  }
}
