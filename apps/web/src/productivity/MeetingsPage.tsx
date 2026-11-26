import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Mic, Plus, Save, Square, Trash2, Upload } from "lucide-react";
import { apiRequest } from "../lib/api";
import { PageShell } from "../pages/PageShell";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { fileLabel, type CalendarLink, type Meeting, type ProductivityFile } from "./types";
import "./mobileCreateForms.css";

type MeetingDraft = {
  id?: string;
  title: string;
  startedAt: string;
  endedAt: string;
  transcript: string;
  summary: string;
  decisionsText: string;
  actionItemsText: string;
  originalActionItemsText: string;
  recordingFileId: string;
  calendarEventId: string;
};

interface CalendarChoice extends CalendarLink {
  personalMeetingId?: string | null;
  workspaceMeetingId?: string | null;
}

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function newDraft(): MeetingDraft {
  return {
    title: "",
    startedAt: localDate(new Date().toISOString()),
    endedAt: "",
    transcript: "",
    summary: "",
    decisionsText: "",
    actionItemsText: "",
    originalActionItemsText: "",
    recordingFileId: "",
    calendarEventId: "",
  };
}

export function MeetingsPage({ shared = false }: { shared?: boolean }) {
  const { workspaces, workspace, workspacesQuery, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const scopeId = shared ? workspace?.id : null;
  const meetingsPath = shared ? `/workspaces/${scopeId}/meetings` : "/meetings";
  const calendarPath = shared ? `/workspaces/${scopeId}/calendar/events` : "/calendar/events";
  const filesPath = shared ? `/workspaces/${scopeId}/files` : "/files";
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[] } | null>(null);

  const meetingsQuery = useQuery({
    queryKey: ["productivity-meetings", scopeId ?? "personal"],
    queryFn: () => apiRequest<Meeting[]>(meetingsPath),
    enabled: !shared || Boolean(scopeId),
  });
  const eventsQuery = useQuery({
    queryKey: ["calendar-events", scopeId ?? "personal"],
    queryFn: () => apiRequest<CalendarChoice[]>(calendarPath),
    enabled: Boolean(draft) && (!shared || Boolean(scopeId)),
  });

  const save = useMutation({
    mutationFn: (value: MeetingDraft) => {
      const payload = {
        title: value.title.trim(),
        startedAt: value.startedAt ? new Date(value.startedAt).toISOString() : null,
        endedAt: value.endedAt ? new Date(value.endedAt).toISOString() : null,
        transcript: value.id ? value.transcript : "",
        calendarEventId: value.calendarEventId || null,
        ...(value.id
          ? {
              summary: value.summary.trim() || null,
              decisions: value.decisionsText.split("\n").map((line) => line.trim()).filter(Boolean),
              recordingFileId: value.recordingFileId || null,
              ...(value.actionItemsText !== value.originalActionItemsText
                ? {
                    actionItems: value.actionItemsText
                      .split("\n")
                      .map((title) => title.trim())
                      .filter(Boolean)
                      .map((title) => ({ title })),
                  }
                : {}),
            }
          : {}),
      };
      return apiRequest<Meeting>(value.id ? `${meetingsPath}/${value.id}` : meetingsPath, {
        method: value.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (meeting, value) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productivity-meetings", scopeId ?? "personal"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events", scopeId ?? "personal"] }),
      ]);
      if (value.id) setDraft(null);
      else edit(meeting);
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The meeting could not be saved."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`${meetingsPath}/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["productivity-meetings", scopeId ?? "personal"] }),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The meeting could not be deleted."),
  });
  const createTask = useMutation({
    mutationFn: ({ meetingId, actionItemId }: { meetingId: string; actionItemId: string }) =>
      apiRequest(`${meetingsPath}/${meetingId}/action-items/${actionItemId}/task`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productivity-meetings", scopeId ?? "personal"] }),
        queryClient.invalidateQueries({ queryKey: ["productivity-tasks", scopeId ?? "personal"] }),
      ]);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The task could not be created."),
  });

  function edit(meeting: Meeting) {
    const actionText = meeting.actionItems.map((item) => item.title).join("\n");
    setDraft({
      id: meeting.id,
      title: meeting.title,
      startedAt: localDate(meeting.startedAt),
      endedAt: localDate(meeting.endedAt),
      transcript: meeting.transcript,
      summary: meeting.summary ?? "",
      decisionsText: meeting.decisions.join("\n"),
      actionItemsText: actionText,
      originalActionItemsText: actionText,
      recordingFileId: meeting.recordingFileId ?? "",
      calendarEventId: meeting.calendarEventId ?? "",
    });
    setError("");
  }

  async function uploadRecording(file: File) {
    setRecordingBusy(true);
    setRecordingError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const result = await apiRequest<ProductivityFile>(filesPath, { method: "POST", body: data });
      setDraft((current) => current ? { ...current, recordingFileId: result.id } : current);
      await queryClient.invalidateQueries({ queryKey: ["productivity-files", scopeId ?? "personal"] });
    } catch (cause) {
      setRecordingError(cause instanceof Error ? cause.message : "The recording could not be uploaded.");
    } finally {
      setRecordingBusy(false);
      setFileInputKey((key) => key + 1);
    }
  }

  async function selectRecording(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await uploadRecording(file);
  }

  async function startRecording() {
    setRecordingError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const file = new File(chunks, `imara-meeting-${Date.now()}.webm`, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        void uploadRecording(file);
      };
      recorder.start();
      recorderRef.current = { recorder, stream, chunks };
      setRecording(true);
    } catch {
      setRecordingError("Microphone access was denied or unavailable. You can upload an existing recording instead.");
    }
  }

  function stopRecording() {
    const active = recorderRef.current;
    if (!active) return;
    active.recorder.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.title.trim()) {
      setError("Add a meeting title.");
      return;
    }
    if (draft.startedAt && draft.endedAt && new Date(draft.endedAt) < new Date(draft.startedAt)) {
      setError("The end time must be after the start time.");
      return;
    }
    save.mutate(draft);
  }

  return (
    <PageShell
      eyebrow={shared ? "BUSINESS WORKSPACE" : "PERSONAL SPACE"}
      title="IMARA Meeting Room"
      description="Keep recordings, manually written transcripts, decisions and follow-up tasks together."
    >
      <main className="mx-auto max-w-[1100px] space-y-5 pb-10">
        {shared && workspaces.length > 1 && <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600">Workspace
          <select value={workspace?.id ?? ""} onChange={(event) => selectWorkspace(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </label>}
        {shared && workspacesQuery.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">Workspaces could not be loaded. Try refreshing the page.</p>
          : shared && !workspace ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Join a business workspace to create shared meeting records.</p>
            : (
              <section className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-700">MEETING RECORDS</p><p className="mt-1 text-sm text-slate-500">{meetingsQuery.data?.length ?? 0} saved</p></div><button type="button" onClick={() => { setDraft(newDraft()); setError(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#102B46] px-4 text-sm font-semibold text-white"><Plus size={16} /> New meeting</button></div>
                  {meetingsQuery.isPending ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading meetings…</p>
                    : meetingsQuery.isError ? <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-700">{meetingsQuery.error.message}</p>
                      : meetingsQuery.data?.length ? meetingsQuery.data.map((meeting) => (
                        <article key={meeting.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3"><button onClick={() => edit(meeting)} className="min-w-0 flex-1 text-left"><h2 className="font-semibold text-slate-900">{meeting.title}</h2><p className="mt-1 text-xs text-slate-500">{meeting.startedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(meeting.startedAt)) : "No date set"}{meeting.calendarEvent ? ` · Calendar: ${meeting.calendarEvent.title}` : ""}</p>{meeting.summary && <p className="mt-3 text-sm leading-6 text-slate-600">{meeting.summary}</p>}</button><div className="flex gap-1"><button type="button" aria-label={`Edit ${meeting.title}`} onClick={() => edit(meeting)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Save size={16} /></button><button type="button" aria-label={`Delete ${meeting.title}`} onClick={() => { if (window.confirm(`Delete “${meeting.title}”?`)) remove.mutate(meeting.id); }} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button></div></div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2.5 py-1">{meeting.transcript ? "Transcript saved" : "No transcript"}</span>{meeting.recordingFile && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">{fileLabel(meeting.recordingFile)}</span>}{meeting.decisions.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{meeting.decisions.length} decisions</span>}</div>
                          {meeting.actionItems.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Action items</p>{meeting.actionItems.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-700">{item.title}</span><button type="button" disabled={Boolean(item.personalTaskId || item.workspaceTaskId) || createTask.isPending} onClick={() => createTask.mutate({ meetingId: meeting.id, actionItemId: item.id })} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">{item.personalTaskId || item.workspaceTaskId ? "Task created" : "Create task"}</button></div>)}</div>}
                        </article>
                      )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><CalendarDays className="mx-auto text-emerald-700" size={25} /><p className="mt-3 font-semibold text-slate-900">No meetings saved yet</p><p className="mt-1 text-sm text-slate-500">Create a record to keep notes, decisions and actions with the meeting.</p></div>}
                </div>
                {draft && (
                  <form
                    onSubmit={submit}
                    className="meetings-mobile-editor space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <header className="meetings-mobile-editor-header flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">
                          {draft.id ? "MEETING RECORD" : "GET STARTED"}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-slate-900">
                          {draft.id ? "Meeting details" : "Set up a meeting"}
                        </h2>
                        <p className="meetings-mobile-editor-subtitle mt-1 text-xs text-slate-500">
                          {draft.id
                            ? "Add the notes and outcomes after the meeting."
                            : "Start with the essentials. You can add notes and recording after it’s saved."}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close meeting editor"
                        onClick={() => {
                          if (recording) stopRecording();
                          setDraft(null);
                        }}
                        className="meetings-mobile-close inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        <ArrowLeft size={17} />
                      </button>
                    </header>

                    <label className="block text-sm font-medium text-slate-700">
                      Meeting title
                      <input
                        required
                        maxLength={200}
                        value={draft.title}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        placeholder="e.g. Weekly planning"
                        className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5"
                      />
                    </label>

                    <div className="meetings-mobile-dates grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Starts
                        <input
                          type="datetime-local"
                          value={draft.startedAt}
                          onChange={(event) => setDraft({ ...draft, startedAt: event.target.value })}
                          className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Ends
                        <input
                          type="datetime-local"
                          value={draft.endedAt}
                          onChange={(event) => setDraft({ ...draft, endedAt: event.target.value })}
                          className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-slate-700">
                      Link a calendar event <span className="font-normal text-slate-400">Optional</span>
                      <select
                        value={draft.calendarEventId}
                        onChange={(event) => setDraft({ ...draft, calendarEventId: event.target.value })}
                        className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3"
                      >
                        <option value="">No calendar link</option>
                        {(eventsQuery.data ?? [])
                          .filter((item) => !(shared ? item.workspaceMeetingId : item.personalMeetingId))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title} · {new Intl.DateTimeFormat(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(item.startsAt))}
                            </option>
                          ))}
                      </select>
                    </label>

                    {draft.id && (
                      <section className="meetings-mobile-follow-up space-y-4 border-t border-slate-100 pt-5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">
                            AFTER THE MEETING
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-slate-900">Notes & outcomes</h3>
                        </div>
                        <label className="block text-sm font-medium text-slate-700">
                          Transcript
                          <textarea
                            value={draft.transcript}
                            onChange={(event) => setDraft({ ...draft, transcript: event.target.value })}
                            maxLength={100000}
                            rows={5}
                            placeholder="Enter or paste a transcript. Meeting audio is not transcribed automatically."
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Summary
                          <textarea
                            value={draft.summary}
                            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                            maxLength={20000}
                            rows={3}
                            placeholder="What were the main points?"
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Decisions <span className="font-normal text-slate-500">One per line</span>
                          <textarea
                            value={draft.decisionsText}
                            onChange={(event) => setDraft({ ...draft, decisionsText: event.target.value })}
                            rows={3}
                            placeholder="Record decisions made"
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                          />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                          Action items <span className="font-normal text-slate-500">One per line</span>
                          <textarea
                            disabled={draft.originalActionItemsText !== draft.actionItemsText}
                            value={draft.actionItemsText}
                            onChange={(event) => setDraft({ ...draft, actionItemsText: event.target.value })}
                            rows={3}
                            placeholder="Add follow-up actions"
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 disabled:bg-slate-100"
                          />
                          {draft.originalActionItemsText !== draft.actionItemsText && (
                            <span className="mt-1 block text-xs text-amber-700">
                              Save or refresh before editing action items again.
                            </span>
                          )}
                        </label>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                          <p className="text-sm font-semibold text-slate-700">Meeting recording</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Upload an existing audio file or record directly from this device.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
                              <Upload size={14} />
                              Upload audio
                              <input
                                key={fileInputKey}
                                type="file"
                                accept="audio/*"
                                onChange={(event) => void selectRecording(event)}
                                className="sr-only"
                              />
                            </label>
                            {!recording ? (
                              <button
                                type="button"
                                onClick={() => void startRecording()}
                                disabled={recordingBusy}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"
                              >
                                <Mic size={14} />
                                Record here
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={stopRecording}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white"
                              >
                                <Square size={13} />
                                Stop recording
                              </button>
                            )}
                          </div>
                          {recordingBusy && <p className="mt-2 text-xs text-slate-500">Uploading recording…</p>}
                          {draft.recordingFileId && (
                            <p className="mt-2 text-xs text-emerald-700">Recording uploaded and ready to link.</p>
                          )}
                          {recordingError && <p role="alert" className="mt-2 text-xs text-red-700">{recordingError}</p>}
                        </div>
                      </section>
                    )}

                    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                    <footer className="meetings-mobile-editor-footer border-t border-slate-100 pt-4">
                      <button
                        disabled={save.isPending || recordingBusy || recording}
                        className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                      >
                        {save.isPending ? "Saving…" : draft.id ? "Save meeting updates" : "Create meeting"}
                      </button>
                    </footer>
                  </form>
                )}
              </section>
            )}
      </main>
    </PageShell>
  );
}
