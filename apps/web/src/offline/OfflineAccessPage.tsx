import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, Cloud, Download, FileText,
  Folder, FolderDown, HardDrive, LoaderCircle, RefreshCw, Search,
  Trash2, Wifi, WifiOff, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiBlob } from "../lib/api";
import { OfficePreviewEditor } from "../components/OfficePreviewEditor";
import { useAuth } from "../auth/AuthProvider";
import { PageShell } from "../pages/PageShell";
import { formatStorageBytes } from "../pages/dashboard/StorageOverviewCard";
import {
  getOfflineCatalog, getOfflineFile, listOfflineFiles, removeOfflineFile, saveOfflineCatalog,
  saveOfflineEdit, saveOfflineFile, type OfflineCatalog, type OfflineCatalogFile,
  type OfflineFile, type OfflineFolder, type OfflineScope,
} from "./offlineFiles";
import { fetchOfflineCatalog } from "./offlineCatalog";
import { keepBothVersions, replaceCloudWithOfflineCopy, retryOfflineSync, syncPendingOfflineFiles } from "./offlineSync";

type LibraryScope = "personal" | `workspace:${string}`;

function scopeKey(scope: OfflineScope): LibraryScope {
  return scope.type === "personal" ? "personal" : `workspace:${scope.workspaceId ?? ""}`;
}

function downloadPath(file: OfflineCatalogFile) {
  const id = encodeURIComponent(file.id);
  return file.scope.type === "workspace"
    ? `/workspaces/${encodeURIComponent(file.scope.workspaceId ?? "")}/files/${id}/download`
    : `/files/${id}/download`;
}

function isWithinFolder(folder: OfflineFolder, parentId: string, folders: OfflineFolder[]) {
  let current: OfflineFolder | undefined = folder;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === parentId) return true;
    seen.add(current.id);
    current = folders.find((item) => item.id === current?.parentFolderId && scopeKey(item.scope) === scopeKey(folder.scope));
  }
  return false;
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function editableTextFile(file: OfflineFile) {
  const extension = fileExtension(file.name);
  return file.mimeType.startsWith("text/")
    || ["json", "xml", "javascript", "x-javascript"].includes(file.mimeType.split("/").pop() ?? "")
    || ["txt", "md", "markdown", "json", "xml", "js", "ts", "css", "html", "yaml", "yml", "log"].includes(extension);
}

function officeFile(file: OfflineFile) {
  return ["csv", "tsv", "docx", "pdf", "pptx", "xls", "xlsx", "wps"].includes(fileExtension(file.name));
}

function getFileStatus(file: OfflineFile | undefined) {
  if (!file) return { label: "Online only", className: "offline-status-cloud" };
  if (file.syncStatus === "pending") return { label: "Waiting to sync", className: "offline-status-pending" };
  if (file.syncStatus === "conflict") return { label: "Needs your choice", className: "offline-status-conflict" };
  if (file.syncStatus === "error") return { label: "Sync paused", className: "offline-status-error" };
  return { label: "Saved on this device", className: "offline-status-saved" };
}

