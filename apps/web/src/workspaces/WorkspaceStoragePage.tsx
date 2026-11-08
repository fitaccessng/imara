import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Eye, FileText, Folder, FolderPlus, LockKeyhole, Pencil, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, downloadFile } from "../lib/api";
import { ActionModal, type ActionModalRequest } from "../components/ActionModal";
import { FileViewerModal } from "../components/FileViewerModal";
import { PlanLimitMessage } from "../components/PlanLimitMessage";
import { FolderZipTools } from "../components/FolderZipTools";
import type { WorkspaceFile, WorkspaceFolder } from "./types";
import { useWorkspaceScope } from "./useWorkspaceScope";

interface WorkspaceFolderContents {
  workspaceId: string;
  folderId: string | null;
  folders: WorkspaceFolder[];
  files: WorkspaceFile[];
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export function WorkspaceStoragePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const workspaceId = workspace?.id;
  const folderId = searchParams.get("folder") || undefined;
  const queryClient = useQueryClient();
  const [folderName, setFolderName] = useState("");
  const [actionError, setActionError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [viewingFile, setViewingFile] = useState<WorkspaceFile | null>(null);
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);
  const isAdministrator = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  const accessibleFoldersQuery = useQuery({
    queryKey: ["workspace-accessible-folders", workspaceId],
    queryFn: () => apiRequest<WorkspaceFolder[]>(`/workspaces/${workspaceId}/my-folders`),
    enabled: Boolean(workspaceId),
  });
  const contentsQuery = useQuery({
    queryKey: ["workspace-storage", workspaceId, folderId ?? null],
    queryFn: () => apiRequest<WorkspaceFolderContents>(`/workspaces/${workspaceId}/storage${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`),
    enabled: Boolean(workspaceId),
  });
  const currentFolder = accessibleFoldersQuery.data?.find((folder) => folder.id === folderId);
  const rights = new Set(currentFolder?.permissions ?? []);
  const canCreateFolder = isAdministrator || rights.has("createSubfolders");
  const canUpload = isAdministrator || rights.has("uploadFiles");
  const createFolder = useMutation({
    mutationFn: (name: string) => apiRequest<WorkspaceFolder>(`/workspaces/${workspaceId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name, ...(folderId ? { parentFolderId: folderId } : {}) }),
    }),
    onSuccess: async () => {
      setFolderName("");
      setActionError("");
      await refreshLibrary();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to create the folder."),
  });
  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      if (folderId) body.append("folderId", folderId);
      return apiRequest<WorkspaceFile>(`/workspaces/${workspaceId}/files`, { method: "POST", body });
    },
    onSuccess: async () => {
      setActionError("");
      await refreshLibrary();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to upload this file."),
  });

  async function refreshLibrary() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-storage", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-accessible-folders", workspaceId] }),
    ]);
  }

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    await createFolder.mutateAsync(name).catch(() => undefined);
  }

  async function renameFolder(folder: WorkspaceFolder) {
    setActionModal({
      title: "Rename folder",
      description: `Choose a new name for “${folder.name}”.`,
      inputLabel: "Folder name",
      initialValue: folder.name,
      confirmLabel: "Save name",
      onConfirm: async (name) => {
        await apiRequest(`/workspaces/${workspaceId}/folders/${folder.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setActionModal(null);
        setActionError("");
        await refreshLibrary();
      },
    });
  }

  async function deleteFolder(folder: WorkspaceFolder) {
    setActionModal({
      title: "Delete folder",
      description: `Delete “${folder.name}”? It must be empty before it can be deleted.`,
      confirmLabel: "Delete folder",
      danger: true,
      onConfirm: async () => {
        await apiRequest<void>(`/workspaces/${workspaceId}/folders/${folder.id}`, { method: "DELETE" });
        setActionModal(null);
        await refreshLibrary();
      },
    });
  }

  async function download(file: WorkspaceFile) {
    setDownloadError("");
    try {
      await downloadFile(`/workspaces/${workspaceId}/files/${file.id}/download`, file.name);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download this file.");
    }
  }

