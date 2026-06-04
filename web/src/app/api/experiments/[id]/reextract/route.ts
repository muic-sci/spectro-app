/**
 * Commit a browser ROI/orientation re-extraction (session-authed). The browser
 * re-extracted every stored image's profile + crop for the new region
 * (analysis-client.reextractAll) and POSTs them here; we persist them + the
 * recomputed calibration.
 *
 * A Route Handler rather than a Server Action for the same reason as the capture
 * upload: this carries ALL profiles + crops in one big multipart body, which
 * trips Cloudflare's CVE-2025-55183 Server-Functions WAF rule. Shares its body
 * with the legacy persistReextractAction via lib/capture-form.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { persistReextractForm } from "@/lib/capture-form";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read the request." }, { status: 400 });
  }
  formData.set("experimentId", id);

  const res = await persistReextractForm(formData, userId);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
