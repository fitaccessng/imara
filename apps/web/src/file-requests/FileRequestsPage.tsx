import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Clipboard, FileAudio2, FileImage, FileText, Folder, FolderUp, Link2, LoaderCircle, Mail, MailPlus, ShieldCheck, Upload, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest, type UserFolder } from "../lib/api";
import { BrandIdentity } from "../components/BrandLockup";

interface FileRequest {
  id: string;
  title: string;
  message?: string | null;
  token?: string;
  linkPath?: string;
  createdAt: string;
  destinationFolderId: string | null;
  destinationFolderName: string | null;
  uploadCount?: number;
  revokedAt?: string | null;
  active?: boolean;
}

interface PublicFileRequest {
  title: string;
  message: string | null;
  ownerName: string;
  destinationFolderName: string | null;
  maxUploadBytes: string;
  active: boolean;
}

interface UploadFailure {
  name: string;
  message: string;
}

function requestLink(token: string) {
  return `${window.location.origin}/request/${encodeURIComponent(token)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1);
  const amount = bytes / 1024 ** (index + 1);
  return `${amount >= 10 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

function fileKind(file: File) {
  if (file.type.startsWith("image/")) return <FileImage size={17} />;
  if (file.type.startsWith("video/")) return <Video size={17} />;
  if (file.type.startsWith("audio/")) return <FileAudio2 size={17} />;
  return <FileText size={17} />;
}

export function FileRequestsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [destinationFolderId, setDestinationFolderId] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedRequest, setCopiedRequest] = useState("");
  const [copyError, setCopyError] = useState("");
  const [freshLinks, setFreshLinks] = useState<Array<{ id: string; title: string; url: string }>>([]);

  const requestsQuery = useQuery({
    queryKey: ["file-requests"],
    queryFn: () => apiRequest<FileRequest[]>("/file-requests"),
  });
  const foldersQuery = useQuery({
    queryKey: ["personal-folder-tree"],
    queryFn: () => apiRequest<UserFolder[]>("/folders/tree"),
  });
  const orderedFolders = useMemo(() => (foldersQuery.data ?? [])
    .map((folder) => {
      let depth = 0;
      let parentId = folder.parentFolderId;
      while (parentId && depth < 20) {
        depth += 1;
        parentId = foldersQuery.data?.find((parent) => parent.id === parentId)?.parentFolderId ?? null;
      }
      return { folder, depth };
    })
    .sort((left, right) => left.folder.name.localeCompare(right.folder.name)), [foldersQuery.data]);

  const createRequest = useMutation({
    mutationFn: () => apiRequest<FileRequest>("/file-requests", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        ...(destinationFolderId ? { destinationFolderId } : {}),
      }),
    }),
    onSuccess: async (created) => {
      setTitle("");
      setDestinationFolderId("");
      setFormError("");
      setNotice("Your upload link is ready to share.");
      await queryClient.invalidateQueries({ queryKey: ["file-requests"] });
      const url = created.linkPath
        ? new URL(created.linkPath, window.location.origin).toString()
        : created.token
          ? requestLink(created.token)
          : "";
      if (url) {
        setFreshLinks((links) => [{ id: created.id, title: created.title, url }, ...links.filter((link) => link.id !== created.id)]);
        try {
          await navigator.clipboard.writeText(url);
          setCopiedRequest(created.id);
        } catch {
          setCopyError("The link was created but couldn’t be copied automatically. Copy it from the secure link card below.");
        }
      }
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to create the upload link."),
  });
  const revokeRequest = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/file-requests/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      setNotice("The upload link has been turned off.");
      await queryClient.invalidateQueries({ queryKey: ["file-requests"] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to turn off this link."),
  });

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setCopyError("");
    setNotice("");
    if (!title.trim()) {
      setFormError("Give this request a short title so people know what to send.");
      return;
    }
    await createRequest.mutateAsync().catch(() => undefined);
  }

  async function copyLink(request: FileRequest) {
    setCopyError("");
    try {
      if (!request.token) {
        setCopyError("This secure link is only available when first created. Turn it off and create a replacement if you’ve lost it.");
        return;
      }
      await navigator.clipboard.writeText(requestLink(request.token));
      setCopiedRequest(request.id);
    } catch {
      setCopyError("Couldn’t copy the link. Check your browser clipboard permissions and try again.");
    }
  }

  async function copyCreatedLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRequest(id);
      setCopyError("");
    } catch {
      setCopyError("Couldn’t copy the link. Copy the address shown in the card.");
    }
  }

  return (
    <main className="file-requests-page">
      <header className="file-requests-heading">
        <div>
          <span className="eyebrow">COLLECT FILES</span>
          <h1>Request files<span className="heading-period">.</span></h1>
          <p>One link for anyone to send you the files you need—no account required for them.</p>
        </div>
        <div className="file-requests-heading-mark"><MailPlus size={23} /></div>
      </header>

      <section className="file-request-create">
        <div className="file-request-create-copy">
          <span className="file-request-step">01 / NEW REQUEST</span>
          <h2>What are you collecting?</h2>
          <p>Create a secure upload link. Choose a destination folder now, or keep uploads in your main library.</p>
        </div>
        <form className="file-request-form" onSubmit={(event) => void submitCreate(event)}>
          <label>
            <span>Request title</span>
            <input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Photos from the graduation" required />
          </label>
          <label>
            <span>Save uploads to <small>OPTIONAL</small></span>
            <select value={destinationFolderId} onChange={(event) => setDestinationFolderId(event.target.value)} disabled={foldersQuery.isLoading}>
              <option value="">Your main files</option>
              {orderedFolders.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>{`${"— ".repeat(depth)}${folder.name}`}</option>
              ))}
            </select>
          </label>
          {formError && <p className="file-request-error" role="alert">{formError}</p>}
          {copyError && <p className="file-request-error" role="alert">{copyError}</p>}
          {notice && <p className="file-request-notice" role="status">{notice}</p>}
          {foldersQuery.isError && <p className="file-request-error" role="status">Your folders couldn’t be loaded. You can still create a request in your main files.</p>}
          <button className="button button-green file-request-create-button" type="submit" disabled={createRequest.isPending}>
            {createRequest.isPending ? <LoaderCircle className="file-request-spin" size={16} /> : <Link2 size={16} />}
            {createRequest.isPending ? "Making your link…" : "Create upload link"}
          </button>
        </form>
      </section>

      {freshLinks.length > 0 && (
        <section className="file-request-fresh-links" aria-label="Newly created secure links">
          <div className="file-request-fresh-heading"><Check size={17} /><div><strong>Link ready to send</strong><span>Keep this secure link. It’s only shown when first created.</span></div></div>
          {freshLinks.map((link) => (
            <div className="file-request-fresh-link" key={link.id}>
              <div><strong>{link.title}</strong><a href={link.url} target="_blank" rel="noreferrer">{link.url}</a></div>
              <div className="file-request-fresh-actions">
                <a href={`mailto:?subject=${encodeURIComponent(`Files requested: ${link.title}`)}&body=${encodeURIComponent(`Please upload the requested files here:\n${link.url}`)}`}><Mail size={14} />Email</a>
                <button type="button" onClick={() => void copyCreatedLink(link.id, link.url)}>{copiedRequest === link.id ? <Check size={15} /> : <Clipboard size={15} />}{copiedRequest === link.id ? "Copied" : "Copy"}</button>
              </div>
            </div>
          ))}
          {copyError && <p className="file-request-error" role="alert">{copyError}</p>}
        </section>
      )}

      <section className="file-request-trust" aria-label="Upload link features">
        <div><ShieldCheck size={17} /><span><strong>Private by design</strong> Upload links only allow adding files.</span></div>
        <div><FolderUp size={17} /><span><strong>Files or folders</strong> Recipients can send any file type or a whole folder.</span></div>
        <div><ArrowUpRight size={17} /><span><strong>Easy to share</strong> Send the link by email, chat, or anywhere else.</span></div>
      </section>

      <section className="file-request-list-section">
        <div className="file-request-list-heading">
          <div><span className="file-request-step">YOUR LINKS</span><h2>Active requests</h2></div>
          <span>{requestsQuery.data?.filter((item) => item.active ?? !item.revokedAt).length ?? 0} active</span>
        </div>
        {requestsQuery.isLoading ? (
          <div className="file-request-empty"><LoaderCircle className="file-request-spin" size={20} /><span>Loading your requests…</span></div>
        ) : requestsQuery.isError ? (
          <div className="file-request-empty" role="alert">Your requests couldn’t be loaded. Refresh the page to try again.</div>
        ) : requestsQuery.data?.length ? (
          <div className="file-request-list">
            {requestsQuery.data.map((request) => (
              <article className={`file-request-row${request.revokedAt ? " file-request-row-revoked" : ""}`} key={request.id}>
                <div className="file-request-row-icon"><Folder size={18} /></div>
                <div className="file-request-row-main">
                  <strong>{request.title}</strong>
                  <span>{request.destinationFolderName ? `Saves to ${request.destinationFolderName}` : "Saves to your main files"} · {request.uploadCount} {request.uploadCount === 1 ? "upload" : "uploads"}</span>
                  {request.revokedAt && <small>LINK TURNED OFF</small>}
                </div>
                <div className="file-request-row-actions">
                  {!request.revokedAt && <>
                    {request.token && <>
                      <a className="file-request-open-link" href={requestLink(request.token)} target="_blank" rel="noreferrer" aria-label={`Open ${request.title} upload page`}><ArrowUpRight size={15} /></a>
                      <button className="file-request-copy" type="button" onClick={() => void copyLink(request)}>
                        {copiedRequest === request.id ? <Check size={15} /> : <Clipboard size={15} />}
                        {copiedRequest === request.id ? "Copied" : "Copy link"}
                      </button>
                    </>}
                    <button className="file-request-revoke" type="button" disabled={revokeRequest.isPending} onClick={() => revokeRequest.mutate(request.id)} aria-label={`Turn off ${request.title} link`}><X size={15} /></button>
                  </>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="file-request-empty"><span className="file-request-empty-icon"><Upload size={20} /></span><strong>No upload links yet</strong><span>Make your first request above and share it with anyone who needs to send you files.</span></div>
        )}
      </section>
    </main>
  );
}

export function PublicFileRequestPage() {
  const { token = "" } = useParams();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const requestQuery = useQuery({
    queryKey: ["public-file-request", token],
    queryFn: () => apiRequest<PublicFileRequest>(`/file-requests/public/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
    retry: false,
  });
  const maxUploadBytes = Number(requestQuery.data?.maxUploadBytes);
  const request = requestQuery.data;

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  function addFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setSelectedFiles(files);
    setFailures([]);
    setUploadMessage("");
  }

  async function uploadSelected() {
    if (!selectedFiles.length || uploading) return;
    const validLimit = Number.isSafeInteger(maxUploadBytes) && maxUploadBytes > 0;
    if (!validLimit) {
      setFailures([{ name: "Upload limit", message: "The upload limit could not be checked. Reload this page and try again." }]);
      return;
    }
    if (selectedFiles.length > 250) {
      setFailures([{ name: "Too many files", message: "Choose no more than 250 files at a time." }]);
      return;
    }

    setUploading(true);
    setFailures([]);
    setUploadMessage("");
    setProcessedCount(0);
    let completed = 0;
    let processed = 0;
    let nextIndex = 0;
    const errors: UploadFailure[] = [];

    async function uploadNext() {
      while (true) {
        const index = nextIndex++;
        const file = selectedFiles[index];
        if (!file) return;
        if (file.size > maxUploadBytes) {
          errors.push({ name: file.name, message: `${formatBytes(file.size)} exceeds the ${formatBytes(maxUploadBytes)} per-file limit.` });
          processed += 1;
          setProcessedCount(processed);
          continue;
        }
        try {
          const body = new FormData();
          body.append("file", file);
          if (file.webkitRelativePath) body.append("relativePath", file.webkitRelativePath);
          await apiRequest(`/file-requests/public/${encodeURIComponent(token)}/uploads`, { method: "POST", body });
          completed += 1;
          setUploadCount(completed);
        } catch (error) {
          errors.push({ name: file.name, message: error instanceof Error ? error.message : "This file couldn’t be uploaded." });
        } finally {
          processed += 1;
          setProcessedCount(processed);
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(3, selectedFiles.length) }, () => uploadNext()));
      setFailures(errors);
      setUploadMessage(`${completed} ${completed === 1 ? "file was" : "files were"} uploaded.`);
      if (!errors.length) setSelectedFiles([]);
    } finally {
      setUploading(false);
    }
  }

  if (requestQuery.isLoading) {
    return <main className="public-file-request-page"><div className="public-file-request-state"><LoaderCircle className="file-request-spin" size={22} />Opening your upload link…</div></main>;
  }
  if (requestQuery.isError || !request) {
    return <main className="public-file-request-page"><section className="public-file-request-card public-file-request-unavailable"><BrandIdentity /><span className="file-request-step">UPLOAD LINK</span><h1>This link isn’t available.</h1><p>It may have expired or been turned off by the person who shared it.</p><Link to="/" className="file-request-powered-link">Go to IMARA <ArrowUpRight size={14} /></Link></section></main>;
  }
  if (!request.active) {
    return <main className="public-file-request-page"><section className="public-file-request-card public-file-request-unavailable"><BrandIdentity /><span className="file-request-step">UPLOAD LINK</span><h1>This request is closed.</h1><p>Ask {request.ownerName} for a new upload link.</p></section></main>;
  }

  return (
    <main className="public-file-request-page">
      <section className="public-file-request-card">
        <header className="public-file-request-brand"><BrandIdentity /><span>FILE REQUEST</span></header>
        <div className="public-file-request-intro">
          <span className="public-file-request-icon"><Upload size={22} /></span>
          <h1>{request.title}</h1>
          <p>{request.message || `${request.ownerName} is asking you to send files.`}</p>
          <div className="public-file-request-destination"><Folder size={14} /><span>{request.destinationFolderName ? `Uploads go to ${request.destinationFolderName}` : "Uploads go to a private folder"}</span></div>
        </div>

        <div className="public-file-request-drop">
          <div className="public-file-request-file-icons" aria-hidden="true"><FileText /><FileImage /><Video /><FileAudio2 /></div>
          <strong>Send files or a whole folder</strong>
          <span>Documents, photos, video, audio, and other file types · up to {formatBytes(maxUploadBytes)} each</span>
          <div className="public-file-request-select-actions">
            <button type="button" disabled={uploading} onClick={() => filesInput.current?.click()}><Upload size={15} />Choose files</button>
            <button type="button" disabled={uploading} onClick={() => folderInput.current?.click()}><FolderUp size={15} />Choose folder</button>
          </div>
          <input ref={filesInput} className="file-request-hidden-input" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          <input ref={folderInput} className="file-request-hidden-input" type="file" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        </div>

        {selectedFiles.length > 0 && (
          <section className="public-file-request-selection" aria-label="Selected uploads">
            <div className="public-file-request-selection-heading"><strong>{selectedFiles.length} {selectedFiles.length === 1 ? "item" : "items"} selected</strong><button type="button" onClick={() => setSelectedFiles([])} disabled={uploading}>Clear</button></div>
            <ul>{selectedFiles.slice(0, 5).map((file, index) => <li key={`${file.name}-${index}`}><span>{fileKind(file)}<span>{file.webkitRelativePath || file.name}</span></span><small>{formatBytes(file.size)}</small></li>)}</ul>
            {selectedFiles.length > 5 && <small className="public-file-request-more">and {selectedFiles.length - 5} more…</small>}
            <button className="button button-green public-file-request-upload" type="button" onClick={() => void uploadSelected()} disabled={uploading}>
              {uploading ? <LoaderCircle className="file-request-spin" size={16} /> : <Upload size={16} />}
              {uploading ? `Sending ${processedCount} of ${selectedFiles.length}…` : "Upload selected files"}
            </button>
          </section>
        )}
        {uploadMessage && <p className="public-file-request-success" role="status"><Check size={16} />{uploadMessage}{uploadCount > 0 ? ` (${uploadCount} this visit)` : ""}</p>}
        {failures.length > 0 && <section className="public-file-request-failures" role="alert"><strong>{failures.length} {failures.length === 1 ? "upload needs" : "uploads need"} attention</strong><ul>{failures.map((failure, index) => <li key={`${failure.name}-${index}`}><b>{failure.name}</b><span>{failure.message}</span></li>)}</ul></section>}
        <footer className="public-file-request-footer"><ShieldCheck size={14} /><span>Files are sent directly to {request.ownerName}’s IMARA storage.</span></footer>
      </section>
      <Link to="/" className="file-request-powered-link">Secure uploads by <BrandIdentity /></Link>
    </main>
  );
}
