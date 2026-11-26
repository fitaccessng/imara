import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { PageShell } from "../pages/PageShell";
import { apiRequest } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import type { WorkspaceMember } from "../workspaces/types";
import { fileLabel, type ProductivityFile, type Task, type TaskStatus } from "./types";
import "./mobileCreateForms.css";

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

type StatusFilter = "ALL" | TaskStatus;

const STATUS_META: Record<
  TaskStatus,
  {
    label: string;
    badgeClass: string;
    barClass: string;
  }
> = {
  TODO: {
    label: "To do",
    badgeClass: "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80",
    barClass: "bg-[#09294b]",
  },
  IN_PROGRESS: {
    label: "In progress",
    badgeClass: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/80",
    barClass: "bg-[#22c55e]",
  },
  BLOCKED: {
    label: "Blocked",
    badgeClass: "bg-[#ff9300]/15 text-[#9a5200] ring-1 ring-[#ff9300]/35",
    barClass: "bg-[#ff9300]",
  },
  DONE: {
    label: "Done",
    badgeClass: "bg-[#20ad43]/12 text-[#157a2e] ring-1 ring-[#20ad43]/30",
    barClass: "bg-[#20ad43]",
  },
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
  return {
    title: "",
    description: "",
    status: "TODO",
    progress: 0,
    dueAt: "",
    assigneeUserId: "",
    fileIds: [],
  };
}

