import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FilePlus2,
  FileText,
  LoaderCircle,
  Mic,
  Paperclip,
  Plus,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { apiRequest } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { fileLabel, type ProductivityAttachment, type ProductivityFile } from "../productivity/types";
import "../productivity/mobileCreateForms.css";
import {
  appendDictationText,
  startLocalModelDictation,
  type DictationSession,
} from "../productivity/localDictation";

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
  return Boolean(
    draft &&
      (draft.title !== draft.originalTitle ||
        draft.body !== draft.originalBody ||
        draft.fileIds.join(",") !== draft.originalFileIds.join(","))
  );
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
  const [dictationBusy, setDictationBusy] = useState(false);
  const [dictationError, setDictationError] = useState("");
  const [dictationStatus, setDictationStatus] = useState("");
  const dictationSession = useRef<DictationSession | null>(null);
  const dictationAbort = useRef<AbortController | null>(null);

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
    return term
      ? allNotes.filter((note) => `${note.title}\n${note.body}`.toLowerCase().includes(term))
      : allNotes;
  }, [notesQuery.data, search]);

  const selectedNote = draft?.id ? notes.find((note) => note.id === draft.id) : undefined;
  const dirty = isDirty(draft);
  const files = filesQuery.data?.files ?? [];

  useEffect(
    () => () => {
      dictationAbort.current?.abort();
      dictationSession.current?.cancel();
    },
    []
  );

  const saveMutation = useMutation({
    mutationFn: async (value: NoteDraft) => {
      const payload = {
        title: value.title.trim(),
        body: value.body.trim(),
        fileIds: value.fileIds,
      };
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
    mutationFn: (id: string) =>
      apiRequest<void>(`${notesPath}/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["productivity-notes", scopeId ?? "personal"] });
      setDraft(null);
      setFeedback("Note deleted.");
    },
    onError: (cause) =>
      setFeedback(cause instanceof Error ? cause.message : "The note could not be deleted."),
  });

  function cancelDictation() {
    dictationAbort.current?.abort();
    dictationAbort.current = null;
    dictationSession.current?.cancel();
    dictationSession.current = null;
    setDictating(false);
    setDictationBusy(false);
    setDictationError("");
    setDictationStatus("");
  }

  function chooseNote(note: Note) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    cancelDictation();
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
    cancelDictation();
    setFeedback("");
    setDraft({
      id: null,
      title: "",
      body: "",
      fileIds: [],
      originalTitle: "",
      originalBody: "",
      originalFileIds: [],
    });
  }

  async function toggleDictation() {
    if (dictating) {
      setDictationBusy(true);
      setDictating(false);
      setDictationStatus("Transcribing on this device…");
      dictationSession.current?.stop();
      return;
    }
    setDictationError("");
    setDictationBusy(true);
    const controller = new AbortController();
    dictationAbort.current = controller;
    try {
      const session = await startLocalModelDictation(
        (text) =>
          setDraft((current) =>
            current ? { ...current, body: appendDictationText(current.body, text) } : current
          ),
        setDictationStatus,
        () => {
          dictationSession.current = null;
          dictationAbort.current = null;
          setDictating(false);
          setDictationBusy(false);
          setDictationStatus("");
        },
        (message) => setDictationError(message),
        controller.signal
      );
      if (controller.signal.aborted) {
        session.cancel();
        return;
      }
      dictationSession.current = session;
      setDictating(true);
      setDictationBusy(false);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setDictationError(
          cause instanceof Error ? cause.message : "Local dictation could not start."
        );
      }
      dictationAbort.current = null;
      setDictationBusy(false);
      setDictationStatus("");
    }
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !draft.title.trim() || !draft.body.trim() || dictating || dictationBusy) return;
    setFeedback("");
    saveMutation.mutate(draft);
  }

  async function deleteNote() {
    if (!draft?.id || !window.confirm("Delete this note? This can’t be undone.")) return;
    cancelDictation();
    setFeedback("");
    deleteMutation.mutate(draft.id);
  }

  return (
    <PageShell
      eyebrow={shared ? "BUSINESS WORKSPACE" : "PERSONAL SPACE"}
      title="IMARA Notes"
      description="Keep meeting notes, ideas and business records connected to relevant documents."
    >
      <main className="mx-auto w-full max-w-5xl overflow-x-hidden bg-white px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-8">
        {/* Top Action Header */}
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:mb-8 lg:flex-row lg:items-center">
          {shared && workspaces.length > 1 ? (
            <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-slate-600 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <span>Workspace</span>
              <select
                value={workspace?.id ?? ""}
                onChange={(event) => selectWorkspace(event.target.value)}
                className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 sm:w-auto"
              >
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">
                {shared ? "Shared notebook" : "Personal notebook"}
              </p>
              <h2 className="text-lg font-semibold text-slate-950">
                {draft ? (draft.id ? "Edit note" : "New note") : "Notes history"}
              </h2>
            </div>
          )}

          {(!shared || (!workspacesQuery.isError && workspace)) && (
            <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
              {draft && (
                <button
                  type="button"
                  onClick={() => {
                    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
                    cancelDictation();
                    setDraft(null);
                    setFeedback("");
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:w-auto"
                >
                  <ArrowLeft size={15} />
                  All notes
                </button>
              )}

              <button
                type="button"
                onClick={startNote}
                className="group inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-2xs transition hover:bg-emerald-700 active:scale-[0.99] sm:w-auto"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/15 transition-transform group-hover:scale-105">
                  <FilePlus2 size={15} />
                </span>
                <span>New note</span>
              </button>
            </div>
          )}
        </header>

        {shared && workspacesQuery.isError ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>Workspaces could not be loaded. Try refreshing the page.</span>
          </div>
        ) : shared && !workspace ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-2xs">
            Join a business workspace to create shared notes.
          </div>
        ) : !draft ? (
          /* Notes History View */
          <section aria-label="Notes history" className="space-y-4">
            {feedback && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800"
              >
                <Check size={15} className="shrink-0 text-emerald-600" />
                <span>{feedback}</span>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold text-slate-950">History</h3>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 tabular-nums">
                  {notes.length}
                </span>
              </div>

              <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-500 transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15 sm:w-72">
                <Search size={16} className="shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search notes..."
                  aria-label="Search notes"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>

            {notesQuery.isPending ? (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-400">
                <LoaderCircle className="animate-spin" size={20} />
              </div>
            ) : notesQuery.isError ? (
              <div
                role="alert"
                className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-xs text-rose-800 sm:flex-row sm:items-center"
              >
                <span>
                  {notesQuery.error instanceof Error
                    ? notesQuery.error.message
                    : "Notes could not be loaded."}
                </span>
                <button
                  type="button"
                  onClick={() => void notesQuery.refetch()}
                  className="w-full rounded-lg bg-rose-600 px-3.5 py-2 font-medium text-white transition hover:bg-rose-700 sm:w-auto sm:py-1.5"
                >
                  Try again
                </button>
              </div>
            ) : notes.length ? (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                {notes.map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => chooseNote(note)}
                    className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80 transition-transform group-hover:scale-105">
                      <FileText size={16} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-950 group-hover:text-emerald-700">
                        {note.title || "Untitled note"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {note.body}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>Edited {dateLabel(note.updatedAt)}</span>
                        {note.attachments.length > 0 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                              <Paperclip size={11} className="text-emerald-600" />
                              {note.attachments.length}{" "}
                              {note.attachments.length === 1 ? "file" : "files"}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-14 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400">
                  <FileText size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {search ? "No matching notes" : "No notes yet"}
                </p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  {search
                    ? "Try a different search keyword."
                    : "Create a note to keep plans, reminders, or details connected to your workspace."}
                </p>
                {!search && (
                  <button
                    type="button"
                    onClick={startNote}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:border-emerald-500 hover:text-emerald-700 sm:w-auto"
                  >
                    <Plus size={14} />
                    Write a note
                  </button>
                )}
              </div>
            )}
          </section>
        ) : (
          /* Note Editor View */
          <section className="notes-mobile-editor overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <form onSubmit={saveNote} className="flex flex-col">
              {/* Editor Top Bar */}
              <div className="notes-mobile-editor-header flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">
                    {draft.id ? "EDIT NOTE" : "NEW NOTE"}
                  </p>
                  <p className="notes-mobile-editor-subtitle mt-0.5 text-xs text-slate-500">
                    {selectedNote
                      ? `Last edited ${dateLabel(selectedNote.updatedAt)}`
                      : shared
                        ? "Visible to members of this workspace."
                        : "Only you can see your personal notes."}
                  </p>
                </div>

                <div className="notes-mobile-editor-actions">
                  <button
                    type="button"
                    onClick={() => {
                      if (dirty && !window.confirm("Discard your unsaved changes?")) return;
                      cancelDictation();
                      setDraft(null);
                      setFeedback("");
                    }}
                    className="notes-mobile-close inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft size={14} />
                    <span>All notes</span>
                  </button>
                  {draft.id && (
                    <button
                      type="button"
                      onClick={() => void deleteNote()}
                      disabled={deleteMutation.isPending}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Title & Body */}
              <div className="space-y-4 p-4 sm:p-6">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Title</span>
                  <input
                    value={draft.title}
                    onChange={(event) => {
                      setDraft({ ...draft, title: event.target.value });
                      setFeedback("");
                    }}
                    maxLength={120}
                    required
                    placeholder="Note title"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-lg font-bold tracking-tight text-slate-950 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:text-xl"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Content</span>
                  <textarea
                    value={draft.body}
                    onChange={(event) => {
                      setDraft({ ...draft, body: event.target.value });
                      setFeedback("");
                    }}
                    maxLength={20000}
                    required
                    rows={11}
                    placeholder="Start writing…"
                    className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:p-4"
                  />
                </label>

                {/* Local Model Dictation */}
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void toggleDictation()}
                    disabled={dictationBusy}
                    className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition sm:w-auto ${
                      dictating
                        ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {dictationBusy ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : dictating ? (
                      <Square size={13} />
                    ) : (
                      <Mic size={14} />
                    )}
                    {dictationBusy
                      ? dictationStatus.toLowerCase().includes("transcrib")
                        ? "Transcribing…"
                        : "Preparing…"
                      : dictating
                        ? "Stop dictation"
                        : "Dictate with local model"}
                  </button>
                  <span className="text-xs text-slate-500" role="status" aria-live="polite">
                    {dictationStatus ||
                      "The model is cached in this browser after first use. Your speech is transcribed locally as you speak."}
                  </span>
                </div>

                {dictationError && (
                  <p
                    role="alert"
                    className="flex items-center gap-1.5 text-xs font-medium text-rose-700"
                  >
                    <AlertCircle size={14} className="shrink-0 text-rose-600" />
                    <span>{dictationError}</span>
                  </p>
                )}

                {/* Attached Documents */}
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold text-slate-700">
                    Attached documents ({draft.fileIds.length})
                  </legend>
                  {filesQuery.isPending ? (
                    <p className="text-xs text-slate-500">Loading documents…</p>
                  ) : files.length ? (
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                      {files.map((file) => (
                        <label
                          key={file.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-slate-700 transition hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={draft.fileIds.includes(file.id)}
                            onChange={(event) => {
                              setDraft({
                                ...draft,
                                fileIds: event.target.checked
                                  ? [...draft.fileIds, file.id]
                                  : draft.fileIds.filter((id) => id !== file.id),
                              });
                              setFeedback("");
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <span className="truncate">{fileLabel(file)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs text-slate-500">
                      Upload documents in Files first, then attach them here.
                    </p>
                  )}
                </fieldset>

                {/* Save Footer */}
                <div className="notes-mobile-editor-footer flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-slate-500" role="status">
                    {saveMutation.isPending
                      ? "Saving…"
                      : saveMutation.isError
                        ? saveMutation.error.message
                        : feedback || (dirty ? "Unsaved changes" : "All changes saved")}
                  </span>

                  <button
                    type="submit"
                    disabled={
                      !dirty ||
                      !draft.title.trim() ||
                      !draft.body.trim() ||
                      saveMutation.isPending ||
                      dictating ||
                      dictationBusy
                    }
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  >
                    {draft.id ? "Save changes" : "Save note"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}
      </main>
    </PageShell>
  );
}

export default NotesPage;