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
  getFolders: (parentFolderId?: string) => Promise<FolderReference[]>;
  createFolder: (name: string, parentFolderId?: string) => Promise<FolderReference>;
  uploadFile: (file: File, folderId?: string) => Promise<unknown>;
  onComplete: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

const MAX_BATCH_FILES = 250;
const UPLOAD_CONCURRENCY = 4;

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
  getFolders,
  createFolder,
  uploadFile,
  onComplete,
  onBusyChange,
}: BatchUploadControlsProps) {
  const directoryInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploaded, setUploaded] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [batchSize, setBatchSize] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function uploadWithReservationRetry(file: File, folderId?: string) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await uploadFile(file, folderId);
        return;
      } catch (error) {
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
    if (files.length > MAX_BATCH_FILES) {
      setFailures([`Choose no more than ${MAX_BATCH_FILES} files at a time.`]);
      setProgress("");
      setDialogOpen(true);
      return;
    }

    setBusy(true);
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

    async function ensureFolder(name: string, parentFolderId?: string) {
      const cacheKey = parentFolderId ?? "root";
      let children = childrenByParent.get(cacheKey);
      if (!children) {
        let folderLoad = folderLoads.get(cacheKey);
        if (!folderLoad) {
          folderLoad = getFolders(parentFolderId).then((folders) =>
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
        folderCreation = createFolder(name, parentFolderId).then((created) => {
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
        while (nextIndex < files.length) {
          const index = nextIndex;
          nextIndex += 1;
          const file = files[index];
          try {
            let destinationFolderId = rootFolderId;
            for (const segment of directorySegments(file)) {
              destinationFolderId = await ensureFolder(segment, destinationFolderId);
            }
            await uploadWithReservationRetry(file, destinationFolderId);
            completed += 1;
            setUploaded(completed);
          } catch (reason) {
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
      setProgress(`Uploaded ${completed} of ${files.length} file${files.length === 1 ? "" : "s"}.`);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const isDisabled = disabled || busy;
  return <div className="batch-upload-controls">
    <label className={`button button-outline batch-upload-button ${isDisabled ? "button-disabled" : ""}`}>
      <Upload size={15} />{busy ? "Uploading…" : "Upload files"}
      <input type="file" multiple disabled={isDisabled} onChange={(event) => {
        void processFiles(event.currentTarget.files);
        event.currentTarget.value = "";
      }} />
    </label>
    <label className={`button button-outline batch-upload-button ${isDisabled || !canCreateFolders ? "button-disabled" : ""}`} title={!canCreateFolders ? "You need permission to create folders here." : "Upload a folder and preserve its subfolders"}>
      <FolderUp size={15} />Upload folder
      <input ref={directoryInput} type="file" multiple disabled={isDisabled || !canCreateFolders} onChange={(event) => {
        void processFiles(event.currentTarget.files);
        event.currentTarget.value = "";
      }} />
    </label>
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
          {busy ? `Working through ${batchSize} selected file${batchSize === 1 ? "" : "s"}. You can keep this window open while they transfer.` : progress}
        </p>
        <div className="upload-progress-meter" role="progressbar" aria-label="Files processed" aria-valuemin={0} aria-valuemax={batchSize} aria-valuenow={processed}>
          <span style={{ width: `${batchSize ? (processed / batchSize) * 100 : 0}%` }} />
        </div>
        <div className="upload-progress-count"><strong>{busy ? processed : uploaded} of {batchSize}</strong><span>{busy ? "files processed" : "files uploaded"}</span></div>
        {failures.length > 0 && <div className="upload-progress-errors" role="alert" aria-label="Upload errors">
          <strong>{failures.length} {failures.length === 1 ? "file could" : "files could"} not be uploaded</strong>
          <ul>{failures.map((failure, index) => <li key={`${failure}-${index}`}>{failure}</li>)}</ul>
        </div>}
        {!busy && <button className="button button-dark upload-progress-done" type="button" onClick={() => setDialogOpen(false)}>Done</button>}
      </section>
    </div>}
  </div>;
}
