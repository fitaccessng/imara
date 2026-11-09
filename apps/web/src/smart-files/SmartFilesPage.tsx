import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, FileSearch2, FolderOpen, Layers3, Tag, TriangleAlert } from "lucide-react";
import { apiRequest } from "../lib/api";
import "./smart-files.css";

type Category = "FINANCE" | "CONTRACTS" | "HUMAN_RESOURCES" | "OPERATIONS" | "PERSONAL" | "OTHER";
type View = "library" | "duplicates";
interface SmartFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
  updatedAt: string;
  category: Category;
  tags: string[];
  contentHash: string | null;
  folder: { id: string; name: string } | null;
}
interface DuplicateGroup {
  contentHash: string;
  files: Array<Pick<SmartFile, "id" | "name" | "mimeType" | "sizeBytes" | "createdAt" | "contentHash">>;
}

const categories: Array<{ value: Category | "ALL"; label: string }> = [
  { value: "ALL", label: "Everything" },
  { value: "FINANCE", label: "Finance" },
  { value: "CONTRACTS", label: "Contracts" },
  { value: "HUMAN_RESOURCES", label: "People" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "PERSONAL", label: "Personal" },
  { value: "OTHER", label: "Unsorted" },
];
const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes / 1024;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(amount < 10 ? 1 : 0)} ${units[unit]}`;
}

export function SmartFilesPage() {
  const [view, setView] = useState<View>("library");
  const [category, setCategory] = useState<Category | "ALL">("ALL");
  const [notice, setNotice] = useState("");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const libraryQuery = useQuery({
    queryKey: ["smart-library"],
    queryFn: () => apiRequest<SmartFile[]>("/files/smart-library"),
  });
  const duplicateQuery = useQuery({
    queryKey: ["smart-duplicates"],
    queryFn: () => apiRequest<DuplicateGroup[]>("/files/duplicates"),
  });
  const files = libraryQuery.data ?? [];
  const filteredFiles = useMemo(
    () => files.filter((file) => category === "ALL" || file.category === category),
    [files, category],
  );
  const updateMutation = useMutation({
    mutationFn: ({ id, nextCategory, tags }: { id: string; nextCategory?: Category; tags?: string[] }) =>
      apiRequest(`/files/${id}/organization`, { method: "PATCH", body: JSON.stringify({ ...(nextCategory && { category: nextCategory }), ...(tags && { tags }) }) }),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["smart-library"] });
      setNotice(variables.tags ? "Tags updated." : "Category updated.");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "The file could not be updated."),
  });

  const totalSize = files.reduce((total, file) => total + Number(file.sizeBytes), 0);
  const duplicateCount = (duplicateQuery.data ?? []).reduce((total, group) => total + group.files.length, 0);

  function saveTags(event: FormEvent<HTMLFormElement>, fileId: string) {
    event.preventDefault();
    const tags = (tagDrafts[fileId] ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > 20 || tags.some((tag) => tag.length > 40)) {
      setNotice("Use up to 20 tags, each no longer than 40 characters.");
      return;
    }
    updateMutation.mutate({ id: fileId, tags });
  }

  return (
    <main className="smart-files-page">
      <header className="smart-heading">
        <div>
          <p className="smart-eyebrow"><span /> FILE INTELLIGENCE</p>
          <h1>A better-kept library.</h1>
          <p>Documents are grouped by their details. Exact duplicates are surfaced for review, never removed automatically.</p>
        </div>
        <div className="smart-heading-stamp"><Layers3 size={19} /><span><b>{files.length}</b> FILES ORGANIZED</span></div>
      </header>

      <section className="smart-stat-grid" aria-label="File library summary">
        <article><span>IN YOUR LIBRARY</span><strong>{files.length}</strong><small>ready documents</small></article>
        <article><span>SPACE IN USE</span><strong>{formatBytes(String(totalSize))}</strong><small>across this library</small></article>
        <article><span>EXACT MATCHES</span><strong>{duplicateCount}</strong><small>files needing a look</small></article>
      </section>

      {notice && <div className="smart-notice" role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
      <div className="smart-library-header">
        <div className="smart-tabs" role="tablist" aria-label="File organization views">
          <button role="tab" aria-selected={view === "library"} className={view === "library" ? "smart-tab-active" : ""} onClick={() => setView("library")}><FolderOpen size={15} /> Library <span>{files.length}</span></button>
          <button role="tab" aria-selected={view === "duplicates"} className={view === "duplicates" ? "smart-tab-active" : ""} onClick={() => setView("duplicates")}><FileSearch2 size={15} /> Exact duplicates <span>{duplicateCount}</span></button>
        </div>
        {view === "library" && <div className="smart-sort"><ArrowDownUp size={14} /> Recently updated</div>}
      </div>

      {view === "library" ? (
        <>
          <nav className="smart-categories" aria-label="Filter by category">
            {categories.map((item) => <button key={item.value} className={category === item.value ? "smart-category-active" : ""} onClick={() => setCategory(item.value)}>{item.label}{item.value !== "ALL" && <span>{files.filter((file) => file.category === item.value).length}</span>}</button>)}
          </nav>
          {libraryQuery.isLoading ? <div className="smart-empty">Gathering your documents…</div> : libraryQuery.isError ? <div className="smart-error" role="alert">Your library couldn’t load. {libraryQuery.error.message}</div> : filteredFiles.length === 0 ? (
            <section className="smart-empty"><span><FolderOpen size={23} /></span><strong>{files.length ? "No files in this category" : "Your library is waiting"}</strong><p>{files.length ? "Choose another category to see more files." : "Upload a document and IMARA will organize it from its name and file type."}</p></section>
          ) : (
            <div className="smart-file-list">
              <div className="smart-file-table-head"><span>DOCUMENT</span><span>LOCATION</span><span>CATEGORY</span><span>UPDATED</span><span>SIZE</span></div>
              {filteredFiles.map((file) => (
                <article className="smart-file-row" key={file.id}>
                  <div className="smart-file-name"><span className="smart-file-glyph"><Tag size={15} /></span><div><strong>{file.name}</strong><small>{file.mimeType}</small><form className="smart-tag-editor" onSubmit={(event) => saveTags(event, file.id)}><input aria-label={`Tags for ${file.name}`} value={tagDrafts[file.id] ?? file.tags.join(", ")} onChange={(event) => setTagDrafts((drafts) => ({ ...drafts, [file.id]: event.target.value }))} placeholder="Add tags, separated by commas" /><button type="submit" disabled={updateMutation.isPending}>Save tags</button></form></div></div>
                  <div className="smart-file-location">{file.folder?.name ?? "My files"}</div>
                  <label className="smart-category-select"><span className="sr-only">Category for {file.name}</span><select value={file.category} disabled={updateMutation.isPending} onChange={(event) => updateMutation.mutate({ id: file.id, nextCategory: event.target.value as Category })}>{categories.filter((item) => item.value !== "ALL").map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                  <time className="smart-file-date" dateTime={file.updatedAt}>{dateFormat.format(new Date(file.updatedAt))}</time>
                  <span className="smart-file-size">{formatBytes(file.sizeBytes)}</span>
                </article>
              ))}
              {files.length === 500 && <p className="smart-limit-note">Showing the 500 most recently updated files.</p>}
            </div>
          )}
        </>
      ) : (
        <section className="smart-duplicates">
          <div className="smart-duplicate-note"><TriangleAlert size={16} /><p><strong>Review before you remove.</strong> Matches are based on identical file contents. Similar-looking documents are not grouped.</p></div>
          {duplicateQuery.isLoading ? <div className="smart-empty">Comparing file fingerprints…</div> : duplicateQuery.isError ? <div className="smart-error" role="alert">Duplicates couldn’t load. {duplicateQuery.error.message}</div> : (duplicateQuery.data ?? []).length === 0 ? (
            <div className="smart-empty"><span><FileSearch2 size={23} /></span><strong>No exact duplicates found</strong><p>New uploads are compared by a cryptographic content fingerprint.</p></div>
          ) : (duplicateQuery.data ?? []).map((group) => (
            <article className="smart-duplicate-card" key={group.contentHash}>
              <header><span className="smart-duplicate-mark"><FileSearch2 size={16} /></span><div><strong>{group.files.length} identical files</strong><small>SHA-256 · {group.contentHash.slice(0, 12)}…</small></div><span className="smart-review-label">REVIEW</span></header>
              <div className="smart-duplicate-files">{group.files.map((file) => <div key={file.id}><span>{file.name}</span><small>{formatBytes(file.sizeBytes)} · {dateFormat.format(new Date(file.createdAt))}</small></div>)}</div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
