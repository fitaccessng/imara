import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FolderUp, LoaderCircle, Upload, X } from "lucide-react";

interface FolderReference {
  id: string;
  name: string;
}

interface BatchUploadControlsProps {
  disabled?: boolean;
  canCreateFolders: boolean;
  rootFolderId?: string;
  maxFileSizeBytes: number;
  getFolders: (parentFolderId?: string, signal?: AbortSignal) => Promise<FolderReference[]>;
  createFolder: (name: string, parentFolderId?: string, signal?: AbortSignal) => Promise<FolderReference>;
  uploadFile: (file: File, folderId?: string, signal?: AbortSignal) => Promise<unknown>;
  onComplete: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

const MAX_BATCH_FILES = 250;
const UPLOAD_CONCURRENCY = 4;

function formatBytes(bytes: number) {
  const mebibytes = bytes / 1024 ** 2;
  return `${Number.isInteger(mebibytes) ? mebibytes : mebibytes.toFixed(1)} MiB`;
}

function directorySegments(file: File) {
  const path = file.webkitRelativePath;
  if (!path) return [];
  const segments = path.split("/");
  if (segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === ".." || /[\u0000-\u001f\u007f\\]/.test(segment))) {
    throw new Error("A selected file has an invalid folder path.");
  }
  return segments.slice(0, -1);
}

