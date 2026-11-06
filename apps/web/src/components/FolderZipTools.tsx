import { useState } from "react";
import { Archive, Download, FolderOpen, Upload } from "lucide-react";
import { ActionModal, type ActionModalRequest } from "./ActionModal";
import { apiBlob, apiRequest } from "../lib/api";

interface ZipFile {
  id: string;
  name: string;
  sizeBytes: string;
}

interface ZipFolder {
  id: string;
  name: string;
}

interface FolderContents {
  folders: ZipFolder[];
  files: ZipFile[];
}

interface FolderZipToolsProps {
  scopeBase?: string;
  folderId?: string;
  folderName: string;
  file?: ZipFile;
  variant?: "folder" | "file";
  canDownload: boolean;
  canExtract: boolean;
  canCreateFolders: boolean;
  onComplete: () => Promise<void>;
}

const MAX_ARCHIVE_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_CONTENT_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 500;
const MAX_ARCHIVE_ENTRIES = 1000;
const MAX_FOLDER_DEPTH = 20;

function safeArchiveSegment(value: string) {
  const segment = value.replace(/[\\/\0-\x1f]/g, "_").trim();
  return segment && segment !== "." && segment !== ".." ? segment : "unnamed";
}

function archiveEntryPath(entry: { name: string; unsafeOriginalName?: string }) {
  const originalName = entry.unsafeOriginalName ?? entry.name;
  if (
    originalName.startsWith("/") ||
    originalName.startsWith("\\") ||
    /^[a-zA-Z]:/.test(originalName) ||
    originalName.includes("\\") ||
    /[\0-\x1f]/.test(originalName)
  ) {
    throw new Error("This ZIP contains an unsafe file path.");
  }
  const segments = originalName.split("/");
  if (segments.at(-1) === "") segments.pop();
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.length > 255)) {
    throw new Error("This ZIP contains an unsafe or unsupported file path.");
  }
  return segments;
}

function declaredExpandedSize(entry: unknown) {
  if (typeof entry !== "object" || entry === null || !("_data" in entry)) {
    throw new Error("This ZIP entry does not contain valid size information.");
  }
  const data = entry._data;
  if (typeof data !== "object" || data === null || !("uncompressedSize" in data)) {
    throw new Error("This ZIP entry does not contain valid size information.");
  }
  const size = data.uncompressedSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new Error("This ZIP entry has an invalid expanded size.");
  }
  return size;
}

function mimeTypeForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    avi: "video/x-msvideo",
    doc: "application/msword",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    gif: "image/gif",
    heic: "image/heic",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    png: "image/png",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain",
    wav: "audio/wav",
    webp: "image/webp",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return extension ? mimeTypes[extension] ?? "application/octet-stream" : "application/octet-stream";
}

