import { useQueries, useQuery } from "@tanstack/react-query";
import { Download, FileText, Folder, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, downloadFile, type StoredFile, type UserFolder } from "../../lib/api";
import { PageShell } from "../PageShell";
import type { Workspace } from "../../workspaces/types";
import { FileViewerModal } from "../../components/FileViewerModal";

interface SearchResults {
  query: string;
  folders: UserFolder[];
  files: Array<StoredFile & { matchedBy?: "name" | "content"; canDownload?: boolean }>;
}

interface WorkspaceSearchResults {
  workspaceId: string;
  files: Array<StoredFile & { matchedBy?: "name" | "content"; canDownload?: boolean }>;
}

interface SearchResultFile extends StoredFile {
  matchedBy?: "name" | "content";
  workspaceId?: string;
  workspaceName?: string;
  canDownload?: boolean;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [downloadError, setDownloadError] = useState("");
  const [viewingFile, setViewingFile] = useState<SearchResultFile | null>(null);
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiRequest<Workspace[]>("/workspaces"),
  });
  const resultsQuery = useQuery({
    queryKey: ["storage-search", query],
    queryFn: () => apiRequest<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  });
  const workspaceSearchQueries = useQueries({
    queries: (workspacesQuery.data ?? []).map((workspace) => ({
      queryKey: ["workspace-search", workspace.id, query],
      queryFn: () => apiRequest<WorkspaceSearchResults>(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}`),
      enabled: query.length > 0,
    })),
  });

  async function handleDownload(file: SearchResultFile) {
    setDownloadError("");
    try {
      const path = file.workspaceId
        ? `/workspaces/${file.workspaceId}/files/${file.id}/download`
        : `/files/${file.id}/download`;
      await downloadFile(path, file.name);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download this file.");
    }
  }

  const folders = resultsQuery.data?.folders ?? [];
  const files: SearchResultFile[] = [
    ...(resultsQuery.data?.files ?? []),
    ...workspaceSearchQueries.flatMap((workspaceQuery, index) => {
      const workspace = workspacesQuery.data?.[index];
      return (workspaceQuery.data?.files ?? []).map((file) => ({
        ...file,
        workspaceId: workspace?.id,
        workspaceName: workspace?.name,
      }));
    }),
  ];
  const hasResults = folders.length > 0 || files.length > 0;
  const isSearchingWorkspaces = workspacesQuery.isLoading || workspaceSearchQueries.some((result) => result.isLoading);
  const workspaceSearchError = workspacesQuery.isError || workspaceSearchQueries.some((result) => result.isError);

  return (
    <PageShell
      eyebrow="Search"
      title="Search results"
      description={query
        ? `Matches for “${query}” across your personal library and accessible workspaces. Readable document text is indexed automatically in the background.`
        : "Search files, folders, and readable document text."}
    >
      {!query ? (
        <div className="search-page-empty">
          <Search size={20} aria-hidden="true" />
          <p>Enter a name or phrase in the search bar above to search your libraries.</p>
        </div>
      ) : resultsQuery.isLoading || isSearchingWorkspaces ? (
        <div className="page-loading"><span className="loader" />Searching your libraries…</div>
      ) : resultsQuery.isError ? (
        <div className="inline-error" role="alert">
          <div><strong>Search couldn’t be completed.</strong><p>{resultsQuery.error instanceof Error ? resultsQuery.error.message : "Please try again."}</p></div>
          <button className="button button-outline button-small" onClick={() => void resultsQuery.refetch()}>Try again</button>
        </div>
      ) : (
        <>
          {downloadError && <p className="form-alert" role="alert">{downloadError}</p>}
          {workspaceSearchError && <p className="form-alert" role="status">Some workspace results couldn’t be loaded. Personal and available workspace results are shown.</p>}
          {!hasResults ? (
            <div className="search-page-empty">
              <Search size={20} aria-hidden="true" />
              <p>No files or folders match “{query}”.</p>
            </div>
          ) : (
            <div className="search-results-list">
              {folders.map((folder) => (
                <Link className="search-result-row" to={`/files?folder=${encodeURIComponent(folder.id)}`} key={`folder-${folder.id}`}>
                  <span className="search-result-icon search-folder-icon"><Folder size={17} /></span>
                  <span className="search-result-main"><strong title={folder.name}>{folder.name}</strong><small>Folder</small></span>
                  <span className="search-result-action">Open folder</span>
                </Link>
              ))}
              {files.map((file) => (
                <article className="search-result-row" key={`${file.workspaceId ?? "personal"}-${file.id}`}>
                  <span className="search-result-icon"><FileText size={17} /></span>
                  {file.canDownload === false
                    ? <span className="search-result-main"><strong title={file.name}>{file.name}</strong><small>{file.workspaceName ? `${file.workspaceName} · ` : ""}{file.mimeType} · {formatBytes(Number(file.sizeBytes))}{file.matchedBy === "content" && <em className="search-content-match">Matched document text</em>}</small></span>
                    : <button className="search-result-main search-result-main-button" type="button" onClick={() => setViewingFile(file)}>
                      <strong title={file.name}>{file.name}</strong><small>{file.workspaceName ? `${file.workspaceName} · ` : ""}{file.mimeType} · {formatBytes(Number(file.sizeBytes))}{file.matchedBy === "content" && <em className="search-content-match">Matched document text</em>}</small>
                    </button>}
                  {file.canDownload === false
                    ? <span className="search-result-action">View only</span>
                    : <button className="icon-button" aria-label={`Download ${file.name}`} onClick={() => void handleDownload(file)}><Download size={16} /></button>}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {viewingFile && <FileViewerModal
        file={viewingFile}
        readUrl={viewingFile.workspaceId ? `/workspaces/${viewingFile.workspaceId}/files/${viewingFile.id}/download` : `/files/${viewingFile.id}/download`}
        saveUrl={viewingFile.workspaceId ? `/workspaces/${viewingFile.workspaceId}/files/${viewingFile.id}/content` : `/files/${viewingFile.id}/content`}
        canEdit={!viewingFile.workspaceId}
        canDownload={viewingFile.canDownload !== false}
        onClose={() => setViewingFile(null)}
        onSaved={async () => undefined}
        onDownload={() => void handleDownload(viewingFile)}
      />}
    </PageShell>
  );
}

export default SearchResultsPage;
