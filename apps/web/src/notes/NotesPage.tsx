import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Search, Trash2 } from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { apiRequest } from "../lib/api";

interface PersonalNote {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface NoteDraft {
  id: string | null;
  title: string;
  body: string;
  originalTitle: string;
  originalBody: string;
}

function isDirty(draft: NoteDraft | null) {
  return Boolean(draft && (
    draft.title !== draft.originalTitle || draft.body !== draft.originalBody
  ));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function NotesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  const notesQuery = useQuery({
    queryKey: ["personal-notes", search],
    queryFn: () => apiRequest<PersonalNote[]>(`/notes${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`),
  });

  const notes = useMemo(() => notesQuery.data ?? [], [notesQuery.data]);
  const selectedNote = draft?.id ? notes.find((note) => note.id === draft.id) : undefined;
  const dirty = isDirty(draft);

  const saveMutation = useMutation({
    mutationFn: async (value: NoteDraft) => {
      const payload = { title: value.title.trim(), body: value.body.trim() };
      return value.id
        ? apiRequest<PersonalNote>(`/notes/${encodeURIComponent(value.id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : apiRequest<PersonalNote>("/notes", {
            method: "POST",
            body: JSON.stringify(payload),
          });
    },
    onSuccess: async (note) => {
      await queryClient.invalidateQueries({ queryKey: ["personal-notes"] });
      setDraft({
        id: note.id,
        title: note.title,
        body: note.body,
        originalTitle: note.title,
        originalBody: note.body,
      });
      setFeedback("Note saved.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personal-notes"] });
      setDraft(null);
      setFeedback("Note deleted.");
    },
  });

  function chooseNote(note: PersonalNote) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setFeedback("");
    setDraft({
      id: note.id,
      title: note.title,
      body: note.body,
      originalTitle: note.title,
      originalBody: note.body,
    });
  }

  function startNote() {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setFeedback("");
    setDraft({ id: null, title: "", body: "", originalTitle: "", originalBody: "" });
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
      eyebrow="PERSONAL SPACE"
      title="IMARA Notes"
      description="Keep quick thoughts, plans and useful details close to your documents."
    >
      <main className="mx-auto grid w-full max-w-[1200px] gap-5 pb-8 lg:grid-cols-[320px_minmax(0,1fr)]">
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
              <p className="p-4 text-sm text-[#718096]">Loading your notes…</p>
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
                  <p className="mt-1 text-xs text-[#718096]">{selectedNote ? `Last edited ${dateLabel(selectedNote.updatedAt)}` : "Only you can see your personal notes."}</p>
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
      </main>
    </PageShell>
  );
}

export default NotesPage;