export function FolderZipTools({
  scopeBase = "",
  folderId,
  folderName,
  file,
  variant = "folder",
  canDownload,
  canExtract,
  canCreateFolders,
  onComplete,
}: FolderZipToolsProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [modalRequest, setModalRequest] = useState<ActionModalRequest | null>(null);

  function storagePath(path: string) {
    return `${scopeBase}${path}`;
  }

  async function getContents(id?: string): Promise<FolderContents> {
    const query = id ? `?folderId=${encodeURIComponent(id)}` : "";
    const endpoint = scopeBase
      ? `${scopeBase}/storage${query}`
      : `/files${query}`;
    return apiRequest<FolderContents>(endpoint);
  }

  async function downloadFolderZip() {
    setBusy(true);
    setStatus("Preparing ZIP…");
    try {
      const { default: JSZip } = await import("jszip");
      const archive = new JSZip();
      const visited = new Set<string>();
      let fileCount = 0;
      let folderCount = 0;
      let downloadedBytes = 0;

      async function addFolder(parentId: string | undefined, target: InstanceType<typeof JSZip>, depth: number): Promise<void> {
        if (depth > MAX_FOLDER_DEPTH) throw new Error("This folder is nested too deeply to ZIP.");
        if (parentId) {
          if (visited.has(parentId)) throw new Error("A folder cycle was found while creating the ZIP.");
          visited.add(parentId);
          folderCount += 1;
          if (folderCount + fileCount > MAX_ARCHIVE_ENTRIES) {
            throw new Error(`A ZIP can contain no more than ${MAX_ARCHIVE_ENTRIES} entries.`);
          }
        }
        const contents = await getContents(parentId);
        for (const file of contents.files) {
          fileCount += 1;
          if (fileCount > MAX_ARCHIVE_FILES) {
            throw new Error(`A ZIP can contain no more than ${MAX_ARCHIVE_FILES} files.`);
          }
          if (folderCount + fileCount > MAX_ARCHIVE_ENTRIES) {
            throw new Error(`A ZIP can contain no more than ${MAX_ARCHIVE_ENTRIES} entries.`);
          }
          const expectedSize = Number(file.sizeBytes);
          if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || downloadedBytes + expectedSize > MAX_ARCHIVE_CONTENT_BYTES) {
            throw new Error("This folder is larger than the 100 MB ZIP export limit.");
          }
          const blob = await apiBlob(storagePath(
            scopeBase
              ? `/files/${file.id}/download`
              : `/files/${file.id}/download`,
          ));
          downloadedBytes += blob.size;
          if (downloadedBytes > MAX_ARCHIVE_CONTENT_BYTES) {
            throw new Error("This folder is larger than the 100 MB ZIP export limit.");
          }
          target.file(safeArchiveSegment(file.name), blob);
          setStatus(`Adding ${fileCount} file${fileCount === 1 ? "" : "s"}…`);
        }
        for (const folder of contents.folders) {
          const child = target.folder(safeArchiveSegment(folder.name));
          if (!child) throw new Error(`Could not add folder "${folder.name}" to the ZIP.`);
          await addFolder(folder.id, child, depth + 1);
        }
      }

      await addFolder(folderId, archive, 0);
      const blob = await archive.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } },
        (metadata) => setStatus(`Compressing ZIP… ${Math.round(metadata.percent)}%`),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeArchiveSegment(folderName)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setStatus(`ZIP ready: ${fileCount} file${fileCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create this ZIP.");
    } finally {
      setBusy(false);
    }
  }

  async function extractArchive(file: File) {
    if (file.size > MAX_ARCHIVE_INPUT_BYTES) {
      throw new Error("ZIP files must be 25 MB or smaller.");
    }
    const { default: JSZip } = await import("jszip");
    const archive = await JSZip.loadAsync(file);
    const entries = Object.values(archive.files);
    if (entries.length > MAX_ARCHIVE_ENTRIES) {
      throw new Error(`A ZIP can contain no more than ${MAX_ARCHIVE_ENTRIES} entries.`);
    }
    const files = entries.filter((entry) => !entry.dir);
    if (files.length > MAX_ARCHIVE_FILES) {
      throw new Error(`A ZIP can contain no more than ${MAX_ARCHIVE_FILES} files.`);
    }

    let expandedBytes = 0;
    const validatedFiles = files.map((entry) => {
      const segments = archiveEntryPath(entry);
      if (segments.length > MAX_FOLDER_DEPTH + 1) {
        throw new Error("This ZIP contains a folder path that is too deeply nested.");
      }
      const size = declaredExpandedSize(entry);
      const ignored = segments.includes("__MACOSX") || segments.at(-1) === ".DS_Store";
      if (!ignored && (size > MAX_ARCHIVE_CONTENT_BYTES || expandedBytes + size > MAX_ARCHIVE_CONTENT_BYTES)) {
        throw new Error("This ZIP expands beyond the 100 MB extraction limit.");
      }
      if (!ignored) expandedBytes += size;
      if (typeof entry.unixPermissions === "number" && (entry.unixPermissions & 0o170000) === 0o120000) {
        throw new Error("This ZIP contains a symbolic link, which cannot be extracted.");
      }
      return { entry, segments, size, ignored };
    }).filter(({ ignored }) => !ignored);
    const hasNestedEntries = validatedFiles.some(({ segments }) => segments.length > 1) ||
      entries.some((entry) => entry.dir && archiveEntryPath(entry).length > 1);
    if (hasNestedEntries && !canCreateFolders) {
      throw new Error("You need permission to create subfolders to extract this nested ZIP.");
    }

    const folderIds = new Map<string, string | undefined>([["", folderId]]);
    const contentsCache = new Map<string, FolderContents>();
    let foldersCreated = false;
    async function contentsAt(id?: string) {
      const key = id ?? "";
      let contents = contentsCache.get(key);
      if (!contents) {
        contents = await getContents(id);
        contentsCache.set(key, contents);
      }
      return contents;
    }

    async function ensureFolder(segments: string[]) {
      let parentId = folderId;
      let path = "";
      for (const segment of segments) {
        if (segment.length > 120) throw new Error("A folder name in this ZIP exceeds 120 characters.");
        path = path ? `${path}/${segment}` : segment;
        const cachedId = folderIds.get(path);
        if (cachedId !== undefined || folderIds.has(path)) {
          parentId = cachedId;
          continue;
        }
        const contents = await contentsAt(parentId);
        const existing = contents.folders.find((folder) => folder.name === segment);
        if (existing) {
          parentId = existing.id;
        } else {
          const parentKey = parentId ?? "";
          const body = JSON.stringify({ name: segment, ...(parentId ? { parentFolderId: parentId } : {}) });
          const endpoint = scopeBase
            ? `${scopeBase}/folders`
            : "/folders";
          const created = await apiRequest<ZipFolder>(endpoint, { method: "POST", body });
          parentId = created.id;
          contentsCache.delete(parentKey);
          foldersCreated = true;
        }
        folderIds.set(path, parentId);
      }
      return parentId;
    }
    let completed = 0;
    const failures: string[] = [];
    for (const entry of entries.filter((item) => item.dir)) {
      try {
        const segments = archiveEntryPath(entry);
        if (segments.includes("__MACOSX") || segments.at(-1) === ".DS_Store") continue;
        if (segments.length > MAX_FOLDER_DEPTH) {
          throw new Error("This ZIP contains a folder path that is too deeply nested.");
        }
        await ensureFolder(segments);
      } catch (error) {
        failures.push(`${entry.name}: ${error instanceof Error ? error.message : "folder creation failed"}`);
      }
    }
    for (const { entry, segments, size } of validatedFiles) {
      const name = segments.at(-1);
      if (!name) continue;
      try {
        const parentId = await ensureFolder(segments.slice(0, -1));
        if (size > MAX_ARCHIVE_INPUT_BYTES) {
          throw new Error(`${name} exceeds the 25 MB per-file upload limit.`);
        }
        const blob = await entry.async("blob");
        const body = new FormData();
        body.append("file", new File([blob], name, { type: mimeTypeForName(name) }));
        if (parentId) body.append("folderId", parentId);
        const endpoint = scopeBase ? `${scopeBase}/files` : "/files";
        await apiRequest(endpoint, { method: "POST", body });
        completed += 1;
      } catch (error) {
        failures.push(`${name}: ${error instanceof Error ? error.message : "upload failed"}`);
      }
      setStatus(`Extracting ${completed + failures.length} of ${validatedFiles.length} file${validatedFiles.length === 1 ? "" : "s"}…`);
    }

    if (completed || foldersCreated) await onComplete();
    if (failures.length) {
      const sample = failures.slice(0, 3).join(" ");
      setStatus(`Extracted ${completed} file${completed === 1 ? "" : "s"}; ${failures.length} failed. ${sample}${failures.length > 3 ? " …" : ""}`);
    } else {
      setStatus(`Extracted ${completed} file${completed === 1 ? "" : "s"}.`);
    }
  }

  async function zipStoredFile() {
    if (!file) return;
    setBusy(true);
    setStatus("Preparing ZIP…");
    try {
      const { default: JSZip } = await import("jszip");
      const source = await apiBlob(storagePath(`/files/${file.id}/download`));
      const archive = new JSZip();
      archive.file(safeArchiveSegment(file.name), source);
      const blob = await archive.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 3 } },
        (metadata) => setStatus(`Compressing ZIP… ${Math.round(metadata.percent)}%`),
      );
      if (blob.size > MAX_ARCHIVE_INPUT_BYTES) {
        throw new Error("The ZIP exceeds the 25 MB per-file upload limit.");
      }

      const contents = await getContents(folderId);
      const existingNames = new Set(contents.files.map((item) => item.name.toLowerCase()));
      const baseName = `${file.name}.zip`;
      let archiveName = baseName;
      let suffix = 2;
      while (existingNames.has(archiveName.toLowerCase())) {
        archiveName = `${file.name} (${suffix}).zip`;
        suffix += 1;
      }
      const body = new FormData();
      body.append("file", new File([blob], archiveName, { type: "application/zip" }));
      if (folderId) body.append("folderId", folderId);
      const endpoint = scopeBase ? `${scopeBase}/files` : "/files";
      await apiRequest(endpoint, { method: "POST", body });
      await onComplete();
      setStatus(`Created ${archiveName}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to ZIP this file.");
    } finally {
      setBusy(false);
    }
  }

  function requestStoredFileExtraction() {
    if (!file) return;
    const sourceFile = file;
    setModalRequest({
      title: "Extract ZIP file",
      description: `Extract “${sourceFile.name}” into ${folderName}. Files are uploaded individually, so quota or permission errors may result in a partial extraction.`,
      confirmLabel: "Extract files",
      onConfirm: async () => {
        setBusy(true);
        setStatus("Reading ZIP…");
        try {
          const blob = await apiBlob(storagePath(`/files/${sourceFile.id}/download`));
          await extractArchive(new File([blob], sourceFile.name, { type: "application/zip" }));
          setModalRequest(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to extract this ZIP.";
          setStatus(message);
          throw error;
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function requestExtraction(file: File) {
    const archiveFile = file;
    setModalRequest({
      title: "Extract ZIP file",
      description: `Extract “${file.name}” into ${folderName}. Files will be uploaded individually, so any quota or permission errors may result in a partial extraction.`,
      confirmLabel: "Extract files",
      onConfirm: async () => {
        setBusy(true);
        setStatus("Reading ZIP…");
        try {
          await extractArchive(archiveFile);
          setModalRequest(null);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Unable to extract this ZIP.");
          throw error;
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <div className={`folder-zip-tools ${variant === "file" ? "folder-zip-tools-file" : ""}`}>
      {variant === "file" && file && canDownload && canExtract && !file.name.toLowerCase().endsWith(".zip") && (
        <button className="zip-row-button" type="button" aria-label={`Create ZIP from ${file.name}`} title="Create ZIP in this folder" disabled={busy} onClick={() => void zipStoredFile()}>
          <Archive size={15} />
        </button>
      )}
      {variant === "file" && file && canDownload && canExtract && file.name.toLowerCase().endsWith(".zip") && (
        <button className="zip-row-button" type="button" aria-label={`Extract ${file.name}`} title="Extract ZIP in this folder" disabled={busy} onClick={requestStoredFileExtraction}>
          <FolderOpen size={15} />
        </button>
      )}
      {variant === "folder" && canDownload && (
        <button className="button button-outline button-small" type="button" disabled={busy} onClick={() => void downloadFolderZip()}>
          <Download size={14} />{busy ? "Working…" : "Download ZIP"}
        </button>
      )}
      {variant === "folder" && canExtract && (
        <label className={`button button-outline button-small zip-upload-button ${busy ? "button-disabled" : ""}`}>
          <Archive size={14} />Extract ZIP<Upload size={13} />
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) requestExtraction(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
      {status && <span className={`folder-zip-status ${variant === "file" ? "folder-zip-row-status" : ""}`} role="status">{status}</span>}
      {modalRequest && <ActionModal request={modalRequest} onClose={() => setModalRequest(null)} />}
    </div>
  );
}
