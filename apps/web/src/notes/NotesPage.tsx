import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Mic, Search, Square, Trash2 } from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { apiRequest } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { fileLabel, type ProductivityAttachment, type ProductivityFile } from "../productivity/types";
import { startOnDeviceDictation } from "../productivity/localDictation";

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  attachments: ProductivityAttachment[];
}

interface NoteDraft {
  id: string | null;
  title: string;
  body: string;
  fileIds: string[];
  originalTitle: string;
  originalBody: string;
  originalFileIds: string[];
}

function isDirty(draft: NoteDraft | null) {
  return Boolean(draft && (
    draft.title !== draft.originalTitle
    || draft.body !== draft.originalBody
    || draft.fileIds.join(",") !== draft.originalFileIds.join(",")
  ));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function NotesPage({ shared = false }: { shared?: boolean }) {
  const { workspaces, workspace, workspacesQuery, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState("");
  const dictationStop = useRef<(() => void) | null>(null);
  const scopeId = shared ? workspace?.id : null;
  const notesPath = shared ? `/workspaces/${scopeId}/notes` : "/notes";
  const filesPath = shared ? `/workspaces/${scopeId}/storage` : "/files";
  const notesQuery = useQuery({
    queryKey: ["productivity-notes", scopeId ?? "personal"],
    queryFn: () => apiRequest<Note[]>(notesPath),
    enabled: !shared || Boolean(scopeId),
  });
  const filesQuery = useQuery({
    queryKey: ["productivity-files", scopeId ?? "personal"],
    queryFn: () => apiRequest<{ files: ProductivityFile[] }>(filesPath),
    enabled: Boolean(draft) && (!shared || Boolean(scopeId)),
  });

  const notes = useMemo(() => {
    const allNotes = notesQuery.data ?? [];
    const term = search.trim().toLowerCase();
    return term ? allNotes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(term)) : allNotes;
  }, [notesQuery.data, search]);
  const selectedNote = draft?.id ? notes.find((note) => note.id === draft.id) : undefined;
  const dirty = isDirty(draft);
  const files = filesQuery.data?.files ?? [];

  useEffect(() => () => dictationStop.current?.(), []);

  const saveMutation = useMutation({
    mutationFn: async (value: NoteDraft) => {
      const payload = { title: value.title.trim(), body: value.body.trim(), fileIds: value.fileIds };
      return value.id
        ? apiRequest<Note>(`${notesPath}/${encodeURIComponent(value.id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiRequest<Note>(notesPath, {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: async (note) => {
      await queryClient.invalidateQueries({ queryKey: ["productivity-notes", scopeId ?? "personal"] });
      const fileIds = note.attachments.map(({ fileId }) => fileId);
      setDraft({
        id: note.id,
        title: note.title,
        body: note.body,
        fileIds,
        originalTitle: note.title,
        originalBody: note.body,
        originalFileIds: fileIds,
      });
      setFeedback("Note saved.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`${notesPath}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["productivity-notes", scopeId ?? "personal"] });
      setDraft(null);
      setFeedback("Note deleted.");
    },
    onError: (cause) => setFeedback(cause instanceof Error ? cause.message : "The note could not be deleted."),
  });

  function chooseNote(note: Note) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    dictationStop.current?.();
    dictationStop.current = null;
    setDictating(false);
    setFeedback("");
    const fileIds = note.attachments.map(({ fileId }) => fileId);
    setDraft({
      id: note.id,
      title: note.title,
      body: note.body,
      fileIds,
      originalTitle: note.title,
      originalBody: note.body,
      originalFileIds: fileIds,
    });
  }

  function startNote() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    dictationStop.current?.();
    dictationStop.current = null;
    setDictating(false);
    setFeedback("");
    setDraft({ id: null, title: "", body: "", fileIds: [], originalTitle: "", originalBody: "", originalFileIds: [] });
  }

  function toggleDictation() {
    if (dictating) {
      dictationStop.current?.();
      dictationStop.current = null;
      setDictating(false);
      return;
    }
    setDictationError("");
    try {
      dictationStop.current = startOnDeviceDictation(
        (text) => setDraft((current) => current ? { ...current, body: `${current.body}${current.body ? " " : ""}${text}` } : current),
        () => { dictationStop.current = null; setDictating(false); },
        (message) => setDictationError(message),
      );
      setDictating(true);
    } catch (cause) {
      setDictationError(cause instanceof Error ? cause.message : "On-device dictation could not start.");
    }
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.body.trim()) return;
    setFeedback("");
    saveMutation.mutate(draft);
  }

  async function deleteNote() {
    if (!draft?.id || !window.confirm("Delete this note? This can’t be undone.")) return;
    setFeedback("");
    deleteMutation.mutate(draft.id);
  }

  return (
    <PageShell
      eyebrow={shared ? "BUSINESS WORKSPACE" : "PERSONAL SPACE"}
      title="IMARA Notes"
      description="Keep meeting notes, ideas and business records connected to relevant documents."
    >
      <main className="mx-auto grid w-full max-w-[1200px] gap-5 pb-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        {shared && workspaces.length > 1 && <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600 lg:col-span-2">Workspace
          <select value={workspace?.id ?? ""} onChange={(event) => selectWorkspace(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>}
        {shared && workspacesQuery.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 lg:col-span-2">Workspaces could not be loaded. Try refreshing the page.</p>
          : shared && !workspace ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 lg:col-span-2">Join a business workspace to create shared notes.</p>
            : <>
        <section className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white">
          <div className="border-b border-[#E5EAF0] p-4">
            <button type="button" onClick={startNote} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-4 text-sm font-semibold text-white transition hover:bg-[#168d34]">
              <FilePlus2 size={17} /> New note
            </button>
            <label className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-[#E5EAF0] px-3 text-[#718096]">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" aria-label="Search notes" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#172B3A] outline-none placeholder:text-[#A0AEC0]" />
            </label>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-2">
            {notesQuery.isPending ? (
              <p className="p-4 text-sm text-[#718096]">Loading notes…</p>
            ) : notesQuery.isError ? (
              <div className="p-4 text-sm text-[#9B2C2C]">
                <p>{notesQuery.error instanceof Error ? notesQuery.error.message : "Notes could not be loaded."}</p>
                <button type="button" onClick={() => void notesQuery.refetch()} className="mt-2 font-semibold underline">Try again</button>
              </div>
            ) : notes.length ? notes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => chooseNote(note)}
                className={`mb-1 block w-full rounded-xl p-3 text-left transition hover:bg-[#F7F9FC] ${draft?.id === note.id ? "bg-[#EFF8F1]" : ""}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-[#172B3A]">
                  <FileText size={15} className="shrink-0 text-[#20AD43]" />
                  <span className="truncate">{note.title}</span>
                </span>
                <span className="mt-1 block truncate pl-[23px] text-xs text-[#718096]">{note.body}</span>
                <span className="mt-2 block pl-[23px] text-[10px] text-[#A0AEC0]">Edited {dateLabel(note.updatedAt)}</span>
              </button>
            )) : (
              <div className="p-6 text-center">
                <FileText size={22} className="mx-auto text-[#A0AEC0]" />
                <p className="mt-3 text-sm font-semibold text-[#172B3A]">{search ? "No matching notes" : "No notes yet"}</p>
                <p className="mt-1 text-xs leading-5 text-[#718096]">{search ? "Try a different search." : "Create a note for the details you want to keep handy."}</p>
              </div>
            )}
          </div>
        </section>

        <section className="min-h-[420px] rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-7">
          {draft ? (
            <form onSubmit={saveNote} className="flex h-full min-h-[380px] flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-[#E5EAF0] pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#20AD43]">{draft.id ? "YOUR NOTE" : "NEW NOTE"}</p>
                  <p className="mt-1 text-xs text-[#718096]">{selectedNote ? `Last edited ${dateLabel(selectedNote.updatedAt)}` : shared ? "Visible to members of this workspace." : "Only you can see your personal notes."}</p>
                </div>
                {draft.id && <button type="button" onClick={() => void deleteNote()} disabled={deleteMutation.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#9B2C2C] hover:bg-red-50 disabled:opacity-50"><Trash2 size={15} /> Delete</button>}
              </div>
              <label className="mt-5">
                <span className="sr-only">Note title</span>
                <input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setFeedback(""); }} maxLength={120} required placeholder="Note title" className="w-full border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-[#172B3A] outline-none placeholder:text-[#A0AEC0] sm:text-3xl" />
              </label>
              <label className="mt-5 flex-1">
                <span className="sr-only">Note content</span>
                <textarea value={draft.body} onChange={(event) => { setDraft({ ...draft, body: event.target.value }); setFeedback(""); }} maxLength={20000} required placeholder="Start writing…" className="min-h-[260px] w-full resize-y border-0 bg-transparent p-0 text-sm leading-7 text-[#4A5568] outline-none placeholder:text-[#A0AEC0]" />
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={toggleDictation} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${dictating ? "border-red-200 bg-red-50 text-red-700" : "border-[#E5EAF0] text-[#4A5568]"}`}>
                  {dictating ? <Square size={13} /> : <Mic size={14} />}{dictating ? "Stop dictation" : "Dictate on this device"}
                </button>
                <span className="text-[11px] text-[#718096]">Audio is processed locally by your browser; an on-device speech model is required.</span>
              </div>
              {dictationError && <p role="alert" className="mt-2 text-xs text-[#9B2C2C]">{dictationError}</p>}
              <fieldset className="mt-4 space-y-2">
                <legend className="text-xs font-semibold text-[#4A5568]">Attached documents</legend>
                {filesQuery.isPending ? <p className="text-xs text-[#718096]">Loading documents…</p>
                  : files.length ? <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-[#E5EAF0] p-2">{files.map((file) => <label key={file.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[#4A5568] hover:bg-[#F7F9FC]"><input type="checkbox" checked={draft.fileIds.includes(file.id)} onChange={(event) => { setDraft({ ...draft, fileIds: event.target.checked ? [...draft.fileIds, file.id] : draft.fileIds.filter((id) => id !== file.id) }); setFeedback(""); }} />{fileLabel(file)}</label>)}</div>
                    : <p className="text-xs text-[#718096]">Upload documents in Files first, then attach them here.</p>}
              </fieldset>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5EAF0] pt-4">
                <span className="text-xs text-[#718096]" role="status">{saveMutation.isPending ? "Saving…" : saveMutation.isError ? saveMutation.error.message : feedback || (dirty ? "Unsaved changes" : "All changes saved")}</span>
                <button type="submit" disabled={!dirty || !draft.title.trim() || !draft.body.trim() || saveMutation.isPending} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#102B46] px-5 text-sm font-semibold text-white transition hover:bg-[#183d5e] disabled:cursor-not-allowed disabled:opacity-45">
                  {draft.id ? "Save changes" : "Save note"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-[380px] flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFF8F1] text-[#20AD43]"><FileText size={24} /></span>
              <h2 className="mt-4 text-lg font-bold text-[#172B3A]">A clear space for your thoughts</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#718096]">Create a note to keep plans, reminders or details that belong with your personal workspace.</p>
              <button type="button" onClick={startNote} className="mt-5 min-h-11 rounded-xl border border-[#E5EAF0] px-4 text-sm font-semibold text-[#172B3A] transition hover:border-[#20AD43] hover:text-[#168d34]">Write a note</button>
            </div>
          )}
        </section>
            </>}
      </main>
    </PageShell>
  );
}

export default NotesPage;
