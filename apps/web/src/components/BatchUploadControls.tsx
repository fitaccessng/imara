import { useEffect, useRef, useState } from "react";
import { FolderUp, Upload } from "lucide-react";

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
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    directoryInput.current?.setAttribute("webkitdirectory", "");
    directoryInput.current?.setAttribute("directory", "");
  }, []);

  async function processFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (files.length > MAX_BATCH_FILES) {
      setFailures([`Choose no more than ${MAX_BATCH_FILES} files at a time.`]);
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
    setProgress("");
    setUploaded(0);
    setFailures([]);
    let completed = 0;
    const errors: string[] = [];
    const childrenByParent = new Map<string, Map<string, string>>();

    async function ensureFolder(name: string, parentFolderId?: string) {
      const cacheKey = parentFolderId ?? "root";
      let children = childrenByParent.get(cacheKey);
      if (!children) {
        const folders = await getFolders(parentFolderId);
        children = new Map(folders.map((folder) => [folder.name.toLocaleLowerCase(), folder.id]));
        childrenByParent.set(cacheKey, children);
      }
      const existingId = children.get(name.toLocaleLowerCase());
      if (existingId) return existingId;
      const created = await createFolder(name, parentFolderId);
      children.set(name.toLocaleLowerCase(), created.id);
      return created.id;
    }

    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        try {
          let destinationFolderId = rootFolderId;
          for (const segment of directorySegments(file)) {
            destinationFolderId = await ensureFolder(segment, destinationFolderId);
          }
          await uploadFile(file, destinationFolderId);
          completed += 1;
          setUploaded(completed);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Upload failed.";
          errors.push(`${file.name}: ${message}`);
          setFailures([...errors]);
        }
      }
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
    {(progress || failures.length > 0) && <div className="batch-upload-status" role={failures.length ? "alert" : "status"} aria-live="polite">
      {progress && <p>{progress}{busy && uploaded ? ` · ${uploaded} complete` : ""}</p>}
      {failures.length > 0 && <ul>{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
    </div>}
  </div>;
}
