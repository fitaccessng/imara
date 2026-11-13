import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Folder, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest, downloadFile, type StoredFile, type UserFolder } from "../../lib/api";
import { PageShell } from "../PageShell";

interface SearchResults {
  query: string;
  folders: UserFolder[];
  files: Array<StoredFile & { matchedBy?: "name" | "content" }>;
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
  const resultsQuery = useQuery({
    queryKey: ["storage-search", query],
    queryFn: () => apiRequest<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  });

  async function handleDownload(file: StoredFile) {
    setDownloadError("");
    try {
      await downloadFile(`/files/${file.id}/download`, file.name);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to download this file.");
    }
  }

  const folders = resultsQuery.data?.folders ?? [];
  const files = resultsQuery.data?.files ?? [];
  const hasResults = folders.length > 0 || files.length > 0;

  return (
    <PageShell
      eyebrow="Search"
      title="Search results"
      description={query ? `Matches for “${query}” in your personal library.` : "Search files and folders by name."}
    >
      {!query ? (
        <div className="search-page-empty">
          <Search size={20} aria-hidden="true" />
          <p>Enter a name in the search bar above to search your library.</p>
        </div>
      ) : resultsQuery.isLoading ? (
        <div className="page-loading"><span className="loader" />Searching your library…</div>
      ) : resultsQuery.isError ? (
        <div className="inline-error" role="alert">
          <div><strong>Search couldn’t be completed.</strong><p>{resultsQuery.error instanceof Error ? resultsQuery.error.message : "Please try again."}</p></div>
          <button className="button button-outline button-small" onClick={() => void resultsQuery.refetch()}>Try again</button>
        </div>
      ) : (
        <>
          {downloadError && <p className="form-alert" role="alert">{downloadError}</p>}
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
                  <span className="search-result-main"><strong>{folder.name}</strong><small>Folder</small></span>
                  <span className="search-result-action">Open folder</span>
                </Link>
              ))}
              {files.map((file) => (
                <article className="search-result-row" key={`file-${file.id}`}>
                  <span className="search-result-icon"><FileText size={17} /></span>
                  <span className="search-result-main"><strong>{file.name}</strong><small>{file.mimeType} · {formatBytes(Number(file.sizeBytes))}{file.matchedBy === "content" && <em className="search-content-match">Matched document text</em>}</small></span>
                  <button className="icon-button" aria-label={`Download ${file.name}`} onClick={() => void handleDownload(file)}><Download size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

export default SearchResultsPage;
