import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2 } from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { apiRequest } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import type { WorkspaceMember } from "../workspaces/types";
import { fileLabel, type ProductivityFile, type Task, type TaskStatus } from "./types";

type TaskDraft = {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number;
  dueAt: string;
  assigneeUserId: string;
  fileIds: string[];
};

const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
];

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyDraft(): TaskDraft {
  return { title: "", description: "", status: "TODO", progress: 0, dueAt: "", assigneeUserId: "", fileIds: [] };
}

export function TasksPage({ shared = false }: { shared?: boolean }) {
  const { workspaces, workspace, workspacesQuery, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [error, setError] = useState("");
  const scopeId = shared ? workspace?.id : null;
  const taskPath = shared ? `/workspaces/${scopeId}/tasks` : "/tasks";
  const filesPath = shared ? `/workspaces/${scopeId}/storage` : "/files";

  const tasksQuery = useQuery({
    queryKey: ["productivity-tasks", scopeId ?? "personal"],
    queryFn: () => apiRequest<Task[]>(taskPath),
    enabled: !shared || Boolean(scopeId),
  });
  const filesQuery = useQuery({
    queryKey: ["productivity-files", scopeId ?? "personal"],
    queryFn: () => apiRequest<{ files: ProductivityFile[] }>(filesPath),
    enabled: Boolean(draft) && (!shared || Boolean(scopeId)),
  });
  const membersQuery = useQuery({
    queryKey: ["workspace-productivity-members", scopeId],
    queryFn: () => apiRequest<WorkspaceMember[]>(`/workspaces/${scopeId}/members`),
    enabled: Boolean(shared && scopeId && draft),
  });

  const tasks = tasksQuery.data ?? [];
  const files = filesQuery.data?.files ?? [];
  const activeMembers = useMemo(
    () => (membersQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [membersQuery.data],
  );
  const save = useMutation({
    mutationFn: async (value: TaskDraft) => {
      const payload = {
        title: value.title.trim(),
        description: value.description.trim() || null,
        status: value.status,
        progress: value.progress,
        dueAt: value.dueAt ? new Date(value.dueAt).toISOString() : null,
        fileIds: value.fileIds,
        ...(shared ? { assigneeUserId: value.assigneeUserId || null } : {}),
      };
      return apiRequest<Task>(value.id ? `${taskPath}/${value.id}` : taskPath, {
        method: value.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["productivity-tasks", scopeId ?? "personal"] });
      setDraft(null);
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The task could not be saved."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`${taskPath}/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["productivity-tasks", scopeId ?? "personal"] });
      setDraft(null);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The task could not be deleted."),
  });

  function editTask(task: Task) {
    setError("");
    setDraft({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      progress: task.progress,
      dueAt: localDate(task.dueAt),
      assigneeUserId: activeMembers.find((member) => member.user.id === task.assignee?.user.id)?.user.id ?? "",
      fileIds: task.attachments.map(({ fileId }) => fileId),
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.title.trim()) {
      setError("Add a task title.");
      return;
    }
    save.mutate(draft);
  }

  return (
    <PageShell
      eyebrow={shared ? "BUSINESS WORKSPACE" : "PERSONAL SPACE"}
      title="IMARA Tasks"
      description="Turn documents and meeting follow-ups into assigned work with clear due dates."
    >
      <main className="mx-auto max-w-[1100px] space-y-5 pb-10">
        {shared && workspaces.length > 1 && (
          <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            Workspace
            <select value={workspace?.id ?? ""} onChange={(event) => selectWorkspace(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900">
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        {shared && workspacesQuery.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">Workspaces could not be loaded. Try refreshing the page.</p>
          : shared && !workspace ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Join a business workspace to create shared tasks.</p>
            : (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-700">WORK IN MOTION</p><p className="mt-1 text-sm text-slate-500">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</p></div>
                    <button type="button" onClick={() => { setError(""); setDraft(emptyDraft()); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#102B46] px-4 text-sm font-semibold text-white"><Plus size={16} /> New task</button>
                  </div>
                  {tasksQuery.isPending ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading tasks…</p>
                    : tasksQuery.isError ? <div className="rounded-2xl bg-white p-6 text-sm text-red-700"><p>{tasksQuery.error.message}</p><button className="mt-2 underline" onClick={() => void tasksQuery.refetch()}>Try again</button></div>
                      : tasks.length ? tasks.map((task) => (
                        <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <button onClick={() => editTask(task)} className="min-w-0 flex-1 text-left">
                              <span className="flex items-center gap-2 text-base font-semibold text-slate-900">{task.status === "DONE" ? <CheckCircle2 className="shrink-0 text-emerald-600" size={18} /> : <Circle className="shrink-0 text-slate-400" size={18} />}{task.title}</span>
                              {task.description && <span className="mt-2 block text-sm leading-6 text-slate-600">{task.description}</span>}
                              <span className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1">{statuses.find((item) => item.value === task.status)?.label}</span>
                                {task.dueAt && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Due {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(task.dueAt))}</span>}
                                {shared && task.assignee?.user && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{task.assignee.user.name}</span>}
                              </span>
                            </button>
                            <button type="button" aria-label={`Delete ${task.title}`} onClick={() => {
                              if (window.confirm(`Delete “${task.title}”?`)) remove.mutate(task.id);
                            }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button>
                          </div>
                          <div className="mt-4 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${task.progress}%` }} /></div>
                            <span className="text-xs font-semibold text-slate-500">{task.progress}%</span>
                          </div>
                          {task.attachments.length > 0 && <p className="mt-3 text-xs text-slate-500">Documents: {task.attachments.map(({ file }) => fileLabel(file)).join(", ")}</p>}
                        </article>
                      )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><ClipboardList className="mx-auto text-emerald-700" size={25} /><p className="mt-3 font-semibold text-slate-900">Your task list is clear</p><p className="mt-1 text-sm text-slate-500">Add a task or turn a meeting action item into one.</p></div>}
                </div>

                {draft && <form onSubmit={submit} className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{draft.id ? "Edit task" : "Create a task"}</h2><button type="button" onClick={() => setDraft(null)} className="text-sm text-slate-500">Close</button></div>
                  <label className="block text-sm font-medium text-slate-700">Task title<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-slate-900" /></label>
                  <label className="block text-sm font-medium text-slate-700">Details<textarea maxLength={10000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-slate-900" /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3">{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <label className="block text-sm font-medium text-slate-700">Deadline<input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">Progress <span className="font-normal text-slate-500">{draft.progress}%</span><input type="range" min="0" max="100" step="5" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: Number(event.target.value) })} className="mt-2 w-full accent-emerald-600" /></label>
                  {shared && <label className="block text-sm font-medium text-slate-700">Assign to<select value={draft.assigneeUserId} onChange={(event) => setDraft({ ...draft, assigneeUserId: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3"><option value="">Unassigned</option>{activeMembers.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {member.user.email}</option>)}</select></label>}
                  <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">Attach documents</legend>                  {filesQuery.isPending ? <span className="text-xs text-slate-500">Loading documents…</span> : filesQuery.isError ? <span role="alert" className="text-xs text-red-700">{filesQuery.error.message}</span> : files.length ? <div className="max-h-36 space-y-1 overflow-auto rounded-xl border border-slate-100 p-2">{files.map((file) => <label key={file.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={draft.fileIds.includes(file.id)} onChange={(event) => setDraft({ ...draft, fileIds: event.target.checked ? [...draft.fileIds, file.id] : draft.fileIds.filter((id) => id !== file.id) })} />{fileLabel(file)}</label>)}</div> : <span className="text-xs text-slate-500">Upload documents in Files first, then attach them here.</span>}</fieldset>
                  {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                  <button disabled={save.isPending} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? "Saving…" : "Save task"}</button>
                </form>}
              </section>
            )}
      </main>
    </PageShell>
  );
}