export function OfflineAccessPage() {
  const { user, loading: authLoading } = useAuth();
  const [catalog, setCatalog] = useState<OfflineCatalog | null>(null);
  const [files, setFiles] = useState<OfflineFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<OfflineFile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [authorized, setAuthorized] = useState(Boolean(user));
  const [storageUsage, setStorageUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [scope, setScope] = useState<LibraryScope>("personal");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<{ label: string; complete: number; total: number } | null>(null);

  const loadLocal = useCallback(async (ownerId: string) => {
    const [savedFiles, savedCatalog, estimate] = await Promise.all([
      listOfflineFiles(ownerId),
      getOfflineCatalog(ownerId),
      navigator.storage?.estimate(),
    ]);
    setFiles(savedFiles);
    setCatalog(savedCatalog);
    if (estimate) setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
  }, []);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    let ownerId = user?.id ?? "";
    let hadSession = false;
    try {
      if (!user) ownerId = window.localStorage.getItem("imara:offline:last-user") ?? "";
      hadSession = window.localStorage.getItem("imara:session-established") === "true";
    } catch {
      setFiles([]);
      setCatalog(null);
      setAuthorized(false);
      setError("This browser’s local storage is unavailable, so account access cannot be verified.");
      setLoading(false);
      return;
    }

    const canOpenLibrary = Boolean(user) || (hadSession && Boolean(ownerId));
    setAuthorized(canOpenLibrary);
    if (!canOpenLibrary || !ownerId) {
      setFiles([]);
      setCatalog(null);
      setLoading(false);
      return;
    }

    setRefreshing(navigator.onLine && Boolean(user));
    setError("");
    try {
      await loadLocal(ownerId);
      setLoading(false);
      if (navigator.onLine && user) {
        try {
          const nextCatalog = await fetchOfflineCatalog(user.id);
          await saveOfflineCatalog(nextCatalog);
          await syncPendingOfflineFiles(user.id);
          await loadLocal(user.id);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "The library could not be refreshed. Your saved index is still available.");
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The offline library could not be refreshed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, loadLocal, user]);

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
      void refresh();
    };
    const updateFiles = () => {
      try {
        const ownerId = user?.id ?? window.localStorage.getItem("imara:offline:last-user") ?? "";
        if (ownerId) void loadLocal(ownerId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Local files could not be refreshed."));
      } catch {
        setError("Local account access could not be checked.");
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("imara:offline-files-changed", updateFiles);
    void refresh();
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("imara:offline-files-changed", updateFiles);
    };
  }, [loadLocal, refresh, user]);

  const savedById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const workspaces = useMemo(() => {
    return catalog?.workspaces ?? [];
  }, [catalog]);
  const folders = useMemo(
    () => (catalog?.folders ?? []).filter((folder) => scopeKey(folder.scope) === scope),
    [catalog, scope],
  );
  const folder = folders.find((item) => item.id === folderId) ?? null;
  const breadcrumbs = useMemo(() => {
    const result: OfflineFolder[] = [];
    let current = folder;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      result.unshift(current);
      seen.add(current.id);
      current = folders.find((item) => item.id === current?.parentFolderId) ?? null;
    }
    return result;
  }, [folder, folders]);
  const visibleFolders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return folders.filter((item) => query
      ? item.name.toLocaleLowerCase().includes(query)
      : item.parentFolderId === folderId);
  }, [folderId, folders, search]);
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (catalog?.files ?? []).filter((item) => scopeKey(item.scope) === scope && (query
      ? item.name.toLocaleLowerCase().includes(query)
      : item.folderId === folderId));
  }, [catalog, folderId, scope, search]);
  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  const pendingCount = files.filter((file) => file.syncStatus === "pending" || file.syncStatus === "error").length;
  const conflictFiles = files.filter((file) => file.syncStatus === "conflict");
  const catalogFileIds = new Set((catalog?.files ?? []).map((file) => file.id));
  const detachedFiles = catalog ? files.filter((file) => !catalogFileIds.has(file.id)) : [];

  async function saveOne(file: OfflineCatalogFile) {
    if (!user) {
      setError("Connect and sign in to download files for offline use.");
      return;
    }
    if (!online) {
      setError("This file is not saved on this device yet. Reconnect to download it.");
      return;
    }
    if (!file.canDownload) {
      setError("Your workspace access does not allow this file to be downloaded.");
      return;
    }
    setError("");
    setProgress({ label: `Saving ${file.name}`, complete: 0, total: 1 });
    try {
      const blob = await apiBlob(downloadPath(file));
      await saveOfflineFile({
        id: file.id,
        userId: user.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: blob.size,
        blob,
        folderId: file.folderId,
        scope: file.scope,
        canEdit: file.canEdit,
        canDownload: file.canDownload,
      });
      setProgress({ label: "Saved for offline use", complete: 1, total: 1 });
      await loadLocal(user.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to save ${file.name} offline.`);
    } finally {
      window.setTimeout(() => setProgress(null), 900);
    }
  }

  async function saveFolder(folderToSave: OfflineFolder) {
    const folderFiles = (catalog?.files ?? []).filter((file) =>
      scopeKey(file.scope) === scope
      && file.folderId
      && folders.some((item) => item.id === file.folderId && isWithinFolder(item, folderToSave.id, folders)));
    const matchingFiles = folderFiles.filter((file) => file.canDownload);
    const unsavedFiles = matchingFiles.filter((file) => !savedById.has(file.id));
    if (!online || !user) {
      setError("Connect and sign in to save this folder’s contents for offline use.");
      return;
    }
    if (!unsavedFiles.length) {
      setError(folderFiles.length && !matchingFiles.length
        ? "Your workspace permissions don’t allow downloading files from this folder."
        : "All downloadable files in this folder are already saved on this device.");
      return;
    }
    setError("");
    setProgress({ label: `Saving ${folderToSave.name}`, complete: 0, total: unsavedFiles.length });
    const failed: string[] = [];
    for (const [index, file] of unsavedFiles.entries()) {
      try {
        const blob = await apiBlob(downloadPath(file));
        await saveOfflineFile({
          id: file.id,
          userId: user.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: blob.size,
          blob,
          folderId: file.folderId,
          scope: file.scope,
          canEdit: file.canEdit,
          canDownload: file.canDownload,
        });
      } catch (reason) {
        failed.push(`${file.name}: ${reason instanceof Error ? reason.message : "download failed"}`);
      }
      setProgress({ label: `Saving ${folderToSave.name}`, complete: index + 1, total: unsavedFiles.length });
    }
    try {
      await loadLocal(user.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved files could not be refreshed.");
    }
    if (failed.length) setError(`Saved ${unsavedFiles.length - failed.length} of ${unsavedFiles.length} files. Could not save: ${failed.slice(0, 2).join("; ")}${failed.length > 2 ? `; and ${failed.length - 2} more` : ""}.`);
    window.setTimeout(() => setProgress(null), 1200);
  }

  async function removeSavedFile(file: OfflineFile) {
    if ((file.syncStatus === "pending" || file.syncStatus === "error" || file.syncStatus === "conflict")
      && !window.confirm("This copy contains unsynced changes. Remove it and discard those changes?")) return;
    try {
      await removeOfflineFile(file.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This offline copy could not be removed.");
    }
  }

  async function updateSelectedFile(updated: OfflineFile) {
    setSelectedFile(updated);
    setCatalog((current) => current ? {
      ...current,
      files: current.files.map((file) => file.id === updated.id ? { ...file, sizeBytes: updated.sizeBytes } : file),
    } : current);
    if (user) {
      await loadLocal(user.id);
      if (navigator.onLine) {
        await syncPendingOfflineFiles(user.id);
        const latest = await getOfflineFile(updated.id);
        if (latest) setSelectedFile(latest);
        await loadLocal(user.id);
      }
    }
  }

  async function useOfflineVersion(file: OfflineFile) {
    if (!window.confirm(`Replace the cloud version of “${file.name}” with your device copy? The cloud copy’s version history may be available.`)) return;
    setError("");
    try {
      await replaceCloudWithOfflineCopy(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The offline version could not be applied.");
    }
  }

  async function retrySync(file: OfflineFile) {
    setError("");
    try {
      await retryOfflineSync(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The offline edit could not be synced.");
    }
  }

  async function keepBoth(file: OfflineFile) {
    try {
      await keepBothVersions(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The two versions could not be kept on this device.");
    }
  }

  if (!authorized && !loading) {
    return <PageShell eyebrow="YOUR LIBRARY" title="Offline access" description="Sign in on this device to use your offline library.">
      <div className="offline-access-empty"><strong>Offline copies are private to the account that saved them.</strong><p>Connect to the internet and sign in to continue.</p></div>
    </PageShell>;
  }

  const selectedScopeName = scope === "personal" ? "Personal library" : workspaces.find((item) => `workspace:${item.id}` === scope)?.name ?? "Workspace";

  return (
    <PageShell eyebrow="YOUR LIBRARY" title="Offline access" description="Browse your library, choose what to keep on this device, and continue working without a connection.">
      <main className="offline-access-page">
        <div className="offline-access-topline">
          <Link className="offline-access-back" to="/files"><ArrowLeft size={14} /> Back to your files</Link>
          <button className="offline-refresh-button" type="button" onClick={() => void refresh()} disabled={!online || !user || refreshing}>
            {refreshing ? <LoaderCircle size={15} className="offline-spin" /> : <RefreshCw size={15} />}
            {refreshing ? "Refreshing…" : "Refresh library"}
          </button>
        </div>

        <section className="offline-access-hero">
          <div className={`offline-access-connectivity${online && user ? " offline-access-online" : ""}`}>
            {online && user ? <Wifi size={19} /> : <WifiOff size={19} />}
            <div><strong>{!online ? "Working offline" : user ? "Connected and ready" : "Local access only"}</strong><span>{!online ? "Only saved document contents can be opened or edited." : user ? "Your library index is up to date when refreshed." : "Sign in with the saved account to refresh and sync."}</span></div>
            <i>{!online ? "DEVICE" : user ? "LIVE" : "SIGN IN"}</i>
          </div>
          <div className="offline-access-meter"><HardDrive size={19} /><div><strong>{formatStorageBytes(totalBytes)} saved</strong><span>{files.length} files stored on this device</span></div><small>{storageUsage?.quota ? `of ${formatStorageBytes(storageUsage.quota)}` : "local copies"}</small></div>
          <div className="offline-queue-meter"><Cloud size={18} /><div><strong>{pendingCount ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} to sync` : "Everything is in sync"}</strong><span>{conflictFiles.length ? `${conflictFiles.length} conflict${conflictFiles.length === 1 ? "" : "s"} need your choice` : "Offline edits are kept safely on this device."}</span></div></div>
        </section>

        <div className="offline-access-note"><FolderDown size={16} /><p>Your library’s names and folders are listed here. File contents download only when you save a file or folder. Choose a folder’s download action to save its downloadable contents, including subfolders.</p></div>
        {error && <p className="offline-access-error" role="alert">{error}</p>}
        {progress && <div className="offline-progress" role="status"><span>{progress.label}</span><span>{progress.complete} / {progress.total}</span><div><i style={{ width: `${progress.total ? progress.complete / progress.total * 100 : 0}%` }} /></div></div>}

        {conflictFiles.length > 0 && (
          <section className="offline-conflicts" aria-label="Offline edit conflicts">
            <div><strong>Choose what to do with changed cloud copies</strong><span>Your edits and the current cloud files are both preserved until you decide.</span></div>
            {conflictFiles.map((file) => (
              <article key={file.id}>
                <FileText size={17} />
                <div><strong>{file.name}</strong><span>{file.syncError ?? "The online file changed after this copy was saved."}</span></div>
                <button className="button button-outline" type="button" disabled={!online || !user} onClick={() => void useOfflineVersion(file)}>Use my copy</button>
                <button className="button button-outline" type="button" onClick={() => void keepBoth(file)}>Keep both</button>
              </article>
            ))}
          </section>
        )}

        <section className="offline-library-panel">
          <div className="offline-library-heading">
            <div><span>DEVICE LIBRARY</span><h2>{selectedScopeName}</h2></div>
            <label className="offline-library-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file or folder" aria-label="Search offline library" /></label>
          </div>
          <div className="offline-scope-tabs" role="tablist" aria-label="Library source">
            <button type="button" role="tab" aria-selected={scope === "personal"} className={scope === "personal" ? "active" : ""} onClick={() => { setScope("personal"); setFolderId(null); }}>Personal files</button>
            {workspaces.map((workspace) => {
              const key = `workspace:${workspace.id}` as const;
              return <button key={workspace.id} type="button" role="tab" aria-selected={scope === key} className={scope === key ? "active" : ""} onClick={() => { setScope(key); setFolderId(null); }}>{workspace.name}</button>;
            })}
          </div>
          <nav className="offline-breadcrumbs" aria-label="Folder path">
            <button type="button" onClick={() => setFolderId(null)}>{scope === "personal" ? "My files" : "Workspace files"}</button>
            {breadcrumbs.map((item) => <span key={item.id}><ChevronRight size={13} /><button type="button" onClick={() => setFolderId(item.id)}>{item.name}</button></span>)}
          </nav>
          {loading && !catalog ? <div className="offline-access-empty"><LoaderCircle size={18} className="offline-spin" />Loading your local library…</div> : (
            <div className="offline-library-list">
              {visibleFolders.map((item) => (
                <article className="offline-library-row offline-folder-row" key={`folder-${scopeKey(item.scope)}-${item.id}`}>
                  <span className="offline-access-file-icon"><Folder size={18} /></span>
                  <button className="offline-library-item-info" type="button" onClick={() => setFolderId(item.id)}>
                    <strong title={item.name}>{item.name}</strong><span>Folder · {item.scope.type === "workspace" ? item.scope.workspaceName : "Personal library"}</span>
                  </button>
                  <button className="offline-row-open" type="button" onClick={() => setFolderId(item.id)}>Open <ChevronRight size={14} /></button>
                  <button className="offline-row-save" type="button" disabled={!online || !user} onClick={() => void saveFolder(item)} title="Save all downloadable files in this folder">
                    <FolderDown size={15} /><span>Save folder offline</span>
                  </button>
                </article>
              ))}
              {visibleFiles.map((item) => {
                const saved = savedById.get(item.id);
                const status = getFileStatus(saved);
                return (
                  <article className="offline-library-row" key={`file-${scopeKey(item.scope)}-${item.id}`}>
                    <span className={`offline-access-file-icon offline-file-type-${fileExtension(item.name)}`}><FileText size={18} /></span>
                    <button className="offline-library-item-info" type="button" disabled={!saved} onClick={() => saved && setSelectedFile(saved)}>
                      <strong title={item.name}>{item.name}</strong><span>{item.mimeType || "Document"} · {formatStorageBytes(item.sizeBytes)} · <em className={`offline-file-status ${status.className}`}>{status.label}</em></span>
                    </button>
                    {saved ? (
                      <>
                        <button className="offline-row-open" type="button" onClick={() => setSelectedFile(saved)}><span>Open</span><ChevronRight size={14} /></button>
                        {saved.syncStatus === "error" && <button className="offline-row-retry" type="button" disabled={!online || !user} onClick={() => void retrySync(saved)}>Retry sync</button>}
                        <button className="offline-row-remove" type="button" onClick={() => void removeSavedFile(saved)} aria-label={`Remove ${item.name} from this device`} title="Remove from this device"><Trash2 size={15} /></button>
                      </>
                    ) : (
                      <button className="offline-row-save" type="button" disabled={!online || !user || !item.canDownload} onClick={() => void saveOne(item)} title={!item.canDownload ? "Your workspace access does not allow downloads" : "Save document on this device"}>
                        <Download size={15} /><span>Save offline</span>
                      </button>
                    )}
                  </article>
                );
              })}
              {!visibleFolders.length && !visibleFiles.length && (
                <div className="offline-access-empty">
                  <span><Search size={19} /></span><strong>{search ? "No matching files or folders" : "Nothing in this folder yet"}</strong>
                  <p>{search ? "Try a different search term." : online ? "Files and folders will appear here after the library refreshes." : "This folder is empty in the last library index saved on this device."}</p>
                </div>
              )}
            </div>
          )}
          {catalog && <p className="offline-library-footnote">Library refreshed {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(catalog.refreshedAt))}. Only file contents marked “Saved on this device” are available offline.</p>}
        </section>

        {detachedFiles.length > 0 && (
          <section className="offline-detached-library" aria-label="Saved copies no longer in the library">
            <div><span>ON THIS DEVICE</span><h2>Saved copies not in the current library</h2><p>These copies are kept locally because they are no longer in the latest online index.</p></div>
            {detachedFiles.map((file) => (
              <article className="offline-library-row" key={`detached-${file.id}`}>
                <span className="offline-access-file-icon"><FileText size={18} /></span>
                <button className="offline-library-item-info" type="button" onClick={() => setSelectedFile(file)}>
                  <strong title={file.name}>{file.name}</strong><span>{file.scope.workspaceName ?? "Personal copy"} · {getFileStatus(file).label}</span>
                </button>
                <button className="offline-row-open" type="button" onClick={() => setSelectedFile(file)}>Open <ChevronRight size={14} /></button>
                <button className="offline-row-remove" type="button" onClick={() => void removeSavedFile(file)} aria-label={`Remove ${file.name} from this device`} title="Remove from this device"><Trash2 size={15} /></button>
              </article>
            ))}
          </section>
        )}

        <p className="offline-access-footnote">Offline copies stay in this browser on this device, are private to your account, and aren’t a backup. Browser storage can be cleared by your device. {storageUsage?.quota ? `Estimated browser storage: ${formatStorageBytes(storageUsage.quota)}.` : ""}</p>
        {selectedFile && <OfflinePreview file={selectedFile} online={online} onClose={() => setSelectedFile(null)} onSaved={updateSelectedFile} />}
      </main>
    </PageShell>
  );
}

