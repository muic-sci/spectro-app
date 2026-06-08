/**
 * Tiny promise-based IndexedDB wrapper (browser-only).
 *
 * Spectro Web is fully static — there is no server or database. Each user's
 * experiments and image binaries live in the browser's IndexedDB:
 *   - `experiments` (keyPath "id") — one denormalised JSON record per experiment.
 *   - `blobs`       (keyPath "key") — captured image + ROI-crop binaries.
 *
 * Import only from client components (IndexedDB is unavailable on the server).
 */

export const DB_NAME = "spectro";
export const DB_VERSION = 1;
export const STORE_EXPERIMENTS = "experiments";
export const STORE_BLOBS = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_EXPERIMENTS)) {
        db.createObjectStore(STORE_EXPERIMENTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return promisifyRequest<T | undefined>(tx(db, store, "readonly").get(key) as IDBRequest<T | undefined>);
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return promisifyRequest<T[]>(tx(db, store, "readonly").getAll() as IDBRequest<T[]>);
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDB();
  await promisifyRequest(tx(db, store, "readwrite").put(value as unknown as object));
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  await promisifyRequest(tx(db, store, "readwrite").delete(key));
}
