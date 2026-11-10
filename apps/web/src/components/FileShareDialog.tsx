import { useState } from "react";
import { Copy, Link2, LoaderCircle, Share2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { ViewableFile } from "./FileViewerModal";

interface ShareLinkRecord {
  id: string;
  createdAt: string;
  revokedAt: string | null;
}

interface CreatedShareLink {
  id: string;
  token: string;
  createdAt: string;
}

export function FileShareDialog({
  file,
  sharesUrl,
  onClose,
}: {
  file: ViewableFile;
  sharesUrl: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [createdLink, setCreatedLink] = useState<CreatedShareLink | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const linksQuery = useQuery({
    queryKey: ["public-file-shares", sharesUrl],
    queryFn: () => apiRequest<ShareLinkRecord[]>(sharesUrl),
  });
  const createLink = useMutation({
    mutationFn: () => apiRequest<CreatedShareLink>(sharesUrl, { method: "POST" }),
    onSuccess: async (created) => {
      setCreatedLink(created);
      setError("");
      setNotice("");
      await queryClient.invalidateQueries({ queryKey: ["public-file-shares", sharesUrl] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The share link could not be created."),
  });
  const revokeLink = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`${sharesUrl}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRevokeId(null);
      setNotice("The public link has been revoked.");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["public-file-shares", sharesUrl] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The share link could not be revoked."),
  });

  const shareUrl = createdLink
    ? `${window.location.origin}/share/${encodeURIComponent(createdLink.token)}`
    : "";

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Share link copied. Anyone with it can view and download this file.");
      setError("");
    } catch {
      setError("Could not copy automatically. Select and copy the link from the field.");
    }
  }

  return <div className="folder-move-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !createLink.isPending && !revokeLink.isPending) onClose();
  }}>
    <section className="folder-move-dialog create-document-dialog file-share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-file-title">
      <div className="folder-move-heading">
        <div><span className="eyebrow">PUBLIC ACCESS</span><h2 id="share-file-title">Share this document</h2></div>
        <button className="icon-button" type="button" aria-label="Close dialog" disabled={createLink.isPending || revokeLink.isPending} onClick={onClose}><X size={18} /></button>
      </div>
      <p><strong>{file.name}</strong> can be viewed and downloaded by anyone with its link. Revoke a link at any time to disable access.</p>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notice && <p className="share-link-notice" role="status">{notice}</p>}
      {createdLink && <div className="share-link-created">
        <label className="field" htmlFor="public-share-url">New public link</label>
        <div className="share-link-input-row">
          <input id="public-share-url" className="folder-dialog-input" value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          <button className="button button-green" type="button" onClick={() => void copyLink()}><Copy size={14} />Copy</button>
        </div>
        <small>Keep this link private. It grants access without an IMARA account.</small>
      </div>}
      <div className="share-link-list-heading"><strong>Existing links</strong>
        <span>{linksQuery.isLoading ? "Loading…" : `${linksQuery.data?.filter((link) => !link.revokedAt).length ?? 0} active`}</span>
      </div>
      {linksQuery.isError
        ? <p className="form-alert" role="alert">{linksQuery.error instanceof Error ? linksQuery.error.message : "Share links could not be loaded."}</p>
        : linksQuery.isLoading
          ? <div className="share-link-loading"><LoaderCircle size={16} />Loading links…</div>
          : linksQuery.data?.length
            ? <ul className="share-link-list">{linksQuery.data.map((link) => (
              <li key={link.id} className={link.revokedAt ? "share-link-revoked" : ""}>
                <span className="share-link-mark"><Link2 size={15} /></span>
                <span><strong>{link.revokedAt ? "Revoked link" : "Active public link"}</strong><small>Created {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(link.createdAt))}</small></span>
                {!link.revokedAt && (revokeId === link.id
                  ? <span className="share-link-actions"><button type="button" disabled={revokeLink.isPending} onClick={() => revokeLink.mutate(link.id)}>{revokeLink.isPending ? "Revoking…" : "Confirm"}</button><button type="button" disabled={revokeLink.isPending} onClick={() => setRevokeId(null)}>Cancel</button></span>
                  : <button className="share-link-revoke" type="button" onClick={() => setRevokeId(link.id)}>Revoke</button>)}
              </li>
            ))}</ul>
            : <p className="share-link-empty">No public links have been created for this file.</p>}
      <div className="folder-move-actions">
        <button className="button button-outline" type="button" onClick={onClose}>Close</button>
        <button className="button button-green" type="button" disabled={createLink.isPending} onClick={() => {
          setNotice("");
          setError("");
          createLink.mutate();
        }}>
          <Share2 size={14} />{createLink.isPending ? "Creating…" : "Create public link"}
        </button>
      </div>
    </section>
  </div>;
}
