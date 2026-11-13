export interface OfflineFile {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  savedAt: string;
  blob: Blob;
}

interface OfflineFileRecord extends OfflineFile {
  blob: Blob;
}

const DATABASE_NAME = "imara-offline-files";
const STORE_NAME = "documents";
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Offline storage is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
    request.onblocked = () => reject(new Error("Offline storage is busy in another tab. Close other IMARA tabs and try again."));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage operation was interrupted."));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Offline storage operation failed."));
    };
  }));
}

export async function saveOfflineFile(file: Omit<OfflineFile, "savedAt">): Promise<void> {
  if (!file.userId) throw new Error("Sign in to save this document for offline access.");
  if (navigator.storage?.estimate) {
    const { quota, usage } = await navigator.storage.estimate();
    const available = typeof quota === "number" && typeof usage === "number" ? quota - usage : null;
    if (available !== null && file.blob.size > available) {
      throw new Error("There isn’t enough space on this device to save this file offline.");
    }
  }
  window.localStorage.setItem("imara:offline:last-user", file.userId);
  await runTransaction("readwrite", (store) => store.put({ ...file, savedAt: new Date().toISOString() }));
  window.dispatchEvent(new Event("imara:offline-files-changed"));
}

export async function listOfflineFiles(userId: string): Promise<OfflineFile[]> {
  const rows = await runTransaction<OfflineFileRecord[]>("readonly", (store) => store.getAll());
  return rows.filter((file) => file.userId === userId).sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export async function removeOfflineFile(id: string): Promise<void> {
  await runTransaction("readwrite", (store) => store.delete(id));
  window.dispatchEvent(new Event("imara:offline-files-changed"));
}
