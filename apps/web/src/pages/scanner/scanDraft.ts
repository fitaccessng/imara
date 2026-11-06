export interface ScanPage {
  id: string;
  name: string;
  blob: Blob;
}

export interface ScanDraft {
  name: string;
  pages: ScanPage[];
}

const DATABASE_NAME = "imara-document-scanner";
const STORE_NAME = "drafts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open scanner storage."));
  });
}

export async function loadScanDraft(ownerId: string): Promise<ScanDraft | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ownerId);
    request.onsuccess = () => resolve(request.result as ScanDraft | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not load the saved scan."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not load the saved scan."));
  });
}

export async function saveScanDraft(ownerId: string, draft: ScanDraft): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, ownerId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save the scan draft."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save the scan draft."));
    };
  });
}

export async function deleteScanDraft(ownerId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ownerId);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not clear the saved scan."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not clear the saved scan."));
    };
  });
}
