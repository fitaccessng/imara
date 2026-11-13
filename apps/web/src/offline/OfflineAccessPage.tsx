import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowLeft, FileText, FolderDown, HardDrive, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { formatStorageBytes } from "../pages/dashboard/StorageOverviewCard";
import { listOfflineFiles, removeOfflineFile, type OfflineFile } from "./offlineFiles";
import { useAuth } from "../auth/AuthProvider";
import { Link } from "react-router-dom";

export function OfflineAccessPage() {
  const { user, loading: authLoading } = useAuth();
  const [files, setFiles] = useState<OfflineFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<OfflineFile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const [authorized, setAuthorized] = useState(Boolean(user));
  const [storageUsage, setStorageUsage] = useState<{ usage?: number; quota?: number } | null>(null);

  async function refresh() {
    if (authLoading) return;
    setError("");
    let ownerId = user?.id ?? "";
    let hadSession = false;
    try {
      if (!user && !navigator.onLine) ownerId = window.localStorage.getItem("imara:offline:last-user") ?? "";
      hadSession = window.localStorage.getItem("imara:session-established") === "true";
    } catch {
      setFiles([]);
      setAuthorized(false);
      setError("This browser’s local storage is unavailable, so account access cannot be verified.");
      setLoading(false);
      return;
    }
    setAuthorized(Boolean(user) || (!navigator.onLine && hadSession && Boolean(ownerId)));
    if (!user && (navigator.onLine || !hadSession || !ownerId)) {
      setFiles([]);
      setLoading(false);
      return;
    }
    try {
      setFiles(await listOfflineFiles(ownerId));
      const estimate = await navigator.storage?.estimate();
      if (estimate) setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Offline files could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
      void refresh();
    };
    const updateFiles = () => void refresh();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("imara:offline-files-changed", updateFiles);
    void refresh();
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("imara:offline-files-changed", updateFiles);
    };
  }, [user, authLoading]);

  const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);

  if (!authorized && !loading) {
    return <PageShell eyebrow="YOUR LIBRARY" title="Offline access" description="Sign in on this device to view your saved documents.">
      <div className="offline-access-empty"><strong>Offline copies are private to the account that saved them.</strong><p>Connect to the internet and sign in to continue.</p></div>
    </PageShell>;
  }

  return (
    <PageShell eyebrow="YOUR LIBRARY" title="Offline access" description="Keep selected documents available on this device, even when your connection drops.">
      <main className="offline-access-page">
        <Link className="offline-access-back" to="/files"><ArrowLeft size={14} /> Back to your files</Link>
        <section className="offline-access-status">
          <div className={`offline-access-connectivity${online ? " offline-access-online" : ""}`}>
            {online ? <Wifi size={18} /> : <WifiOff size={18} />}
            <div><strong>{online ? "You’re online" : "You’re offline"}</strong><span>{online ? "Your saved files are ready whenever you need them." : "Showing the copies saved on this device."}</span></div>
          </div>
          <div className="offline-access-meter"><HardDrive size={17} /><div><strong>{formatStorageBytes(totalBytes)} saved</strong><span>{files.length} {files.length === 1 ? "document" : "documents"} · this device only</span></div></div>
        </section>

        <div className="offline-access-note"><FolderDown size={16} /><p>To save a document, open it from <strong>Your files</strong> and choose <strong>Save offline</strong>. Copies stay in this browser and can be removed here at any time.</p></div>
        {error && <p className="offline-access-error" role="alert">{error}</p>}

        <section className="offline-access-list">
          <div className="offline-access-list-heading"><div><span>DEVICE LIBRARY</span><h2>Saved documents</h2></div><span>{formatStorageBytes(storageUsage?.usage ?? totalBytes)} device storage used</span></div>
          {loading ? <div className="offline-access-empty">Loading saved documents…</div> : files.length ? (
            <div className="offline-access-rows">
              {files.map((file) => (
                <article className="offline-access-row" key={file.id}>
                  <span className="offline-access-file-icon"><FileText size={17} /></span>
                  <button className="offline-access-file-info" type="button" onClick={() => setSelectedFile(file)}>
                    <strong>{file.name}</strong><span>{file.mimeType || "Document"} · {formatStorageBytes(file.sizeBytes)}</span>
                  </button>
                  <button className="offline-access-remove" type="button" onClick={() => void removeOfflineFile(file.id).then(refresh)} aria-label={`Remove ${file.name} from offline storage`}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          ) : (
            <div className="offline-access-empty"><span><ArrowDownToLine size={20} /></span><strong>No documents saved for offline use</strong><p>Open any document in your library and save it to this device before you travel.</p></div>
          )}
        </section>

        <p className="offline-access-footnote">Copies use your browser’s local storage and may be cleared by your device. This is not a backup. {storageUsage?.quota ? `Browser storage estimate: ${formatStorageBytes(storageUsage.quota)}.` : ""}</p>
        {selectedFile && <OfflinePreview file={selectedFile} onClose={() => setSelectedFile(null)} />}
      </main>
    </PageShell>
  );
}

function OfflinePreview({ file, onClose }: { file: OfflineFile; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setTextContent(null);
    if (file.mimeType.startsWith("text/")) {
      void file.blob.text().then((text) => {
        if (active) setTextContent(text);
      });
    }
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isAudio = file.mimeType.startsWith("audio/");
  const isVideo = file.mimeType.startsWith("video/");

  return (
    <div className="offline-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="offline-preview-dialog" role="dialog" aria-modal="true" aria-label={`Offline preview: ${file.name}`}>
        <header><div><strong>{file.name}</strong><span>Saved on this device · {formatStorageBytes(file.sizeBytes)}</span></div><button type="button" onClick={onClose} aria-label="Close preview"><X size={19} /></button></header>
        <div className="offline-preview-content">
          {!url ? <span>Opening saved copy…</span>
            : isImage ? <img src={url} alt={file.name} />
              : isPdf ? <iframe src={url} title={file.name} />
                : isAudio ? <audio controls src={url} />
                  : isVideo ? <video controls src={url} />
                    : file.mimeType.startsWith("text/") ? textContent === null ? <span>Opening saved copy…</span> : <pre className="max-h-full w-full overflow-auto whitespace-pre-wrap break-words p-5 text-left text-sm">{textContent}</pre>
                      : <div><FileText size={28} /><p>Offline preview isn’t available for this type. Download the saved copy to open it in a compatible app.</p><a href={url} download={file.name}>Download saved copy</a></div>}
        </div>
      </section>
    </div>
  );
}

export default OfflineAccessPage;
