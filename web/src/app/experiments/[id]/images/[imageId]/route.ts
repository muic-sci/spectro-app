/**
 * Serve a captured image binary (owner-scoped). The blob lives on disk
 * (lib/storage); we only stream it after confirming the requester owns the
 * experiment and the image belongs to it.
 */
import { NextResponse } from "next/server";
import { requireUserId } from "@/auth-helpers";
import { getExperiment } from "@/lib/experiments";
import { prisma } from "@/lib/db";
import { readImageBytes } from "@/lib/storage";

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

  // PNG magic byte 0x89; otherwise assume JPEG (the only two we decode).
  const contentType = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": contentType, "cache-control": "private, max-age=3600" },
  });
}
