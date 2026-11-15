import { apiRequest, type StoredFile, type UserFolder } from "../lib/api";
import type { Workspace, WorkspaceFile, WorkspaceFolder } from "../workspaces/types";
import type { OfflineCatalog, OfflineCatalogFile, OfflineFolder, OfflineScope } from "./offlineFiles";

interface PersonalFolderContents {
  folders: UserFolder[];
  files: StoredFile[];
}

interface WorkspaceFolderContents {
  workspaceId: string;
  folderId: string | null;
  folders: WorkspaceFolder[];
  files: WorkspaceFile[];
}

async function loadPersonalLibrary() {
  const folders: OfflineFolder[] = [];
  const files: OfflineCatalogFile[] = [];
  const visited = new Set<string>();
  const queue: Array<string | null> = [null];
  const scope: OfflineScope = { type: "personal" };

  while (queue.length) {
    const folderId = queue.shift() ?? null;
    const path = `/files${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`;
    const contents = await apiRequest<PersonalFolderContents>(path);
    for (const folder of contents.folders) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      folders.push({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        createdAt: folder.createdAt,
        scope,
      });
      queue.push(folder.id);
    }
    files.push(...contents.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      folderId: file.folderId,
      createdAt: file.createdAt,
      scope,
      canEdit: true,
      canDownload: true,
    })));
  }
  return { folders, files };
}

async function loadWorkspaceLibrary(workspace: Workspace) {
  const folders: OfflineFolder[] = [];
  const files: OfflineCatalogFile[] = [];
  const visited = new Set<string>();
  const queue: Array<string | null> = [null];
  const scope: OfflineScope = { type: "workspace", workspaceId: workspace.id, workspaceName: workspace.name };
  const isAdministrator = workspace.role === "OWNER" || workspace.role === "ADMIN";
  const assignedFolders = await apiRequest<WorkspaceFolder[]>(`/workspaces/${encodeURIComponent(workspace.id)}/my-folders`);
  const permissions = new Map(assignedFolders.map((folder) => [folder.id, new Set(folder.permissions ?? [])]));

  while (queue.length) {
    const folderId = queue.shift() ?? null;
    const path = `/workspaces/${encodeURIComponent(workspace.id)}/storage${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`;
    const contents = await apiRequest<WorkspaceFolderContents>(path);
    for (const folder of contents.folders) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      folders.push({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        createdAt: folder.createdAt,
        scope,
      });
      queue.push(folder.id);
    }
    files.push(...contents.files.map((file) => {
      const rights = permissions.get(file.folderId ?? "");
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: Number(file.sizeBytes),
        folderId: file.folderId,
        createdAt: file.createdAt,
        scope,
        canEdit: isAdministrator || Boolean(rights?.has("editFiles")),
        canDownload: isAdministrator || Boolean(rights?.has("downloadFiles")),
      };
    }));
  }
  return { folders, files };
}

export async function fetchOfflineCatalog(userId: string): Promise<OfflineCatalog> {
  const personal = await loadPersonalLibrary();
  const workspaces = await apiRequest<Workspace[]>("/workspaces");
  const workspaceLibraries = await Promise.all(workspaces.map(loadWorkspaceLibrary));
  return {
    userId,
    folders: [...personal.folders, ...workspaceLibraries.flatMap((library) => library.folders)],
    files: [...personal.files, ...workspaceLibraries.flatMap((library) => library.files)],
    workspaces: workspaces.map(({ id, name }) => ({ id, name })),
    refreshedAt: new Date().toISOString(),
  };
}
