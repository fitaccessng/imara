import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, RotateCcw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiRequest, type StoredFile } from "../../lib/api";

type Collection = "favorites" | "trash";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export function FileCollectionPage({ collection }: { collection: Collection }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const isTrash = collection === "trash";
  const filesQuery = useQuery({
    queryKey: [`storage-${collection}`],
    queryFn: () => apiRequest<StoredFile[]>(`/files/${collection}`),
  });

  async function refreshFiles() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["storage-files"] }),
      queryClient.invalidateQueries({ queryKey: ["storage-favorites"] }),
      queryClient.invalidateQueries({ queryKey: ["storage-trash"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
    ]);
  }

  const updateFile = useMutation({
    mutationFn: ({ file, action }: { file: StoredFile; action: "unfavorite" | "restore" | "permanent-delete" }) => {
      if (action === "unfavorite") {
        return apiRequest(`/files/${file.id}/favorite`, { method: "PATCH", body: JSON.stringify({ isFavorite: false }) });
      }
      if (action === "restore") {
        return apiRequest(`/files/${file.id}/restore`, { method: "POST" });
      }
      return apiRequest<void>(`/files/${file.id}/permanent`, { method: "DELETE" });
    },
    onSuccess: refreshFiles,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to update this file."),
  });

  const files = filesQuery.data ?? [];
  const title = isTrash ? "Recycle Bin" : "Favourites";

  return (
    <div className="files-page">
      <div className="page-heading files-heading">
        <div>
          <span className="eyebrow">{isTrash ? "YOUR LIBRARY" : "SAVED FILES"}</span>
          <h1>{title}<span className="heading-period">.</span></h1>
          <p className="page-subtitle">
            {isTrash
              ? "Deleted files stay here until you restore or permanently delete them."
              : "Quick access to the files you have marked as favourites."}
          </p>
        </div>
      </div>

      {actionError && <p className="form-alert files-alert" role="alert">{actionError}</p>}
      {filesQuery.isError && <div className="inline-error" role="alert">
        <div><strong>{title} couldn’t load.</strong><p>{filesQuery.error instanceof Error ? filesQuery.error.message : "Please try again."}</p></div>
        <button className="button button-outline button-small" onClick={() => void filesQuery.refetch()}>Try again</button>
      </div>}

      {filesQuery.isLoading ? (
        <div className="page-loading"><span className="loader" />Loading {isTrash ? "Recycle Bin" : "favourites"}…</div>
      ) : filesQuery.data ? (
        <section className="file-list-card" aria-label={title}>
          <div className="file-list-header"><span>Name</span><span>Size</span><span>{isTrash ? "Deleted" : "Added"}</span><span className="file-actions-heading">Actions</span></div>
          {files.map((file) => (
            <div className="file-list-row" key={file.id}>
              <div className="file-name-button file-name-static">
                <FileText size={17} />
                <span>{file.name}{file.folderName ? <small className="file-secondary"> · {file.folderName}</small> : null}</span>
              </div>
              <span className="file-secondary">{formatBytes(Number(file.sizeBytes))}</span>
              <span className="file-secondary">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(isTrash && file.deletedAt ? file.deletedAt : file.createdAt))}</span>
              <div className="file-row-actions">
                {isTrash ? (
                  <>
                    <button aria-label={`Restore ${file.name}`} title="Restore file" disabled={updateFile.isPending} onClick={() => {
                      setActionError("");
                      updateFile.mutate({ file, action: "restore" });
                    }}><RotateCcw size={15} /></button>
                    <button aria-label={`Permanently delete ${file.name}`} title="Permanently delete" disabled={updateFile.isPending} onClick={() => {
                      if (window.confirm(`Permanently delete “${file.name}”? This cannot be undone.`)) {
                        setActionError("");
                        updateFile.mutate({ file, action: "permanent-delete" });
                      }
                    }}><Trash2 size={15} /></button>
                  </>
                ) : (
                  <button aria-label={`Remove ${file.name} from favourites`} title="Remove from favourites" disabled={updateFile.isPending} onClick={() => {
                    setActionError("");
                    updateFile.mutate({ file, action: "unfavorite" });
                  }}><Star size={15} fill="currentColor" /></button>
                )}
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <div className="files-empty">
              <div className="empty-illustration"><div className="empty-paper"><i /><i /><i /></div></div>
              <h2>{isTrash ? "Your Recycle Bin is empty." : "No favourites yet."}</h2>
              <p>{isTrash ? "Files you delete will appear here, where you can restore or permanently delete them." : "Mark a file as a favourite to find it quickly here."}</p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
