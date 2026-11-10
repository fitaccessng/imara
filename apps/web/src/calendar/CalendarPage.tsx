import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Pencil, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { WorkspaceSetupPrompt } from "../workspaces/WorkspaceSetupPrompt";
import "./calendar.css";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  createdByUserId: string;
  creator?: { id: string; name: string };
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function initialTimes(selectedDate: string) {
  const start = new Date(`${selectedDate}T09:00:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: localInputValue(start), endsAt: localInputValue(end) };
}

export function CalendarPage({ shared = false }: { shared?: boolean }) {
  const { user } = useAuth();
  const { workspacesQuery, workspace } = useWorkspaceScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspaceId = shared ? workspace?.id : undefined;
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dayKey(now));
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(() => initialTimes(dayKey(now)).startsAt);
  const [endsAt, setEndsAt] = useState(() => initialTimes(dayKey(now)).endsAt);
  const [allDay, setAllDay] = useState(false);
  const [error, setError] = useState("");
  const eventsPath = shared
    ? `/workspaces/${workspaceId}/calendar/events`
    : "/calendar/events";
  const eventsQuery = useQuery({
    queryKey: ["calendar-events", shared ? workspaceId : "personal"],
    queryFn: () => apiRequest<CalendarEvent[]>(eventsPath),
    enabled: !shared || Boolean(workspaceId),
  });
  const canEditAll = shared && (workspace?.role === "OWNER" || workspace?.role === "ADMIN");
  const events = eventsQuery.data ?? [];
  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const start = new Date(event.startsAt);
      const end = new Date(event.endsAt);
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const finalDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (date <= finalDate) {
        const key = dayKey(date);
        map.set(key, [...(map.get(key) ?? []), event]);
        date.setDate(date.getDate() + 1);
      }
    }
    return map;
  }, [events]);
  const selectedEvents = eventsByDay.get(selectedDate) ?? [];
  const selected = new Date(`${selectedDate}T12:00:00`);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["calendar-events", shared ? workspaceId : "personal"] });
  };
  const saveEvent = useMutation({
    mutationFn: () => apiRequest<CalendarEvent>(editing ? `${eventsPath}/${editing.id}` : eventsPath, {
      method: editing ? "PATCH" : "POST",
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        allDay,
      }),
    }),
    onSuccess: async () => {
      await refresh();
      closeForm();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The calendar item could not be saved."),
  });
  const deleteEvent = useMutation({
    mutationFn: (id: string) => apiRequest(`${eventsPath}/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The calendar item could not be deleted."),
  });

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setTitle("");
    setDescription("");
    setAllDay(false);
    setError("");
  }

  function openCreate() {
    const times = initialTimes(selectedDate);
    setEditing(null);
    setTitle("");
    setDescription("");
    setStartsAt(times.startsAt);
    setEndsAt(times.endsAt);
    setAllDay(false);
    setError("");
    setFormOpen(true);
  }

  function openEdit(event: CalendarEvent) {
    setEditing(event);
    setTitle(event.title);
    setDescription(event.description ?? "");
    setStartsAt(localInputValue(new Date(event.startsAt)));
    setEndsAt(localInputValue(new Date(event.endsAt)));
    setAllDay(event.allDay);
    setError("");
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("The end time must be after the start time.");
      return;
    }
    saveEvent.mutate();
  }

  function selectWorkspace(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("workspace", id);
    setSearchParams(next);
  }

  if (shared && workspacesQuery.isLoading) return <div className="calendar-loading">Loading your workspace…</div>;
  if (shared && workspacesQuery.isError) return <div className="calendar-error" role="alert">Your workspace couldn’t load. {workspacesQuery.error.message}</div>;
  if (shared && !workspace) return <WorkspaceSetupPrompt
    title="Plan with your team."
    description="Create a business workspace to add shared calendar items, visible to your active team members."
  />;
  if (eventsQuery.isLoading) return <div className="calendar-loading">Loading calendar…</div>;

  return (
    <main className="imara-calendar">
      <header className="calendar-page-heading">
        <div>
          <span className="calendar-kicker"><i /> {shared ? "TEAM PLANNER" : "YOUR SPACE"}</span>
          <h1>{shared ? "Shared calendar" : "Calendar"}<span className="heading-period">.</span></h1>
          <p>{shared ? "One clear view of what your team has coming up." : "Keep the dates and plans that matter close at hand."}</p>
        </div>
        <div className="calendar-heading-actions">
          {shared && (workspacesQuery.data?.length ?? 0) > 1 && <label className="calendar-workspace-select">
            <span>Workspace</span>
            <select value={workspace?.id} onChange={(event) => selectWorkspace(event.target.value)} aria-label="Select workspace">
              {workspacesQuery.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>}
          <button className="calendar-add-button" type="button" onClick={openCreate}><Plus size={16} /> Add to calendar</button>
        </div>
      </header>

      {eventsQuery.isError && <div className="calendar-error" role="alert">Calendar items couldn’t load. {eventsQuery.error.message}</div>}
      {error && !formOpen && <div className="calendar-error" role="alert">{error}</div>}

      <section className="calendar-board">
        <div className="calendar-month-pane">
          <div className="calendar-month-toolbar">
            <div><span className="calendar-overline">{shared ? workspace?.name : "YOUR CALENDAR"}</span><h2>{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month)}</h2></div>
            <div className="calendar-month-controls">
              <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ArrowLeft size={17} /></button>
              <button type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dayKey(today)); }}>Today</button>
              <button type="button" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ArrowRight size={17} /></button>
            </div>
          </div>
          <div className="calendar-month-grid" role="grid" aria-label="Calendar month">
            {weekDays.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
            {monthDays.map((date) => {
              const key = dayKey(date);
              const count = eventsByDay.get(key)?.length ?? 0;
              const outside = date.getMonth() !== month.getMonth();
              return <button
                type="button"
                role="gridcell"
                key={key}
                aria-label={`${dateLabel.format(date)}${count ? `, ${count} calendar items` : ""}`}
                aria-pressed={selectedDate === key}
                className={`calendar-date${outside ? " calendar-date-outside" : ""}${selectedDate === key ? " calendar-date-selected" : ""}${key === dayKey(now) ? " calendar-date-today" : ""}`}
                onClick={() => { setSelectedDate(key); if (outside) setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}
              >
                <span>{date.getDate()}</span>
                {count > 0 && <i>{count > 3 ? "3+" : count}</i>}
              </button>;
            })}
          </div>
          <div className="calendar-board-legend"><i /><span>Scheduled items</span><strong>{events.length} total</strong></div>
        </div>
        <aside className="calendar-agenda">
          <header className="calendar-agenda-heading">
            <div><span className="calendar-overline">{selectedDate === dayKey(now) ? "TODAY" : "DAY AGENDA"}</span><h2>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(selected)}</h2></div>
            <button type="button" aria-label="Add item to this date" onClick={openCreate}><Plus size={18} /></button>
          </header>
          <p className="calendar-agenda-date">{dateLabel.format(selected)}</p>
          <div className="calendar-agenda-list">
            {!eventsQuery.isError && selectedEvents.length === 0 ? <div className="calendar-agenda-empty"><CalendarDays size={20} /><strong>Nothing planned</strong><span>Enjoy the open space, or add an item.</span></div>
              : selectedEvents.map((event) => {
                const canManage = !shared || canEditAll || event.createdByUserId === user?.id || event.creator?.id === user?.id;
                return <article className="calendar-agenda-item" key={event.id}>
                  <div className="calendar-event-time">{event.allDay ? "ALL DAY" : timeLabel.format(new Date(event.startsAt))}</div>
                  <div className="calendar-event-rule" />
                  <div className="calendar-event-copy">
                    <strong>{event.title}</strong>
                    {event.description && <p>{event.description}</p>}
                    <span><Clock3 size={12} /> {event.allDay ? "All day" : `${timeLabel.format(new Date(event.startsAt))} – ${timeLabel.format(new Date(event.endsAt))}`}</span>
                    {shared && event.creator && <small>Added by {event.creator.name}</small>}
                    {canManage && <div className="calendar-event-actions">
                      <button type="button" onClick={() => openEdit(event)}><Pencil size={13} /> Edit</button>
                      <button type="button" disabled={deleteEvent.isPending} onClick={() => { if (window.confirm(`Delete “${event.title}”?`)) deleteEvent.mutate(event.id); }}><Trash2 size={13} /> Delete</button>
                    </div>}
                  </div>
                </article>;
              })}
          </div>
          {shared && <p className="calendar-role-note">{canEditAll ? "As an administrator, you can manage every shared item." : "You can manage items you added. Workspace administrators can manage all items."}</p>}
        </aside>
      </section>

      {formOpen && <div className="calendar-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saveEvent.isPending) closeForm(); }}>
        <section className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
          <header><div><span className="calendar-overline">{shared ? workspace?.name : "PERSONAL CALENDAR"}</span><h2 id="calendar-event-title">{editing ? "Edit calendar item" : "Add to calendar"}</h2></div><button type="button" aria-label="Close dialog" disabled={saveEvent.isPending} onClick={closeForm}><X size={19} /></button></header>
          <form onSubmit={submit}>
            <label>What’s happening?<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="e.g. Team planning session" /></label>
            <label>Details <span className="calendar-optional">OPTIONAL</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} placeholder="Add context or a short note" /></label>
            <label className="calendar-all-day"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /><span>All day</span></label>
            <div className="calendar-time-fields">
              <label>Starts<input type={allDay ? "date" : "datetime-local"} value={allDay ? startsAt.slice(0, 10) : startsAt} onChange={(event) => setStartsAt(allDay ? `${event.target.value}T00:00` : event.target.value)} required /></label>
              <label>Ends<input type={allDay ? "date" : "datetime-local"} value={allDay ? endsAt.slice(0, 10) : endsAt} onChange={(event) => setEndsAt(allDay ? `${event.target.value}T23:59` : event.target.value)} required /></label>
            </div>
            {error && <p className="calendar-form-error" role="alert">{error}</p>}
            <footer><button type="button" className="calendar-cancel-button" disabled={saveEvent.isPending} onClick={closeForm}>Cancel</button><button type="submit" className="calendar-add-button" disabled={saveEvent.isPending}>{saveEvent.isPending ? "Saving…" : editing ? "Save changes" : "Add item"}</button></footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
