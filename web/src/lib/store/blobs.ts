/**
 * Image-binary store (browser IndexedDB) + an object-URL cache.
 *
 * Replaces the old server-side disk store (`lib/storage.ts`) and the
 * `/api/.../images/[imageId]` route handlers. Full captures are keyed by their
 * image id; the ROI crop is keyed by `croppedKey(id)`. Components that render
 * `<img src>` / draw to a canvas / `fetch()` a stored image use `objectUrlFor`,
 * which materialises a stable `blob:` URL per key (created once, cached, and
 * revoked when the experiment is deleted).
 */
import { STORE_BLOBS, idbGet, idbPut, idbDelete } from "./db";

interface BlobRecord {
  key: string;
  blob: Blob;
}

/** Storage key for the ROI-cropped JPEG that goes with an image. */
export function croppedKey(imageId: string): string {
  return `${imageId}crop`;
}

export async function saveBlob(key: string, blob: Blob): Promise<void> {
  await idbPut<BlobRecord>(STORE_BLOBS, { key, blob });
  // A re-saved blob (e.g. a new crop after ROI change) must drop the stale URL.
  revokeObjectUrl(key);
}

export async function getBlob(key: string): Promise<Blob | null> {
  const rec = await idbGet<BlobRecord>(STORE_BLOBS, key);
  return rec?.blob ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  await idbDelete(STORE_BLOBS, key);
  revokeObjectUrl(key);
}

// ── Object-URL cache ─────────────────────────────────────────────────────────

const urlCache = new Map<string, string>();

/** A stable `blob:` URL for a stored image (cached per key). Null if missing. */
export async function objectUrlFor(key: string): Promise<string | null> {
  const cached = urlCache.get(key);
  if (cached) return cached;
  const blob = await getBlob(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export function revokeObjectUrl(key: string): void {
  const url = urlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
}
