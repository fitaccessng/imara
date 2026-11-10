import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, ChevronRight, Download, Eye, FileText, Folder, FolderPlus, Move, Pencil, Star, Trash2, Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, downloadFile, type StoredFile, type UserFolder } from "../lib/api";
import { FileViewerModal } from "../components/FileViewerModal";
import { PlanLimitMessage } from "../components/PlanLimitMessage";
import { ActionModal, type ActionModalRequest } from "../components/ActionModal";
import { FolderZipTools } from "../components/FolderZipTools";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

interface FolderContents {
  folderId: string | null;
  folders: UserFolder[];
  files: StoredFile[];
}

export function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get("folder") || undefined;
  const createFolderOpen = searchParams.get("createFolder") === "1";
  const queryClient = useQueryClient();
  const [newFolderName, setNewFolderName] = useState("");
  const [actionError, setActionError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [movingFolder, setMovingFolder] = useState<UserFolder | null>(null);
  const [destinationFolderId, setDestinationFolderId] = useState("");
  const [viewingFile, setViewingFile] = useState<StoredFile | null>(null);
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);

  function setCreateFolderOpen(open: boolean) {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("createFolder", "1");
    else next.delete("createFolder");
    setSearchParams(next);
  }

  const contentsQuery = useQuery({
    queryKey: ["storage-files", folderId ?? null],
    queryFn: () => apiRequest<FolderContents>(`/files${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`),
  });
  const currentFolderQuery = useQuery({
    queryKey: ["storage-folder", folderId],
    queryFn: () => apiRequest<UserFolder>(`/folders/${folderId}`),
    enabled: Boolean(folderId),
  });
  const folderTreeQuery = useQuery({
    queryKey: ["personal-folder-tree"],
    queryFn: () => apiRequest<UserFolder[]>("/folders/tree"),
    enabled: Boolean(movingFolder),
  });

  const refreshLibrary = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["storage-files"] }),
      queryClient.invalidateQueries({ queryKey: ["storage-favorites"] }),
      queryClient.invalidateQueries({ queryKey: ["storage-trash"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
    ]);
  };
  const createFolder = useMutation({
    mutationFn: (name: string) => apiRequest<UserFolder>("/folders", {
      method: "POST",
      body: JSON.stringify({ name, ...(folderId ? { parentFolderId: folderId } : {}) }),
    }),
    onSuccess: async () => {
      setNewFolderName("");
      setActionError("");
      setCreateFolderOpen(false);
      await refreshLibrary();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to create the folder."),
  });
  const uploadFile = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      if (folderId) body.append("folderId", folderId);
      return apiRequest<StoredFile>("/files", { method: "POST", body });
    },
    onSuccess: async () => {
      setActionError("");
      await refreshLibrary();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to upload this file."),
  });
  const deleteFile = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/files/${id}`, { method: "DELETE" }),
    onSuccess: refreshLibrary,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to delete this file."),
  });
  const setFavorite = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      apiRequest<{ id: string; isFavorite: boolean }>(`/files/${id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite }),
      }),
    onSuccess: refreshLibrary,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to update this favourite."),
  });
  const setFolderFavorite = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      apiRequest<{ id: string; isFavorite: boolean }>(`/folders/${id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite }),
      }),
    onSuccess: refreshLibrary,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to update this folder favourite."),
  });
  const deleteFolder = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/folders/${id}`, { method: "DELETE" }),
    onSuccess: refreshLibrary,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to delete this folder."),
  });
  const moveFolder = useMutation({
    mutationFn: ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) =>
      apiRequest<UserFolder>(`/folders/${folderId}/move`, {
        method: "POST",
        body: JSON.stringify({ parentFolderId }),
      }),
    onSuccess: async () => {
      setMovingFolder(null);
      setDestinationFolderId("");
      setActionError("");
      await refreshLibrary();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to move this folder."),
  });

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await createFolder.mutateAsync(name).catch(() => undefined);
  }

  async function handleMoveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movingFolder) return;
    await moveFolder.mutateAsync({
      folderId: movingFolder.id,
      parentFolderId: destinationFolderId || null,
    }).catch(() => undefined);
  }

  async function handleRename(folder: UserFolder) {
    setActionModal({
      title: "Rename folder",
      description: `Choose a new name for “${folder.name}”.`,
      inputLabel: "Folder name",
      initialValue: folder.name,
      confirmLabel: "Save name",
      onConfirm: async (name) => {
        await apiRequest(`/folders/${folder.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
        setActionModal(null);
        setActionError("");
        await refreshLibrary();
        if (folder.id === folderId) await queryClient.invalidateQueries({ queryKey: ["storage-folder", folderId] });
      },
    });
  }

  async function handleDownload(file: StoredFile) {
    setDownloadError("");
    try {
      await downloadFile(`/files/${file.id}/download`, file.name);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download this file.");
    }
  }

  const contents = contentsQuery.data;
  const folders = contents?.folders ?? [];
  const files = contents?.files ?? [];
  const folderTree = folderTreeQuery.data ?? [];
  const excludedMoveTargets = new Set<string>();
  if (movingFolder) {
    excludedMoveTargets.add(movingFolder.id);
    let foundDescendant = true;
    while (foundDescendant) {
      foundDescendant = false;
      for (const folder of folderTree) {
        if (folder.parentFolderId && excludedMoveTargets.has(folder.parentFolderId) && !excludedMoveTargets.has(folder.id)) {
          excludedMoveTargets.add(folder.id);
          foundDescendant = true;
        }
      }
    }
  }
  const moveTargets = folderTree.filter((folder) => !excludedMoveTargets.has(folder.id));
  const busy = createFolder.isPending || uploadFile.isPending || deleteFile.isPending || setFavorite.isPending || deleteFolder.isPending || moveFolder.isPending;

  return (
    <div className="files-page">
      <div className="page-heading files-heading">
        <div>
          <span className="eyebrow">YOUR LIBRARY</span>
          <h1>{currentFolderQuery.data?.name ?? "Your files"}<span className="heading-period">.</span></h1>
          <p className="page-subtitle">A private home for the documents you want to keep.</p>
        </div>
        <div className="files-heading-actions">
          <Link className="button button-outline" to={folderId ? `/scanner?folder=${encodeURIComponent(folderId)}` : "/scanner"}>
            <Camera size={15} /> Scan a document
          </Link>
          <button className="button button-outline" type="button" onClick={() => setCreateFolderOpen(true)}>
            <FolderPlus size={15} /> New folder
          </button>
          <label className={`button button-green files-upload-button ${busy ? "button-disabled" : ""}`}>
            <Upload size={15} />{uploadFile.isPending ? "Uploading…" : "Upload a file"}
            <input
              type="file"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile.mutateAsync(file).catch(() => undefined);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="files-toolbar">
        <div className="files-breadcrumb">
          {folderId ? (
            <>
              <button className="subtle-link" onClick={() => setSearchParams({})}><ArrowLeft size={14} /> All files</button>
              <ChevronRight size={14} />
              <span>{currentFolderQuery.data?.name ?? "Folder"}</span>
            </>
          ) : <span>All files</span>}
        </div>
        <FolderZipTools
          folderId={folderId}
          folderName={currentFolderQuery.data?.name ?? "Your files"}
          canDownload
          canExtract
          canCreateFolders
          onComplete={refreshLibrary}
        />
      </div>

      {actionError && <p className="form-alert files-alert" role="alert"><PlanLimitMessage message={actionError} /></p>}
      {downloadError && <p className="form-alert files-alert" role="alert">{downloadError}</p>}
      {contentsQuery.isError && <div className="inline-error" role="alert">
        <div><strong>Your library couldn’t load.</strong><p>{contentsQuery.error instanceof Error ? contentsQuery.error.message : "Please try again."}</p></div>
        <button className="button button-outline button-small" onClick={() => void contentsQuery.refetch()}>Try again</button>
      </div>}
      {currentFolderQuery.isError && <div className="inline-error" role="alert"><div><strong>Folder not found.</strong><p>This folder may have been removed or is no longer available.</p></div></div>}

      {contentsQuery.isLoading ? (
        <div className="page-loading"><span className="loader" />Loading your files…</div>
      ) : contents ? (
        <section className="file-list-card" aria-label="Files and folders">
          <div className="file-list-header"><span>Name</span><span>Size</span><span>Added</span><span className="file-actions-heading">Actions</span></div>
          {folders.map((folder) => (
            <div className="file-list-row" key={folder.id}>
              <button className="file-name-button" onClick={() => setSearchParams({ folder: folder.id })}>
                <Folder size={17} className="folder-icon" /><span>{folder.name}</span>
              </button>
              <span className="file-secondary">Folder</span>
              <span className="file-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(folder.createdAt))}</span>
              <span className="file-row-actions">
                <button aria-label={`${folder.isFavorite ? "Remove" : "Add"} ${folder.name} ${folder.isFavorite ? "from" : "to"} favourites`} aria-pressed={folder.isFavorite} title={folder.isFavorite ? "Remove from favourites" : "Add to favourites"} disabled={setFolderFavorite.isPending} onClick={() => setFolderFavorite.mutate({ id: folder.id, isFavorite: !folder.isFavorite })}>
                  <Star size={15} fill={folder.isFavorite ? "currentColor" : "none"} />
                </button>
                <button aria-label={`Move ${folder.name}`} title="Move folder" onClick={() => {
                  setActionError("");
                  setDestinationFolderId("");
                  setMovingFolder(folder);
                }}><Move size={15} /></button>
                <button aria-label={`Rename ${folder.name}`} title="Rename folder" onClick={() => void handleRename(folder)}><Pencil size={15} /></button>
                <button aria-label={`Delete ${folder.name}`} title="Delete folder" onClick={() => setActionModal({
                  title: "Delete folder",
                  description: `Delete “${folder.name}”? Folders must be empty before they can be deleted.`,
                  confirmLabel: "Delete folder",
                  danger: true,
                  onConfirm: async () => {
                    await deleteFolder.mutateAsync(folder.id);
                    setActionModal(null);
                  },
                })}><Trash2 size={15} /></button>
              </span>
            </div>
          ))}
          {files.map((file) => (
            <div className="file-list-row" key={file.id}>
              <div className="file-name-button file-name-static"><FileText size={17} /><span>{file.name}</span></div>
              <span className="file-secondary">{formatBytes(Number(file.sizeBytes))}</span>
              <span className="file-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(file.createdAt))}</span>
              <div className="file-row-actions">
                <FolderZipTools
                  variant="file"
                  file={file}
                  folderId={folderId}
                  folderName={currentFolderQuery.data?.name ?? "Your files"}
                  canDownload
                  canExtract
                  canCreateFolders
                  onComplete={refreshLibrary}
                />
                <button aria-label={`View ${file.name}`} title="View file" onClick={() => setViewingFile(file)}><Eye size={15} /></button>
                <button aria-label={`Download ${file.name}`} title="Download file" onClick={() => void handleDownload(file)}><Download size={15} /></button>
                <button aria-label={`${file.isFavorite ? "Remove" : "Add"} ${file.name} ${file.isFavorite ? "from" : "to"} favourites`} aria-pressed={Boolean(file.isFavorite)} title={file.isFavorite ? "Remove from favourites" : "Add to favourites"} disabled={setFavorite.isPending} onClick={() => setFavorite.mutate({ id: file.id, isFavorite: !file.isFavorite })}>
                  <Star size={15} fill={file.isFavorite ? "currentColor" : "none"} />
                </button>
                <button aria-label={`Delete ${file.name}`} title="Delete file" onClick={() => setActionModal({
                  title: "Delete file",
                  description: `“${file.name}” will be moved to the Recycle Bin. You can restore it or permanently delete it later.`,
                  confirmLabel: "Move to Recycle Bin",
                  danger: true,
                  onConfirm: async () => {
                    await deleteFile.mutateAsync(file.id);
                    setActionModal(null);
                  },
                })}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {folders.length === 0 && files.length === 0 && (
            <div className="files-empty">
              <div className="empty-illustration"><div className="empty-paper"><i /><i /><i /></div></div>
              <h2>This folder is ready for its first file.</h2>
              <p>Upload a document or create a folder to get started.</p>
            </div>
          )}
        </section>
      ) : null}
      {createFolderOpen && (
        <div className="folder-move-backdrop">
          <section className="folder-move-dialog" role="dialog" aria-modal="true" aria-labelledby="create-folder-title">
            <div className="folder-move-heading">
              <div><span className="eyebrow">YOUR LIBRARY</span><h2 id="create-folder-title">Create a folder</h2></div>
              <button className="icon-button" aria-label="Close create folder dialog" onClick={() => setCreateFolderOpen(false)}><X size={18} /></button>
            </div>
            <p>{folderId ? "This folder will be created inside the folder you are viewing." : "Give your new folder a name."}</p>
            <form onSubmit={(event) => void handleCreateFolder(event)}>
              <label className="field" htmlFor="new-folder-name">Folder name</label>
              <input
                id="new-folder-name"
                className="folder-dialog-input"
                autoFocus
                maxLength={120}
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="e.g. Travel documents"
              />
              <div className="folder-move-actions">
                <button className="button button-outline" type="button" onClick={() => setCreateFolderOpen(false)}>Cancel</button>
                <button className="button button-green" type="submit" disabled={busy || !newFolderName.trim()}>
                  {createFolder.isPending ? "Creating…" : "Create folder"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {movingFolder && (
        <div className="folder-move-backdrop">
          <section className="folder-move-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-move-title">
            <div className="folder-move-heading">
              <div><span className="eyebrow">ORGANISE</span><h2 id="folder-move-title">Move folder</h2></div>
              <button className="icon-button" aria-label="Close move folder dialog" onClick={() => setMovingFolder(null)}><X size={18} /></button>
            </div>
            <p>Choose where to move <strong>{movingFolder.name}</strong>.</p>
            {folderTreeQuery.isError && <p className="form-alert" role="alert">{folderTreeQuery.error instanceof Error ? folderTreeQuery.error.message : "Could not load folders."}</p>}
            <form onSubmit={(event) => void handleMoveFolder(event)}>
              <label className="field" htmlFor="folder-destination">Destination</label>
              <select
                id="folder-destination"
                value={destinationFolderId}
                onChange={(event) => setDestinationFolderId(event.target.value)}
                disabled={folderTreeQuery.isLoading || moveFolder.isPending}
              >
                <option value="">My files</option>
                {moveTargets.map((folder) => {
                  const path: string[] = [folder.name];
                  const visited = new Set([folder.id]);
                  let parentId = folder.parentFolderId;
                  while (parentId && !visited.has(parentId)) {
                    visited.add(parentId);
                    const parent = folderTree.find((item) => item.id === parentId);
                    if (!parent) break;
                    path.unshift(parent.name);
                    parentId = parent.parentFolderId;
                  }
                  return <option key={folder.id} value={folder.id}>{path.join(" / ")}</option>;
                })}
              </select>
              {folderTreeQuery.isLoading && <span className="field-hint">Loading folders…</span>}
              <div className="folder-move-actions">
                <button className="button button-outline" type="button" onClick={() => setMovingFolder(null)}>Cancel</button>
                <button className="button button-green" type="submit" disabled={folderTreeQuery.isLoading || folderTreeQuery.isError || moveFolder.isPending}>
                  {moveFolder.isPending ? "Moving…" : "Move folder"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {viewingFile && <FileViewerModal
        file={viewingFile}
        readUrl={`/files/${viewingFile.id}/download`}
        saveUrl={`/files/${viewingFile.id}/content`}
        canEdit
        canDownload
        onClose={() => setViewingFile(null)}
        onSaved={refreshLibrary}
        onDownload={() => void handleDownload(viewingFile)}
      />}
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
      <p className="storage-footnote">Files use your account’s storage quota. Individual uploads are limited to 25 MiB.</p>
    </div>
  );
}