export function BatchUploadControls({
  disabled = false,
  canCreateFolders,
  rootFolderId,
  maxFileSizeBytes,
  getFolders,
  createFolder,
  uploadFile,
  onComplete,
  onBusyChange,
}: BatchUploadControlsProps) {
  const directoryInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploaded, setUploaded] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [batchSize, setBatchSize] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  useEffect(() => () => abortController.current?.abort(), []);

  async function uploadWithReservationRetry(file: File, folderId: string | undefined, signal: AbortSignal) {
    for (let attempt = 0; ; attempt += 1) {
      if (signal.aborted) throw new DOMException("Upload cancelled.", "AbortError");
      try {
        await uploadFile(file, folderId, signal);
        return;
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        const reservationBusy = error instanceof Error && error.message === "Storage is busy. Please retry the upload.";
        if (!reservationBusy || attempt >= 3) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 80 * (attempt + 1) + Math.random() * 60));
      }
    }
  }

  useEffect(() => {
    directoryInput.current?.setAttribute("webkitdirectory", "");
    directoryInput.current?.setAttribute("directory", "");
  }, []);

  async function processFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setBatchSize(files.length);
    const oversizedFiles = files.filter((file) => file.size > maxFileSizeBytes);
    if (oversizedFiles.length) {
      const firstFile = oversizedFiles[0];
      setFailures([
        `${firstFile.name} is ${formatBytes(firstFile.size)}. Your plan allows uploads up to ${formatBytes(maxFileSizeBytes)} per file. Upgrade your plan to upload larger files.`,
        ...(oversizedFiles.length > 1 ? [`${oversizedFiles.length - 1} other selected file${oversizedFiles.length === 2 ? "" : "s"} also exceed the limit.`] : []),
      ]);
      setProgress("No files were uploaded.");
      setDialogOpen(true);
      return;
    }
    if (files.length > MAX_BATCH_FILES) {
      setFailures([`Choose no more than ${MAX_BATCH_FILES} files at a time.`]);
      setProgress("");
      setDialogOpen(true);
      return;
    }

    setBusy(true);
    setCancelling(false);
    const controller = new AbortController();
    abortController.current = controller;
    onBusyChange?.(true);
    setProgress("");
    setUploaded(0);
    setProcessed(0);
    setFailures([]);
    setDialogOpen(true);
    let completed = 0;
    let finished = 0;
    let nextIndex = 0;
    const errors: string[] = [];
    const childrenByParent = new Map<string, Map<string, string>>();
    const folderLoads = new Map<string, Promise<Map<string, string>>>();
    const folderCreations = new Map<string, Promise<string>>();

    async function ensureFolder(name: string, parentFolderId: string | undefined, signal: AbortSignal) {
      if (signal.aborted) throw new DOMException("Upload cancelled.", "AbortError");
      const cacheKey = parentFolderId ?? "root";
      let children = childrenByParent.get(cacheKey);
      if (!children) {
        let folderLoad = folderLoads.get(cacheKey);
        if (!folderLoad) {
          folderLoad = getFolders(parentFolderId, signal).then((folders) =>
            new Map(folders.map((folder) => [folder.name.toLocaleLowerCase(), folder.id])),
          );
          folderLoads.set(cacheKey, folderLoad);
        }
        children = await folderLoad;
        childrenByParent.set(cacheKey, children);
      }
      const normalizedName = name.toLocaleLowerCase();
      const existingId = children.get(normalizedName);
      if (existingId) return existingId;
      const creationKey = `${cacheKey}\u0000${normalizedName}`;
      let folderCreation = folderCreations.get(creationKey);
      if (!folderCreation) {
        folderCreation = createFolder(name, parentFolderId, signal).then((created) => {
          children?.set(normalizedName, created.id);
          return created.id;
        }).finally(() => folderCreations.delete(creationKey));
        folderCreations.set(creationKey, folderCreation);
      }
      return folderCreation;
    }

    try {
      setProgress(`Uploading ${files.length} files…`);
      async function uploadNextFile() {
        while (nextIndex < files.length && !controller.signal.aborted) {
          const index = nextIndex;
          nextIndex += 1;
          const file = files[index];
          try {
            let destinationFolderId = rootFolderId;
            for (const segment of directorySegments(file)) {
              destinationFolderId = await ensureFolder(segment, destinationFolderId, controller.signal);
              if (controller.signal.aborted) break;
            }
            if (controller.signal.aborted) continue;
            await uploadWithReservationRetry(file, destinationFolderId, controller.signal);
            completed += 1;
            setUploaded(completed);
          } catch (reason) {
            if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) continue;
            const message = reason instanceof Error ? reason.message : "Upload failed.";
            errors.push(`${file.name}: ${message}`);
            setFailures([...errors]);
          } finally {
            finished += 1;
            setProcessed(finished);
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => uploadNextFile()),
      );
      if (completed) {
        try {
          await onComplete();
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "The file list could not be refreshed.";
          errors.push(`Upload completed, but the library could not refresh: ${message}`);
        }
      }
      setFailures(errors);
      setProgress(controller.signal.aborted
        ? `Upload cancelled. ${completed} file${completed === 1 ? "" : "s"} uploaded before cancellation.`
        : `Uploaded ${completed} of ${files.length} file${files.length === 1 ? "" : "s"}.`);
    } finally {
      abortController.current = null;
      setCancelling(false);
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function cancelUploads() {
    if (!abortController.current) return;
    setCancelling(true);
    abortController.current.abort();
  }

  const isDisabled = disabled || busy;
  return <div className="batch-upload-controls">
    <button className={`button button-outline batch-upload-button ${isDisabled ? "button-disabled" : ""}`} type="button" disabled={isDisabled} onClick={() => filesInput.current?.click()}>
      <Upload size={15} />{busy ? "Uploading…" : "Import files"}
    </button>
    <input ref={filesInput} className="batch-upload-hidden-input" type="file" multiple disabled={isDisabled} onChange={(event) => {
        void processFiles(event.currentTarget.files);
        event.currentTarget.value = "";
      }} />
    <label className={`button button-outline batch-upload-button ${isDisabled || !canCreateFolders ? "button-disabled" : ""}`} title={!canCreateFolders ? "You need permission to create folders here." : "Upload a folder and preserve its subfolders"}>
      <FolderUp size={15} />Import folder
      <input ref={directoryInput} type="file" multiple disabled={isDisabled || !canCreateFolders} onChange={(event) => {
        void processFiles(event.currentTarget.files);
        event.currentTarget.value = "";
      }} />
    </label>
    <div
      className={`batch-upload-drop-target${draggingFiles ? " is-dragging" : ""}${isDisabled ? " is-disabled" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!isDisabled) setDraggingFiles(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDraggingFiles(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingFiles(false);
        if (!isDisabled) void processFiles(event.dataTransfer.files);
      }}
      aria-live="polite"
    >
      {draggingFiles ? "Drop to import" : "or drop files here"}
    </div>
    {progress && !dialogOpen && <p className="batch-upload-inline-status" role={failures.length ? "alert" : "status"}>{progress}</p>}
    {dialogOpen && <div className="upload-progress-backdrop">
      <section className="upload-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-progress-title" aria-describedby="upload-progress-description">
        <button className="upload-progress-close" type="button" aria-label="Close upload details" onClick={() => setDialogOpen(false)} disabled={busy}><X size={18} /></button>
        <div className={`upload-progress-icon ${busy ? "is-uploading" : failures.length ? "has-errors" : "is-complete"}`}>
          {busy ? <LoaderCircle size={25} aria-hidden="true" /> : failures.length ? <AlertCircle size={24} aria-hidden="true" /> : <CheckCircle2 size={24} aria-hidden="true" />}
        </div>
        <span className="eyebrow">{busy ? "FILE TRANSFER" : failures.length ? "UPLOAD ATTENTION" : "UPLOAD COMPLETE"}</span>
        <h2 id="upload-progress-title">{busy ? "Uploading your files" : failures.length ? "Some files need attention" : "Your files are ready"}</h2>
        <p id="upload-progress-description" className="upload-progress-description">
          {busy ? cancelling ? "Cancelling active transfers. Files already uploaded will remain in your library." : `Uploading up to ${UPLOAD_CONCURRENCY} files at a time. Files already uploaded will remain in your library.` : progress}
        </p>
        <div className="upload-progress-meter" role="progressbar" aria-label="Files processed" aria-valuemin={0} aria-valuemax={batchSize} aria-valuenow={processed}>
          <span style={{ width: `${batchSize ? (processed / batchSize) * 100 : 0}%` }} />
        </div>
        <div className="upload-progress-count"><strong>{busy ? processed : uploaded} of {batchSize}</strong><span>{busy ? "files processed" : "files uploaded"}</span></div>
        {failures.length > 0 && <div className="upload-progress-errors" role="alert" aria-label="Upload errors">
          <strong>{failures.length} {failures.length === 1 ? "file could" : "files could"} not be uploaded</strong>
          <ul>{failures.map((failure, index) => <li key={`${failure}-${index}`}>{failure}</li>)}</ul>
        </div>}
        {busy
          ? <button className="button button-outline upload-progress-done" type="button" onClick={cancelUploads} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel uploads"}</button>
          : <button className="button button-dark upload-progress-done" type="button" onClick={() => setDialogOpen(false)}>Done</button>}
      </section>
    </div>}
  </div>;
}
