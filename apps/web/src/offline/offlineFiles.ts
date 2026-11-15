export interface OfflineScope {
  type: "personal" | "workspace";
  workspaceId?: string;
  workspaceName?: string;
}

export interface OfflineFile {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  savedAt: string;
  blob: Blob;
  folderId: string | null;
  scope: OfflineScope;
  canEdit: boolean;
  canDownload: boolean;
  baseHash: string;
  syncStatus: "synced" | "pending" | "conflict" | "error";
  conflictHash?: string;
  syncError?: string;
  changeSummary?: string;
}

export interface OfflineFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  scope: OfflineScope;
}

export interface OfflineCatalogFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  createdAt: string;
  scope: OfflineScope;
  canEdit: boolean;
  canDownload: boolean;
}

export interface OfflineCatalog {
  userId: string;
  folders: OfflineFolder[];
  files: OfflineCatalogFile[];
  workspaces: Array<{ id: string; name: string }>;
  refreshedAt: string;
}

export type NewOfflineFile = Omit<OfflineFile, "savedAt" | "baseHash" | "syncStatus">
  & Partial<Pick<OfflineFile, "folderId" | "scope" | "canEdit" | "canDownload">>;

const DATABASE_NAME = "imara-offline-files";
const STORE_NAME = "documents";
const CATALOG_STORE_NAME = "catalogs";
const DATABASE_VERSION = 3;

function ensureStores(database: IDBDatabase) {
  if (!database.objectStoreNames.contains(STORE_NAME)) {
    database.createObjectStore(STORE_NAME, { keyPath: "id" });
  }
  if (!database.objectStoreNames.contains(CATALOG_STORE_NAME)) {
    database.createObjectStore(CATALOG_STORE_NAME, { keyPath: "userId" });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Offline storage is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => ensureStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
    request.onblocked = () => reject(new Error("Offline storage is busy in another tab. Close other IMARA tabs and try again."));
  });
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Offline storage operation was interrupted."));
    };
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

async function hashBlob(blob: Blob): Promise<string> {
  if (!crypto.subtle) throw new Error("Secure document sync is not available in this browser.");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeFile(file: OfflineFile): OfflineFile {
  return {
    ...file,
    folderId: file.folderId ?? null,
    scope: file.scope ?? { type: "personal" },
    canEdit: file.canEdit ?? true,
    canDownload: file.canDownload ?? true,
    syncStatus: file.syncStatus ?? "synced",
    baseHash: file.baseHash ?? "",
  };
}

function notifyChanged() {
  window.dispatchEvent(new Event("imara:offline-files-changed"));
}

export async function saveOfflineFile(file: NewOfflineFile): Promise<void> {
  if (!file.userId) throw new Error("Sign in to save this document for offline access.");
  if (navigator.storage?.estimate) {
    const { quota, usage } = await navigator.storage.estimate();
    const available = typeof quota === "number" && typeof usage === "number" ? quota - usage : null;
    if (available !== null && file.blob.size > available) {
      throw new Error("There isn’t enough space on this device to save this file offline.");
    }
  }
  const current = await runTransaction<OfflineFile | undefined>(STORE_NAME, "readonly", (store) => store.get(file.id));
  if (current?.syncStatus === "pending" || current?.syncStatus === "conflict" || current?.syncStatus === "error") {
    throw new Error("This file has unsynced offline edits. Resolve them before replacing its saved copy.");
  }
  const next: OfflineFile = {
    ...file,
    savedAt: new Date().toISOString(),
    baseHash: await hashBlob(file.blob),
    syncStatus: "synced",
    folderId: file.folderId ?? null,
    scope: file.scope ?? { type: "personal" },
    canEdit: file.canEdit ?? true,
    canDownload: file.canDownload ?? true,
  };
  window.localStorage.setItem("imara:offline:last-user", file.userId);
  await runTransaction<IDBValidKey>(STORE_NAME, "readwrite", (store) => store.put(next));
  notifyChanged();
}

export async function saveOfflineEdit(id: string, blob: Blob, changeSummary: string): Promise<OfflineFile> {
  const file = await getOfflineFile(id);
  if (!file) throw new Error("This file is no longer saved on this device.");
  if (file.syncStatus === "conflict") throw new Error("Resolve this file’s sync conflict before making more edits.");
  const next: OfflineFile = {
    ...file,
    blob,
    sizeBytes: blob.size,
    savedAt: new Date().toISOString(),
    syncStatus: "pending",
    syncError: undefined,
    changeSummary,
  };
  await runTransaction<IDBValidKey>(STORE_NAME, "readwrite", (store) => store.put(next));
  notifyChanged();
  return next;
}

export async function listOfflineFiles(userId: string): Promise<OfflineFile[]> {
  const rows = await runTransaction<OfflineFile[]>(STORE_NAME, "readonly", (store) => store.getAll());
  return rows
    .filter((file) => file.userId === userId)
    .map(normalizeFile)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export async function getOfflineFile(id: string): Promise<OfflineFile | null> {
  const file = await runTransaction<OfflineFile | undefined>(STORE_NAME, "readonly", (store) => store.get(id));
  return file ? normalizeFile(file) : null;
}

export async function updateOfflineFile(file: OfflineFile): Promise<void> {
  await runTransaction<IDBValidKey>(STORE_NAME, "readwrite", (store) => store.put(file));
  notifyChanged();
}

export async function removeOfflineFile(id: string): Promise<void> {
  await runTransaction<undefined>(STORE_NAME, "readwrite", (store) => store.delete(id));
  notifyChanged();
}

export async function saveOfflineCatalog(catalog: OfflineCatalog): Promise<void> {
  window.localStorage.setItem("imara:offline:last-user", catalog.userId);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([CATALOG_STORE_NAME, STORE_NAME], "readwrite");
    const catalogStore = transaction.objectStore(CATALOG_STORE_NAME);
    const fileStore = transaction.objectStore(STORE_NAME);
    catalogStore.put(catalog);
    const filesRequest = fileStore.getAll();
    filesRequest.onsuccess = () => {
      const metadataById = new Map(catalog.files.map((file) => [file.id, file]));
      for (const savedFile of filesRequest.result as OfflineFile[]) {
        if (savedFile.userId !== catalog.userId) continue;
        const metadata = metadataById.get(savedFile.id);
        if (!metadata) continue;
        fileStore.put({
          ...normalizeFile(savedFile),
          folderId: metadata.folderId,
          scope: metadata.scope,
          canEdit: metadata.canEdit,
          canDownload: metadata.canDownload,
        });
      }
    };
    filesRequest.onerror = () => reject(filesRequest.error ?? new Error("Offline file metadata could not be refreshed."));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Offline catalog update was interrupted."));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Offline catalog update failed."));
    };
  });
  notifyChanged();
}

export async function getOfflineCatalog(userId: string): Promise<OfflineCatalog | null> {
  const catalog = await runTransaction<OfflineCatalog | undefined>(CATALOG_STORE_NAME, "readonly", (store) => store.get(userId));
  return catalog ?? null;
}

export { hashBlob as hashOfflineBlob };