export function TasksPage({ shared = false }: { shared?: boolean }) {
  const { workspaces, workspace, workspacesQuery, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
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

  const metrics = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
    const active = total - done;
    return { total, done, blocked, active };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === "ALL") return tasks;
    return tasks.filter((task) => task.status === filter);
  }, [tasks, filter]);

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
      <main className="mx-auto max-w-[1160px] space-y-6 px-1 pb-12">
        {/* Workspace Selector Bar */}
        {shared && workspaces.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
            <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
              <span>Active Workspace</span>
              <select
                value={workspace?.id ?? ""}
                onChange={(event) => selectWorkspace(event.target.value)}
                className="min-h-11 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm font-semibold text-[#09294b] transition focus:border-[#09294b] focus:bg-white focus:outline-none"
              >
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs font-medium text-slate-500">
              Scoped to {workspace?.name ?? "workspace"}
            </span>
          </div>
        )}

        {shared && workspacesQuery.isError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-800 shadow-sm"
          >
            <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={18} />
            <p>Workspaces could not be loaded. Try refreshing the page.</p>
          </div>
        ) : shared && !workspace ? (
          <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-[#09294b]">No shared workspace selected</p>
            <p className="mt-1 text-sm text-slate-600">
              Join a business workspace to create and manage shared tasks.
            </p>
          </div>
        ) : (
          <>
            {/* Bento Overview Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Total Tasks
                </p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#09294b]">
                  {metrics.total}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#09294b]/70">
                  Active Work
                </p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#09294b]">
                  {metrics.active}
                </p>
              </div>
              <div className="rounded-2xl border border-[#ff9300]/25 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#b46000]">
                  Blocked
                </p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#ff9300]">
                  {metrics.blocked}
                </p>
              </div>
              <div className="rounded-2xl border border-[#20ad43]/25 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#20ad43]">
                  Completed
                </p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#20ad43]">
                  {metrics.done}
                </p>
              </div>
            </section>

            {/* Main Workspace Split */}
            <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,.85fr)]">
              {/* Task Feed Column */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#20ad43]">
                      WORK IN MOTION
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Showing {filteredTasks.length} of {tasks.length}{" "}
                      {tasks.length === 1 ? "task" : "tasks"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setDraft(emptyDraft());
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#09294b] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A192F] active:scale-[0.99]"
                  >
                    <Plus size={17} />
                    <span>New task</span>
                  </button>
                </div>

                {/* Filter Pills */}
                {tasks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFilter("ALL")}
                      className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                        filter === "ALL"
                          ? "bg-[#09294b] text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      All ({tasks.length})
                    </button>
                    {statuses.map((st) => {
                      const count = tasks.filter((t) => t.status === st.value).length;
                      const activeFilter = filter === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          onClick={() => setFilter(st.value)}
                          className={`min-h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                            activeFilter
                              ? "bg-[#09294b] text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {st.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {tasksQuery.isPending ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="h-32 animate-pulse rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
                      />
                    ))}
                  </div>
                ) : tasksQuery.isError ? (
                  <div className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
                    <p className="font-medium">{tasksQuery.error.message}</p>
                    <button
                      type="button"
                      className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-red-50 px-3 font-semibold text-red-800 hover:bg-red-100"
                      onClick={() => void tasksQuery.refetch()}
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredTasks.length ? (
                  <div className="space-y-3">
                    {filteredTasks.map((task) => {
                      const meta = STATUS_META[task.status];
                      const isSelected = draft?.id === task.id;
                      const isDone = task.status === "DONE";

                      return (
                        <article
                          key={task.id}
                          className={`group rounded-2xl border bg-white p-4 transition duration-150 sm:p-5 ${
                            isSelected
                              ? "border-[#20ad43] ring-2 ring-[#20ad43]/20 shadow-md"
                              : "border-slate-200/70 shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => editTask(task)}
                              className="min-w-0 flex-1 text-left focus:outline-none"
                            >
                              <div className="flex items-start gap-2.5">
                                {isDone ? (
                                  <CheckCircle2
                                    className="mt-0.5 shrink-0 text-[#20ad43]"
                                    size={19}
                                  />
                                ) : task.status === "BLOCKED" ? (
                                  <AlertCircle
                                    className="mt-0.5 shrink-0 text-[#ff9300]"
                                    size={19}
                                  />
                                ) : (
                                  <Circle
                                    className="mt-0.5 shrink-0 text-slate-400 transition group-hover:text-[#09294b]"
                                    size={19}
                                  />
                                )}
                                <h3
                                  className={`text-base font-semibold leading-snug ${
                                    isDone
                                      ? "text-slate-500 line-through decoration-slate-300"
                                      : "text-[#09294b]"
                                  }`}
                                >
                                  {task.title}
                                </h3>
                              </div>

                              {task.description && (
                                <p className="mt-2 pl-7 text-sm leading-relaxed text-slate-600 line-clamp-2">
                                  {task.description}
                                </p>
                              )}

                              <div className="mt-3.5 flex flex-wrap items-center gap-2 pl-7 text-xs font-medium">
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-1 ${meta.badgeClass}`}
                                >
                                  {meta.label}
                                </span>

                                {task.dueAt && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#ff9300]/10 px-2.5 py-1 text-[#9a5200]">
                                    <CalendarClock size={13} />
                                    Due{" "}
                                    {new Intl.DateTimeFormat(undefined, {
                                      dateStyle: "medium",
                                    }).format(new Date(task.dueAt))}
                                  </span>
                                )}

                                {shared && task.assignee?.user && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#20ad43]/10 px-2.5 py-1 text-[#157a2e]">
                                    <UserCheck size={13} />
                                    {task.assignee.user.name}
                                  </span>
                                )}
                              </div>
                            </button>

                            <button
                              type="button"
                              aria-label={`Delete ${task.title}`}
                              onClick={() => {
                                if (window.confirm(`Delete “${task.title}”?`)) {
                                  remove.mutate(task.id);
                                }
                              }}
                              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-700 active:scale-95"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-4 flex items-center gap-3 pl-7">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${meta.barClass}`}
                                style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {task.progress}%
                            </span>
                          </div>

                          {/* Attachments */}
                          {task.attachments.length > 0 && (
                            <div className="mt-3 flex items-center gap-1.5 pl-7 text-xs text-slate-500">
                              <FileText size={13} className="shrink-0 text-slate-400" />
                              <span className="truncate">
                                {task.attachments.map(({ file }) => fileLabel(file)).join(", ")}
                              </span>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#20ad43]/10 text-[#20ad43]">
                      <ClipboardList size={24} />
                    </div>
                    <p className="mt-3.5 text-base font-semibold text-[#09294b]">
                      {filter === "ALL"
                        ? "Your task list is clear"
                        : `No ${STATUS_META[filter].label.toLowerCase()} tasks`}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {filter === "ALL"
                        ? "Add a task or turn a meeting action item into one."
                        : "Switch filters or create a new task to get started."}
                    </p>
                  </div>
                )}
              </div>

              {/* Editor Panel */}
              {draft && (
                <form
                  onSubmit={submit}
                  className="tasks-mobile-editor space-y-4 rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-md backdrop-blur-md lg:sticky lg:top-6"
                >
                  <div className="tasks-mobile-editor-header flex items-center justify-between border-b border-slate-100 pb-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles size={17} className="text-[#20ad43]" />
                        <h2 className="text-lg font-semibold text-[#09294b]">
                          {draft.id ? "Edit task" : "Create a task"}
                        </h2>
                      </div>
                      <p className="tasks-mobile-editor-subtitle mt-1 text-xs text-slate-500">
                        Keep the next step clear and easy to act on.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close task editor"
                      onClick={() => setDraft(null)}
                      className="tasks-mobile-close inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X size={17} />
                    </button>
                  </div>

                  <label className="block text-sm font-medium text-[#09294b]">
                    Task title
                    <input
                      required
                      maxLength={200}
                      placeholder="e.g., Finalize Q4 vendor contract"
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition focus:border-[#09294b] focus:bg-white focus:outline-none"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#09294b]">
                    Details
                    <textarea
                      maxLength={10000}
                      placeholder="Add context, links, or next steps…"
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                      className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm text-slate-900 transition focus:border-[#09294b] focus:bg-white focus:outline-none"
                    />
                  </label>

                  {/* Segmented Status Selector */}
                  <div className="space-y-1.5">
                    <span className="block text-sm font-medium text-[#09294b]">Status</span>
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5">
                      {statuses.map((item) => {
                        const selected = draft.status === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setDraft({ ...draft, status: item.value })}
                            className={`min-h-10 rounded-lg px-2.5 text-xs font-semibold transition ${
                              selected
                                ? "bg-[#09294b] text-white shadow-sm"
                                : "text-slate-600 hover:bg-white/70 hover:text-[#09294b]"
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block text-sm font-medium text-[#09294b]">
                    Deadline
                    <input
                      type="datetime-local"
                      value={draft.dueAt}
                      onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition focus:border-[#09294b] focus:bg-white focus:outline-none"
                    />
                  </label>

                  <label className="block text-sm font-medium text-[#09294b]">
                    <span className="flex items-center justify-between">
                      <span>Progress</span>
                      <span className="rounded-md bg-[#20ad43]/12 px-2 py-0.5 text-xs font-bold tabular-nums text-[#157a2e]">
                        {draft.progress}%
                      </span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={draft.progress}
                      onChange={(event) =>
                        setDraft({ ...draft, progress: Number(event.target.value) })
                      }
                      className="mt-2.5 h-2 w-full cursor-pointer accent-[#20ad43]"
                    />
                  </label>

                  {shared && (
                    <label className="block text-sm font-medium text-[#09294b]">
                      Assign to
                      <select
                        value={draft.assigneeUserId}
                        onChange={(event) =>
                          setDraft({ ...draft, assigneeUserId: event.target.value })
                        }
                        className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-sm text-slate-900 transition focus:border-[#09294b] focus:bg-white focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {activeMembers.map((member) => (
                          <option key={member.user.id} value={member.user.id}>
                            {member.user.name} · {member.user.email}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-[#09294b]">
                      Attach documents
                    </legend>
                    {filesQuery.isPending ? (
                      <span className="block text-xs text-slate-500">Loading documents…</span>
                    ) : filesQuery.isError ? (
                      <span role="alert" className="block text-xs text-red-700">
                        {filesQuery.error.message}
                      </span>
                    ) : files.length ? (
                      <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-2">
                        {files.map((file) => {
                          const checked = draft.fileIds.includes(file.id);
                          return (
                            <label
                              key={file.id}
                              className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                                checked
                                  ? "bg-[#20ad43]/10 text-[#09294b]"
                                  : "text-slate-700 hover:bg-white"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    fileIds: event.target.checked
                                      ? [...draft.fileIds, file.id]
                                      : draft.fileIds.filter((id) => id !== file.id),
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300 accent-[#20ad43]"
                              />
                              <span className="truncate">{fileLabel(file)}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                        Upload documents in Files first, then attach them here.
                      </p>
                    )}
                  </fieldset>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    >
                      {error}
                    </p>
                  )}

                  <div className="tasks-mobile-editor-footer flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={save.isPending}
                      className="min-h-11 flex-1 rounded-xl bg-[#20ad43] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1b9639] active:scale-[0.99] disabled:opacity-50"
                    >
                      {save.isPending ? "Saving…" : draft.id ? "Update task" : "Save task"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </main>
    </PageShell>
  );
}