function OfflinePreview({ file, online, onClose, onSaved }: { file: OfflineFile; online: boolean; onClose: () => void; onSaved: (file: OfflineFile) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [savedText, setSavedText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canEdit] = useState(file.canEdit);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    if (editableTextFile(file)) {
      void file.blob.text().then((text) => {
        setTextContent(text);
        setSavedText(text);
        setDirty(false);
      });
    }
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf" || fileExtension(file.name) === "pdf";
  const isAudio = file.mimeType.startsWith("audio/");
  const isVideo = file.mimeType.startsWith("video/");

  async function saveText() {
    setSaving(true);
    setError("");
    try {
      const next = await saveOfflineEdit(file.id, new Blob([textContent], { type: file.mimeType || "text/plain" }), "Edited text document offline");
      await onSaved(next);
      setSavedText(textContent);
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The offline edit could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveOffice(updatedBlob: Blob, summary: string) {
    const next = await saveOfflineEdit(file.id, updatedBlob, summary);
    await onSaved(next);
  }

  function requestClose() {
    if (dirty) {
      setError("Save your changes before closing this document.");
      return;
    }
    onClose();
  }

  return (
    <div className="offline-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <section className="offline-preview-dialog" role="dialog" aria-modal="true" aria-label={`Offline document: ${file.name}`}>
        <header>
          <div><strong title={file.name}>{file.name}</strong><span>{file.syncStatus === "pending" ? "Saved on this device · waiting to sync" : file.syncStatus === "conflict" ? "Both copies preserved · sync conflict" : "Saved on this device"} · {formatStorageBytes(file.sizeBytes)}</span></div>
          <div className="offline-preview-header-actions">
            {editableTextFile(file) && canEdit && <button className="offline-preview-save" type="button" onClick={() => void saveText()} disabled={!dirty || saving}><Check size={15} />{saving ? "Saving…" : "Save changes"}</button>}
            <button type="button" onClick={requestClose} aria-label="Close preview"><X size={19} /></button>
          </div>
        </header>
        {error && <p className="offline-access-error" role="alert">{error}</p>}
        <div className="offline-preview-content">
          {!url ? <span>Opening saved copy…</span>
            : officeFile(file) ? <OfficePreviewEditor
              file={file}
              blob={file.blob}
              saveUrl=""
              canEdit={canEdit}
              onDirtyChange={setDirty}
              onSave={saveOffice}
              onSaved={async () => undefined}
            />
              : editableTextFile(file) ? <textarea className="offline-text-editor" aria-label={`Edit ${file.name}`} spellCheck={fileExtension(file.name) === "md"} value={textContent} readOnly={!canEdit} onChange={(event) => { setTextContent(event.target.value); setDirty(event.target.value !== savedText); }} />
                : isImage ? <img src={url} alt={file.name} />
                  : isPdf ? <iframe src={url} title={file.name} />
                    : isAudio ? <audio controls src={url} />
                      : isVideo ? <video controls src={url} />
                        : <div><FileText size={28} /><p>This file is saved on your device, but this browser cannot preview or edit its format.</p><a href={url} download={file.name}>Download saved copy</a></div>}
        </div>
        <footer className="offline-preview-footer">
          <span>{file.syncError ?? (file.canEdit ? "Edits save to this device first and sync when you reconnect." : "You can view this saved copy. Workspace permissions don’t allow editing.")}</span>
          {!online && <span><WifiOff size={13} /> Offline</span>}
        </footer>
      </section>
    </div>
  );
}

export default OfflineAccessPage;
