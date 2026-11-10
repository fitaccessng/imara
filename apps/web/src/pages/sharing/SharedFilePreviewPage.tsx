import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useParams } from "react-router-dom";
import { apiBlob, apiRequest } from "../../lib/api";
import { OfficePreviewEditor } from "../../components/OfficePreviewEditor";

interface PublicFile {
  name: string;
  mimeType: string;
  sizeBytes: string;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "File size unavailable";
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB"];
  let amount = bytes;
  let index = -1;
  do {
    amount /= 1024;
    index += 1;
  } while (amount >= 1024 && index < units.length - 1);
  return `${amount.toFixed(amount < 10 ? 1 : 0)} ${units[index]}`;
}

export function SharedFilePreviewPage() {
  const { token = "" } = useParams();
  const metadataQuery = useQuery({
    queryKey: ["public-share-metadata", token],
    queryFn: () => apiRequest<PublicFile>(`/public-shares/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });
  const fileQuery = useQuery({
    queryKey: ["public-share-content", token],
    queryFn: () => apiBlob(`/public-shares/${encodeURIComponent(token)}/download`),
    enabled: Boolean(metadataQuery.data),
  });
  const objectUrl = useMemo(() => fileQuery.data ? URL.createObjectURL(fileQuery.data) : "", [fileQuery.data]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const file = metadataQuery.data;
  const blob = fileQuery.data;
  const extension = file?.name.split(".").pop()?.toLowerCase();
  const officeFile = Boolean(extension && ["docx", "xls", "xlsx", "pdf"].includes(extension));

  function download() {
    if (!objectUrl || !file) return;
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return <main className="public-share-page">
    <header className="public-share-topbar">
      <a className="public-share-brand" href="/"><img src="/images/imara-symbol.png" alt="" /><strong>imara</strong></a>
      <span><Link2 size={14} /> Shared document</span>
    </header>
    <section className="public-share-card">
      {metadataQuery.isPending ? <div className="public-share-state"><LoaderCircle className="file-viewer-spinner" size={22} />Checking link…</div>
        : metadataQuery.isError || !file ? <div className="public-share-state">
          <ShieldCheck size={26} /><h1>This link is unavailable</h1>
          <p>It may have been revoked, or the document is no longer available.</p>
        </div>
          : <>
            <header className="public-share-file-heading">
              <span className="public-share-file-icon"><FileText size={20} /></span>
              <span><h1>{file.name}</h1><p>{formatBytes(Number(file.sizeBytes))} · Shared securely from IMARA</p></span>
              <button className="button button-green" type="button" onClick={download} disabled={!objectUrl}><Download size={15} />Download</button>
            </header>
            {fileQuery.isPending ? <div className="public-share-state"><LoaderCircle className="file-viewer-spinner" size={22} />Loading preview…</div>
              : fileQuery.isError ? <div className="public-share-state"><h2>Preview unavailable</h2><p>The link is valid, but this document could not be loaded. Try downloading it.</p></div>
                : objectUrl && file.mimeType.startsWith("image/") ? <div className="public-share-media"><img src={objectUrl} alt={file.name} /></div>
                  : objectUrl && file.mimeType.startsWith("video/") ? <div className="public-share-media"><video controls src={objectUrl}>{file.name}</video></div>
                    : objectUrl && file.mimeType.startsWith("audio/") ? <div className="public-share-media"><audio controls src={objectUrl}>{file.name}</audio></div>
                      : objectUrl && blob && officeFile ? <OfficePreviewEditor file={file} blob={blob} saveUrl="" canEdit={false} onDirtyChange={() => undefined} onSaved={async () => undefined} />
                        : <div className="public-share-state"><FileText size={26} /><h2>Download to view this file</h2><p>This file type is available to download but doesn’t have an in-browser preview.</p></div>}
          </>}
    </section>
    <footer className="public-share-footer"><ShieldCheck size={14} /> This is a read-only link. The owner can revoke access at any time.</footer>
  </main>;
}

export default SharedFilePreviewPage;
