import { apiBlob, apiRequest } from "../lib/api";
import {
  getOfflineFile,
  hashOfflineBlob,
  listOfflineFiles,
  updateOfflineFile,
  type OfflineFile,
} from "./offlineFiles";

function filePath(file: OfflineFile, action: "download" | "content") {
  const fileId = encodeURIComponent(file.id);
  if (file.scope.type === "workspace") {
    if (!file.scope.workspaceId) throw new Error("The workspace for this offline file is no longer available.");
    return `/workspaces/${encodeURIComponent(file.scope.workspaceId)}/files/${fileId}/${action}`;
  }
  return action === "download" ? `/files/${fileId}/download` : `/files/${fileId}/content`;
}

async function uploadOfflineVersion(file: OfflineFile): Promise<void> {
  const body = new FormData();
  body.append("file", new File([file.blob], file.name, { type: file.mimeType }));
  if (file.changeSummary) body.append("changeSummary", file.changeSummary.slice(0, 200));
  await apiRequest(filePath(file, "content"), { method: "PATCH", body });
}

export async function syncPendingOfflineFiles(userId: string): Promise<void> {
  if (!navigator.onLine) return;
  const files = await listOfflineFiles(userId);
  for (const file of files.filter((item) => item.syncStatus === "pending")) {
    try {
      if (!file.baseHash) {
        await updateOfflineFile({
          ...file,
          syncStatus: "conflict",
          syncError: "This copy has no saved server baseline, so it was kept without uploading.",
        });
        continue;
      }

      const currentServerBlob = await apiBlob(filePath(file, "download"));
      const serverHash = await hashOfflineBlob(currentServerBlob);
      if (serverHash !== file.baseHash) {
        await updateOfflineFile({
          ...file,
          syncStatus: "conflict",
          conflictHash: serverHash,
          syncError: "The cloud file changed after this copy was saved. Both copies are preserved.",
        });
        continue;
      }

      await uploadOfflineVersion(file);
      const savedHash = await hashOfflineBlob(file.blob);
      await updateOfflineFile({
        ...file,
        baseHash: savedHash,
        syncStatus: "synced",
        conflictHash: undefined,
        syncError: undefined,
      });
    } catch (reason) {
      const current = await getOfflineFile(file.id);
      if (!current || current.syncStatus === "conflict") continue;
      await updateOfflineFile({
        ...current,
        syncStatus: "error",
        syncError: reason instanceof Error ? reason.message : "This edit could not be synced.",
      });
    }
  }
}

export async function retryOfflineSync(file: OfflineFile): Promise<void> {
  if (file.syncStatus !== "error") return;
  await updateOfflineFile({ ...file, syncStatus: "pending", syncError: undefined });
  await syncPendingOfflineFiles(file.userId);
}

export async function replaceCloudWithOfflineCopy(file: OfflineFile): Promise<void> {
  if (!navigator.onLine) throw new Error("Connect to the internet before resolving this conflict.");
  const currentServerBlob = await apiBlob(filePath(file, "download"));
  const current = await getOfflineFile(file.id);
  if (!current) throw new Error("This offline copy is no longer available.");
  await updateOfflineFile({
    ...current,
    baseHash: await hashOfflineBlob(currentServerBlob),
    conflictHash: undefined,
    syncStatus: "pending",
    syncError: undefined,
    changeSummary: current.changeSummary ?? "Applied offline edits",
  });
  await syncPendingOfflineFiles(file.userId);
}

export async function keepBothVersions(file: OfflineFile): Promise<void> {
  const current = await getOfflineFile(file.id);
  if (!current || current.syncStatus !== "conflict") return;
  await updateOfflineFile({
    ...current,
    syncError: "Both copies are kept: the cloud version is unchanged and this device copy remains available here.",
  });
}
