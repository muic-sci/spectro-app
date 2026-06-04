/**
 * Laptop capture upload (session-authed). The browser already analysed the photo
 * (analysis-client.analyzeCaptureBlob) and POSTs the full image + ROI crop +
 * packed profile/calibration here as multipart; we just persist it.
 *
 * This is a Route Handler, NOT a Server Action, on purpose: the multipart upload
 * is large + JSON-laden, and Cloudflare's CVE-2025-55183 ("React — Leaking
 * Server Functions") WAF rule false-positives on Server-Action requests and 403s
 * them at the edge. A plain HTTP endpoint dodges that rule. Shares its body with
 * the legacy persistCaptureAction via lib/capture-form. See lib/capture-form.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { persistCaptureForm } from "@/lib/capture-form";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }
  // Trust the route's experiment id over the form field (ownership is enforced
  // inside persistCaptureForm against this user).
  formData.set("experimentId", id);

  const res = await persistCaptureForm(formData, userId);
  return NextResponse.json(res, { status: res.error ? 400 : 200 });
}