  async function renameFile(file: WorkspaceFile) {
    setActionModal({
      title: "Rename file",
      description: `Choose a new name for “${file.name}”.`,
      inputLabel: "File name",
      initialValue: file.name,
      confirmLabel: "Save name",
      onConfirm: async (name) => {
        await apiRequest(`/workspaces/${workspaceId}/files/${file.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setActionModal(null);
        await refreshLibrary();
      },
    });
  }

  async function deleteFile(file: WorkspaceFile) {
    setActionModal({
      title: "Delete file",
      description: `Delete “${file.name}”? This cannot be undone.`,
      confirmLabel: "Delete file",
      danger: true,
      onConfirm: async () => {
        await apiRequest<void>(`/workspaces/${workspaceId}/files/${file.id}`, { method: "DELETE" });
        setActionModal(null);
        await refreshLibrary();
      },
    });
  }

  if (workspacesQuery.isLoading) return <div className="page-loading"><span className="loader" />Loading workspace…</div>;
  if (workspacesQuery.isError) return <div className="inline-error" role="alert"><div><strong>Workspace could not load.</strong><p>{workspacesQuery.error instanceof Error ? workspacesQuery.error.message : "Please try again."}</p></div><button className="button button-outline button-small" onClick={() => void workspacesQuery.refetch()}>Try again</button></div>;
  if (!workspace) return <div className="workspace-empty-card"><div className="workspace-empty-mark"><Folder size={19} /></div><span className="eyebrow">BUSINESS WORKSPACE</span><h2>No business space yet.</h2><p>Create a workspace or accept an invitation to get started.</p><Link className="button button-green" to="/workspace/team">Set up a workspace</Link></div>;

  const folders = contentsQuery.data?.folders ?? [];
  const files = contentsQuery.data?.files ?? [];
  const currentPermissions = currentFolder?.permissions ?? [];
  const busy = createFolder.isPending || uploadFile.isPending;
  const canViewFiles = isAdministrator || currentPermissions.includes("viewFiles");
  const hasWorkspaceContent = Boolean(folders.length || files.length);

  return (
    <div className="workspace-admin-page">
      <div className="page-heading files-heading">
        <div>
          <span className="eyebrow">{workspace.name.toUpperCase()} · SHARED FILES</span>
          <h1>{currentFolder?.name ?? "Workspace folders"}<span className="heading-period">.</span></h1>
          <p className="page-subtitle">{isAdministrator ? "Shared business documents, protected by workspace access rules." : "Only folders assigned to you appear here."}</p>
          {workspaces.length > 1 && <label className="workspace-select-label"><span>Workspace</span><span className="workspace-select-wrap"><select value={workspace.id} onChange={(event) => selectWorkspace(event.target.value)} aria-label="Select business workspace">{workspaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>}
        </div>
        <div className="files-heading-actions">
          {canCreateFolder && (
            <form className="workspace-folder-create-form" onSubmit={(event) => void submitFolder(event)}>
              <input aria-label="New shared folder name" maxLength={120} placeholder="New folder name" value={folderName} onChange={(event) => setFolderName(event.target.value)} />
              <button className="button button-green" disabled={busy || !folderName.trim()} type="submit"><FolderPlus size={15} /> Create folder</button>
            </form>
          )}
          {canUpload && (
            <label className={`button button-green files-upload-button ${busy ? "button-disabled" : ""}`}>
              <Upload size={15} />{uploadFile.isPending ? "Uploading…" : "Upload a file"}
              <input type="file" disabled={busy} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile.mutateAsync(file).catch(() => undefined);
                event.currentTarget.value = "";
              }} />
            </label>
          )}
        </div>
      </div>

      <div className="files-toolbar workspace-files-toolbar">
        <div className="files-breadcrumb">
          {folderId ? <>
            <button className="subtle-link" onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("folder");
              setSearchParams(next);
            }}><ArrowLeft size={14} /> Assigned folders</button>
            <ChevronRight size={14} /><span>{currentFolder?.name ?? "Folder"}</span>
          </> : <span>Assigned folders</span>}
        </div>
        <FolderZipTools
          scopeBase={`/workspaces/${workspace.id}`}
          folderId={folderId}
          folderName={currentFolder?.name ?? `${workspace.name} files`}
          canDownload={isAdministrator || Boolean(folderId && currentPermissions.includes("downloadFiles"))}
          canExtract={canUpload}
          canCreateFolders={canCreateFolder}
          onComplete={refreshLibrary}
        />
      </div>

      {actionError && <p className="form-alert files-alert" role="alert"><PlanLimitMessage message={actionError} /></p>}
      {downloadError && <p className="form-alert files-alert" role="alert">{downloadError}</p>}
      {contentsQuery.isError && <div className="inline-error" role="alert"><div><strong>These folders couldn’t load.</strong><p>{contentsQuery.error instanceof Error ? contentsQuery.error.message : "Please try again."}</p></div><button className="button button-outline button-small" onClick={() => void contentsQuery.refetch()}>Try again</button></div>}
      {accessibleFoldersQuery.isError && <div className="inline-error" role="alert"><div><strong>Your folder access couldn’t be resolved.</strong><p>{accessibleFoldersQuery.error instanceof Error ? accessibleFoldersQuery.error.message : "Please try again."}</p></div><button className="button button-outline button-small" onClick={() => void accessibleFoldersQuery.refetch()}>Try again</button></div>}

      {contentsQuery.isLoading || accessibleFoldersQuery.isLoading ? <div className="page-loading"><span className="loader" />Loading authorized folders…</div> : contentsQuery.data && (
        <section className="file-list-card" aria-label="Authorized business files and folders">
          <div className="file-list-header"><span>Name</span><span>Size</span><span>Added</span><span className="file-actions-heading">Actions</span></div>
          {folders.map((folder) => (
            <div className="file-list-row" key={folder.id}>
              <button className="file-name-button" onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("folder", folder.id);
                setSearchParams(next);
              }}><Folder size={17} className="folder-icon" /><span>{folder.name}</span></button>
              <span className="file-secondary">Folder</span>
              <span className="file-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(folder.createdAt))}</span>
              <span className="file-row-actions">
                {(isAdministrator || accessibleFoldersQuery.data?.find((item) => item.id === folder.id)?.permissions?.includes("renameFolders")) && <button aria-label={`Rename ${folder.name}`} title="Rename folder" onClick={() => void renameFolder(folder)}><Pencil size={15} /></button>}
                {(isAdministrator || accessibleFoldersQuery.data?.find((item) => item.id === folder.id)?.permissions?.includes("manageContents")) && <button aria-label={`Delete ${folder.name}`} title="Delete folder" onClick={() => void deleteFolder(folder)}><Trash2 size={15} /></button>}
              </span>
            </div>
          ))}
          {canViewFiles && files.map((file) => (
            <div className="file-list-row" key={file.id}>
              <div className="file-name-button file-name-static"><FileText size={17} /><span>{file.name}</span></div>
              <span className="file-secondary">{formatBytes(Number(file.sizeBytes))}</span>
              <span className="file-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(file.createdAt))}</span>
              <div className="file-row-actions">
                <FolderZipTools
                  variant="file"
                  scopeBase={`/workspaces/${workspace.id}`}
                  file={file}
                  folderId={folderId}
                  folderName={currentFolder?.name ?? `${workspace.name} files`}
                  canDownload={isAdministrator || currentPermissions.includes("downloadFiles")}
                  canExtract={canUpload}
                  canCreateFolders={canCreateFolder}
                  onComplete={refreshLibrary}
                />
                {(isAdministrator || currentPermissions.includes("viewFiles")) && <button aria-label={`View ${file.name}`} title="View file" onClick={() => setViewingFile(file)}><Eye size={15} /></button>}
                {(isAdministrator || currentPermissions.includes("downloadFiles")) && <button aria-label={`Download ${file.name}`} title="Download file" onClick={() => void download(file)}><Download size={15} /></button>}
                {(isAdministrator || currentPermissions.includes("renameFiles")) && <button aria-label={`Rename ${file.name}`} title="Rename file" onClick={() => void renameFile(file)}><Pencil size={15} /></button>}
                {(isAdministrator || currentPermissions.includes("deleteFiles")) && <button aria-label={`Delete ${file.name}`} title="Delete file" onClick={() => void deleteFile(file)}><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
          {!hasWorkspaceContent && (
            <div className="files-empty">
              <div className="empty-illustration"><div className="empty-paper"><i /><i /><i /></div></div>
              <h2>{!folderId && !isAdministrator ? "No folders shared with you yet." : canViewFiles ? "This space is ready for its first file." : "Files are not visible in this folder."}</h2>
              <p>{!folderId && !isAdministrator ? "Ask a workspace administrator to share a folder with you." : !canViewFiles ? "You can’t view files with your current access. Contact a workspace administrator if you need more access." : canUpload || canCreateFolder ? "Upload a document or create a subfolder to get started." : "No files are available in this folder."}</p>
            </div>
          )}
        </section>
      )}
      <p className="workspace-note"><ShieldCheck size={14} /> {canUpload ? "Workspace storage is shared. Your folder access is checked by IMARA before every file operation." : "Your folder access is checked by IMARA before every file operation."}</p>
      {!canCreateFolder && !canUpload && <p className="workspace-note"><LockKeyhole size={13} /> You have view-only access in this folder.</p>}
      {viewingFile && <FileViewerModal
        file={viewingFile}
        readUrl={`/workspaces/${workspaceId}/files/${viewingFile.id}/download`}
        saveUrl={`/workspaces/${workspaceId}/files/${viewingFile.id}/content`}
        canEdit={isAdministrator || currentPermissions.includes("editFiles")}
        canDownload={isAdministrator || currentPermissions.includes("downloadFiles")}
        onClose={() => setViewingFile(null)}
        onSaved={refreshLibrary}
        onDownload={() => void download(viewingFile)}
      />}
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
    </div>
  );
}
