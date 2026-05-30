/**
 * Local-disk blob store for captured images (dev / single-host).
 *
 * web-refactor-plan.md §9 keeps image *binaries* in object storage and only the
 * URL + extracted profile in the DB. For now that store is a directory on disk;
 * swapping in S3/GCS later means re-implementing just these three functions.
 * Files are keyed by their SpectralImage id (a cuid — no path separators).
 */
import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = process.env.SPECTRO_STORAGE_DIR
  ? path.resolve(process.env.SPECTRO_STORAGE_DIR)
  : path.join(process.cwd(), "storage", "uploads");

function filePath(key: string): string {
  if (!/^[a-z0-9]+$/i.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return path.join(STORAGE_DIR, key);
}

export async function saveImageBytes(key: string, bytes: Buffer): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(filePath(key), bytes);
}

export async function readImageBytes(key: string): Promise<Buffer> {
  return readFile(filePath(key));
}

export async function deleteImageBytes(key: string): Promise<void> {
  try {
    await unlink(filePath(key));
  } catch {
    // Already gone — nothing to clean up.
  }
}
