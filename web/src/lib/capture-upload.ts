/**
 * Client-side upload transport for captures + re-extractions.
 *
 * The browser POSTs to the Route Handlers (/api/experiments/[id]/capture and
 * /reextract) instead of calling a Server Action — see lib/capture-form.ts for
 * why (Cloudflare's CVE-2025-55183 Server-Functions WAF rule 403s the big
 * uploads at the edge). These helpers also turn a proxy/firewall block (an HTML
 * 403, not our JSON) into a readable error instead of a silent hang.
 */
import type { CaptureState } from "@/lib/capture-form";

/** Parse a route-handler response, degrading gracefully when a proxy/WAF intercepts it. */
async function readJson(resp: Response): Promise<CaptureState> {
  const contentType = resp.headers.get("content-type") ?? "";
  // A proxy/firewall block (e.g. Cloudflare) returns an HTML page, not our JSON.
  if (!contentType.includes("application/json")) {
    if (resp.status === 403) {
      return {
        error:
          "Upload blocked by the network firewall (403). Please retry; if it keeps happening, contact the site admin.",
      };
    }
    return { error: `Upload failed (HTTP ${resp.status}).` };
  }
  try {
    return (await resp.json()) as CaptureState;
  } catch {
    return { error: `Upload failed (HTTP ${resp.status}).` };
  }
}

/** Upload an analysed capture; returns { ok } / { error } for the UI. */
export async function uploadCapture(experimentId: string, fd: FormData): Promise<CaptureState> {
  let resp: Response;
  try {
    resp = await fetch(`/api/experiments/${encodeURIComponent(experimentId)}/capture`, {
      method: "POST",
      body: fd,
    });
  } catch {
    return { error: "Network error during upload — please retry." };
  }
  return readJson(resp);
}

/** Commit a browser ROI/orientation re-extraction. */
export async function uploadReextract(
  experimentId: string,
  fd: FormData,
): Promise<{ ok: boolean; error?: string }> {
  let resp: Response;
  try {
    resp = await fetch(`/api/experiments/${encodeURIComponent(experimentId)}/reextract`, {
      method: "POST",
      body: fd,
    });
  } catch {
    return { ok: false, error: "Network error during save — please retry." };
  }
  if (resp.ok) return { ok: true };
  const res = await readJson(resp);
  return { ok: false, error: res.error };
}
