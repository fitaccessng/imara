import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BellRing, CalendarDays, Check, Clock3, Plus, Repeat2, X } from "lucide-react";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import type { WorkspaceMember } from "../workspaces/types";
import { apiRequest } from "../lib/api";
import { WorkspaceSetupPrompt } from "../workspaces/WorkspaceSetupPrompt";
import "./reminders.css";

type Recurrence = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";
interface Reminder {
  id: string;
  title: string;
  description: string | null;
  dueAt: string;
  nextDueAt: string | null;
  recurrence: Recurrence;
  emailEnabled: boolean;
  completedAt: string | null;
  lastCompletedAt: string | null;
  cancelledAt: string | null;
  creator: { id: string; name: string };
  assignee: { id: string; name: string };
}

const recurrenceLabels: Record<Recurrence, string> = {
  ONCE: "One time",
  DAILY: "Every day",
  WEEKLY: "Every week",
  MONTHLY: "Every month",
};
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function RemindersPage() {
  const { workspacesQuery, workspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dayKey(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [recurrence, setRecurrence] = useState<Recurrence>("ONCE");
  const [assignee, setAssignee] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);

  const remindersQuery = useQuery({
    queryKey: ["workspace-reminders", workspace?.id],
    queryFn: () => apiRequest<Reminder[]>(`/workspaces/${workspace?.id}/reminders`),
    enabled: Boolean(workspace),
  });
  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: () => apiRequest<WorkspaceMember[]>(`/workspaces/${workspace?.id}/members`),
    enabled: Boolean(workspace && formOpen),
  });
  const members = (membersQuery.data ?? []).filter((member) => member.status === "ACTIVE");
  const reminders = remindersQuery.data ?? [];
  const activeReminders = reminders.filter((reminder) => !reminder.completedAt && !reminder.cancelledAt);
  const todayKey = dayKey(new Date());
  const dueTodayCount = activeReminders.filter((reminder) => dayKey(new Date(reminder.nextDueAt ?? reminder.dueAt)) === todayKey).length;
  const recurringCount = activeReminders.filter((reminder) => reminder.recurrence !== "ONCE").length;
  const monthDays = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - startOffset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const remindersByDay = useMemo(() => {
    const map = new Map<string, Reminder[]>();
    for (const reminder of activeReminders) {
      const date = new Date(reminder.nextDueAt ?? reminder.dueAt);
      const key = dayKey(date);
      map.set(key, [...(map.get(key) ?? []), reminder]);
    }
    return map;
  }, [activeReminders]);
  const selectedReminders = remindersByDay.get(selectedDate) ?? [];
  const selected = new Date(`${selectedDate}T12:00:00`);
  const selectedIsToday = selectedDate === dayKey(new Date());

  const createMutation = useMutation({
    mutationFn: () => apiRequest<Reminder>(`/workspaces/${workspace!.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description: description.trim() || undefined,
        dueAt: new Date(dueAt).toISOString(),
        recurrence,
        assignedToUserId: assignee || undefined,
        emailEnabled,
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-reminders", workspace?.id] });
      setTitle("");
      setDescription("");
      setFormOpen(false);
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The reminder could not be saved."),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "complete" | "cancel" }) =>
      apiRequest(`/workspaces/${workspace!.id}/reminders/${id}/${action}`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-reminders", workspace?.id] });
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The reminder could not be updated."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    createMutation.mutate();
  }

  function shiftMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  if (workspacesQuery.isLoading) return <div className="reminder-loading">Loading business workspaces…</div>;
  if (workspacesQuery.isError) return <div className="reminder-error" role="alert">Workspaces couldn’t load. {workspacesQuery.error.message}</div>;
  if (!workspace) return <WorkspaceSetupPrompt
    title="Make room for work that matters."
    description="Create a business workspace to assign reminders, plan with your team and keep the next important step in view."
  />;

  return (
    <main className="reminders-page">
      <header className="reminders-heading">
        <div>
          <p className="reminder-kicker"><span /> WORKSPACE PLANNER</p>
          <h1>Reminders</h1>
          <p className="reminders-intro">Keep important work visible, assigned and moving forward.</p>
        </div>
        <button className="reminder-create-button" onClick={() => { setError(""); setFormOpen(true); }}>
          <Plus size={17} /> New reminder
        </button>
      </header>

      <section className="reminder-overview" aria-label="Reminder overview">
        <div><span className="reminder-overview-mark"><BellRing size={16} /></span><span className="reminder-overview-label">ACTIVE REMINDERS</span><strong>{activeReminders.length}</strong><small>Still in motion</small></div>
        <div><span className="reminder-overview-mark"><CalendarDays size={16} /></span><span className="reminder-overview-label">DUE TODAY</span><strong>{dueTodayCount}</strong><small>On today’s agenda</small></div>
        <div><span className="reminder-overview-mark"><Repeat2 size={16} /></span><span className="reminder-overview-label">REPEATING</span><strong>{recurringCount}</strong><small>Keep the rhythm going</small></div>
      </section>

      {error && <div className="reminder-error" role="alert">{error}</div>}
      {remindersQuery.isError && <div className="reminder-error" role="alert">Reminders couldn’t load. {remindersQuery.error.message}</div>}

      <section className="reminder-planner">
        <div className="calendar-pane">
          <div className="calendar-toolbar">
            <div>
              <span className="calendar-overline">YOUR CALENDAR</span>
              <h2>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month)}</h2>
            </div>
            <div className="calendar-controls">
              <button aria-label="Previous month" onClick={() => shiftMonth(-1)}><ArrowLeft size={17} /></button>
              <button className="calendar-today" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDate(dayKey(new Date())); }}>Today</button>
              <button aria-label="Next month" onClick={() => shiftMonth(1)}><ArrowRight size={17} /></button>
            </div>
          </div>
          <div className="calendar-grid" role="grid" aria-label="Reminders calendar">
            {weekDays.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
            {monthDays.map((date) => {
              const key = dayKey(date);
              const count = remindersByDay.get(key)?.length ?? 0;
              const outsideMonth = date.getMonth() !== month.getMonth();
              return (
                <button
                  key={key}
                  role="gridcell"
                  aria-label={`${longDate.format(date)}${count ? `, ${count} reminders` : ""}`}
                  aria-pressed={selectedDate === key}
                  className={`calendar-day${outsideMonth ? " calendar-day-outside" : ""}${selectedDate === key ? " calendar-day-selected" : ""}${key === dayKey(new Date()) ? " calendar-day-today" : ""}`}
                  onClick={() => { setSelectedDate(key); if (outsideMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}
                >
                  <span>{date.getDate()}</span>
                  {count > 0 && <i className="calendar-day-marker" aria-hidden="true">{count > 3 ? "3+" : count}</i>}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend"><i /> Scheduled reminders <span>{activeReminders.length} active</span></div>
        </div>

        <aside className="agenda-pane">
          <div className="agenda-heading">
            <div>
              <span className="calendar-overline">{selectedIsToday ? "TODAY" : "DAY AGENDA"}</span>
              <h2>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(selected)}</h2>
            </div>
            <button aria-label="Create reminder" onClick={() => setFormOpen(true)}><Plus size={18} /></button>
          </div>
          <p className="agenda-date">{longDate.format(selected)}</p>
          <div className="agenda-list">
            {remindersQuery.isLoading ? <p className="agenda-empty">Loading reminders…</p> : selectedReminders.length === 0 ? (
              <div className="agenda-empty">
                <span><CalendarDays size={19} /></span>
                <strong>Nothing scheduled</strong>
                <p>A little breathing room in the calendar.</p>
              </div>
            ) : selectedReminders.map((reminder) => (
              <article className="agenda-item" key={reminder.id}>
                <div className="agenda-item-time">{timeFormat.format(new Date(reminder.nextDueAt ?? reminder.dueAt))}</div>
                <div className="agenda-item-rule" />
                <div className="agenda-item-copy">
                  <strong>{reminder.title}</strong>
                  {reminder.description && <p>{reminder.description}</p>}
                  <div className="agenda-meta">
                    <span><Clock3 size={12} /> {reminder.assignee.name}</span>
                    {reminder.recurrence !== "ONCE" && <span><Repeat2 size={12} /> {recurrenceLabels[reminder.recurrence]}</span>}
                    {reminder.emailEnabled && <span><BellRing size={12} /> Email alert</span>}
                  </div>
                  <div className="agenda-actions">
                    <button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ id: reminder.id, action: "complete" })}><Check size={14} /> Done</button>
                    <button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ id: reminder.id, action: "cancel" })}><X size={14} /> Cancel</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="reminder-bottom-strip">
        <span className="reminder-strip-icon"><Repeat2 size={18} /></span>
        <div><strong>Set the rhythm, not another alarm.</strong><p>Recurring reminders move to their next date when a new cycle begins.</p></div>
        <span className="reminder-strip-count">{activeReminders.length}<small>UPCOMING</small></span>
      </section>

      {formOpen && (
        <div className="reminder-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
          <section className="reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-form-title">
            <header><div><span className="calendar-overline">ADD TO THE PLANNER</span><h2 id="reminder-form-title">New reminder</h2></div><button aria-label="Close form" onClick={() => setFormOpen(false)}><X size={19} /></button></header>
            <form onSubmit={submit}>
              <label>What needs to happen?<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="e.g. Review supplier agreement" /></label>
              <label>Details <span className="optional-label">OPTIONAL</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="Add a note for the person responsible" /></label>
              <div className="reminder-form-row">
                <label>Due date and time<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
                <label>Repeats<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>{Object.entries(recurrenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              </div>
              <label>Assign to<select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Myself</option>{members.map((member) => <option value={member.user.id} key={member.id}>{member.displayName?.trim() || member.user.name}</option>)}</select></label>
              <label className="reminder-email-option"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} /><span><strong>Also send an email alert</strong><small>In-app notification will always be delivered.</small></span></label>
              {membersQuery.isError && <p className="reminder-form-error">Workspace members couldn’t load. {membersQuery.error.message}</p>}
              <footer><button type="button" className="reminder-cancel-button" onClick={() => setFormOpen(false)}>Not now</button><button type="submit" className="reminder-create-button" disabled={createMutation.isPending}>{createMutation.isPending ? "Saving…" : "Create reminder"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
