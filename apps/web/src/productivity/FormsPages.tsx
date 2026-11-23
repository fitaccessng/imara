import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, Eye, FilePlus2, Link2, Plus, Trash2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { PageShell } from "../pages/PageShell";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import type { FormQuestion, FormQuestionType, FormResponse, WorkspaceForm } from "./types";

type QuestionDraft = FormQuestion & { choicesText: string };
type FormDraft = { id?: string; title: string; description: string; questions: QuestionDraft[] };

const questionTypes: Array<{ value: FormQuestionType; label: string }> = [
  { value: "SHORT_ANSWER", label: "Short answer" },
  { value: "PARAGRAPH", label: "Paragraph" },
  { value: "EMAIL", label: "Email" },
  { value: "NUMBER", label: "Number" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
  { value: "CHECKBOXES", label: "Checkboxes" },
  { value: "FILE_UPLOAD", label: "File upload (PDF/JPEG/PNG)" },
];

function freshQuestion(): QuestionDraft {
  return { id: crypto.randomUUID(), prompt: "", type: "SHORT_ANSWER", required: false, choicesText: "" };
}

function toDraft(form: WorkspaceForm): FormDraft {
  return {
    id: form.id,
    title: form.title,
    description: form.description ?? "",
    questions: form.schema.questions.map((question) => ({ ...question, choicesText: question.choices?.join("\n") ?? "" })),
  };
}

function cleanQuestion(question: QuestionDraft): FormQuestion {
  const { choicesText, ...clean } = question;
  const choiceType = clean.type === "MULTIPLE_CHOICE" || clean.type === "CHECKBOXES";
  return {
    ...clean,
    prompt: clean.prompt.trim(),
    ...(choiceType ? { choices: choicesText.split("\n").map((choice) => choice.trim()).filter(Boolean) } : {}),
  };
}

export function FormsPage() {
  const { workspaces, workspace, workspacesQuery, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const workspaceId = workspace?.id;
  const basePath = `/workspaces/${workspaceId}/forms`;
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [selectedForm, setSelectedForm] = useState<WorkspaceForm | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareLink, setShareLink] = useState("");
  const formsQuery = useQuery({
    queryKey: ["workspace-forms", workspaceId],
    queryFn: () => apiRequest<WorkspaceForm[]>(basePath),
    enabled: Boolean(workspaceId),
  });
  const responsesQuery = useQuery({
    queryKey: ["workspace-form-responses", workspaceId, selectedForm?.id],
    queryFn: () => apiRequest<FormResponse[]>(`${basePath}/${selectedForm?.id}/responses`),
    enabled: Boolean(selectedForm?.id),
  });

  const save = useMutation({
    mutationFn: (value: FormDraft) => {
      const payload = {
        title: value.title.trim(),
        description: value.description.trim() || null,
        schema: { questions: value.questions.map(cleanQuestion) },
      };
      return apiRequest<WorkspaceForm>(value.id ? `${basePath}/${value.id}` : basePath, {
        method: value.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (form) => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-forms", workspaceId] });
      setSelectedForm(form);
      setDraft(null);
      setMessage("Form saved.");
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The form could not be saved."),
  });
  const share = useMutation({
    mutationFn: (formId: string) => apiRequest<{ token: string }>(`${basePath}/${formId}/share`, { method: "POST" }),
    onSuccess: async ({ token }) => {
      setShareLink(`${window.location.origin}/form/${token}`);
      setMessage("A new public link is ready. Sharing again replaces the previous link.");
      await queryClient.invalidateQueries({ queryKey: ["workspace-forms", workspaceId] });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The share link could not be created."),
  });
  const revoke = useMutation({
    mutationFn: (formId: string) => apiRequest<void>(`${basePath}/${formId}/share`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-forms", workspaceId] });
      setMessage("The form link has been disabled.");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The public link could not be disabled."),
  });
  const remove = useMutation({
    mutationFn: (formId: string) => apiRequest<void>(`${basePath}/${formId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-forms", workspaceId] });
      setSelectedForm(null);
      setMessage("Form deleted.");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The form could not be deleted."),
  });

  const forms = formsQuery.data ?? [];
  const selectedIsCurrent = selectedForm ? forms.find((form) => form.id === selectedForm.id) : null;

  function openForm(form: WorkspaceForm) {
    setSelectedForm(form);
    setDraft(toDraft(form));
    setMessage("");
    setError("");
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setDraft((current) => current ? {
      ...current,
      questions: current.questions.map((question, itemIndex) => itemIndex === index ? { ...question, ...patch } : question),
    } : current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.title.trim()) {
      setError("Add a form title.");
      return;
    }
    if (!draft.questions.length) {
      setError("Add at least one question before sharing the form.");
      return;
    }
    if (draft.questions.some((question) => !question.prompt.trim())) {
      setError("Every question needs a prompt.");
      return;
    }
    save.mutate(draft);
  }

  return (
    <PageShell eyebrow="BUSINESS WORKSPACE" title="IMARA Forms" description="Build shareable forms and collect responses directly in the workspace.">
      <main className="mx-auto max-w-[1100px] space-y-5 pb-10">
        {workspacesQuery.isError ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">Workspaces could not be loaded. Try refreshing the page.</p>
          : !workspace ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Join a business workspace to create and manage forms.</p>
            : (
              <>
                {workspaces.length > 1 && <label className="flex flex-wrap items-center gap-3 text-sm text-slate-600">Workspace
                  <select value={workspace.id} onChange={(event) => selectWorkspace(event.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                </label>}
                <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-700">WORKSPACE FORMS</p><p className="mt-1 text-sm text-slate-500">{forms.length} forms</p></div><button type="button" onClick={() => { setSelectedForm(null); setDraft({ title: "", description: "", questions: [freshQuestion()] }); setMessage(""); setError(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#102B46] px-4 text-sm font-semibold text-white"><FilePlus2 size={16} /> New form</button></div>
                    {formsQuery.isPending ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading forms…</p>
                      : formsQuery.isError ? <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-700">{formsQuery.error.message}</p>
                        : forms.length ? forms.map((form) => <article key={form.id} className={`rounded-2xl border bg-white p-4 ${selectedForm?.id === form.id ? "border-emerald-500 shadow-sm" : "border-slate-200"}`}>
                          <button type="button" onClick={() => openForm(form)} className="w-full text-left"><span className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-900">{form.title}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${form.shareActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{form.shareActive ? "SHARED" : "DRAFT"}</span></span><span className="mt-2 block text-xs text-slate-500">{form.schema.questions.length} questions · {form.responseCount} responses</span></button>
                          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => share.mutate(form.id)} disabled={share.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50"><Link2 size={14} /> {form.shareActive ? "Create new link" : "Share form"}</button>{form.shareActive && <button type="button" onClick={() => revoke.mutate(form.id)} disabled={revoke.isPending} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Disable link</button>}<button type="button" onClick={() => { setSelectedForm(form); setDraft(null); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"><Eye size={14} /> Responses</button><button type="button" onClick={() => { if (window.confirm(`Delete “${form.title}” and its responses?`)) remove.mutate(form.id); }} disabled={remove.isPending} aria-label={`Delete ${form.title}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"><Trash2 size={14} /> Delete</button></div>
                        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Clipboard className="mx-auto text-emerald-700" size={25} /><p className="mt-3 font-semibold text-slate-900">No forms yet</p><p className="mt-1 text-sm text-slate-500">Create a form for registrations, feedback or document submissions.</p></div>}
                  </div>
                  {draft ? <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-900">{draft.id ? "Edit form" : "Build a form"}</h2><button type="button" onClick={() => setDraft(null)} className="text-sm text-slate-500">Close</button></div>
                    <label className="block text-sm font-medium text-slate-700">Form title<input required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
                    <label className="block text-sm font-medium text-slate-700">Description<textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3" /></label>
                    <div className="space-y-3">{draft.questions.map((question, index) => <div key={question.id} className="space-y-3 rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Question {index + 1}</p><button type="button" aria-label={`Remove question ${index + 1}`} onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button></div>
                      <input value={question.prompt} maxLength={500} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="What would you like to ask?" className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
                      <div className="flex flex-wrap items-center gap-3"><select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value as FormQuestionType, choicesText: "" })} className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm">{questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} /> Required</label></div>
                      {(question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOXES") && <label className="block text-xs font-medium text-slate-600">Options <span className="font-normal">one per line</span><textarea value={question.choicesText} onChange={(event) => updateQuestion(index, { choicesText: event.target.value })} rows={3} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2 text-sm" /></label>}
                    </div>)}</div>
                    <button type="button" onClick={() => setDraft({ ...draft, questions: [...draft.questions, freshQuestion()] })} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-semibold text-slate-700"><Plus size={15} /> Add question</button>
                    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                    <button disabled={save.isPending} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? "Saving…" : "Save form"}</button>
                  </form> : selectedForm && <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Responses</h2><p className="text-xs text-slate-500">{selectedIsCurrent?.title ?? selectedForm.title}</p></div><button type="button" aria-label="Edit form" onClick={() => selectedIsCurrent && openForm(selectedIsCurrent)} className="text-sm font-semibold text-emerald-700">Edit form</button></div>
                    {responsesQuery.isPending ? <p className="text-sm text-slate-500">Loading responses…</p>
                      : responsesQuery.isError ? <p role="alert" className="text-sm text-red-700">{responsesQuery.error.message}</p>
                        : responsesQuery.data?.length ? <div className="max-h-[600px] space-y-3 overflow-y-auto">{responsesQuery.data.map((response) => <article key={response.id} className="rounded-xl border border-slate-100 p-3"><p className="font-semibold text-slate-900">{response.respondentName}</p><p className="text-xs text-slate-500">{response.respondentEmail} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(response.submittedAt))}</p><dl className="mt-3 space-y-2 text-sm">{selectedForm.schema.questions.map((question) => <div key={question.id}><dt className="text-xs font-semibold text-slate-500">{question.prompt}</dt><dd className="mt-0.5 break-words text-slate-800">{formatAnswer(response.answers[question.id])}</dd></div>)}</dl></article>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No responses have been submitted yet.</p>}
                  </div>}
                </section>
                {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
                {shareLink && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-white p-3"><input readOnly aria-label="Public form link" value={shareLink} className="min-w-0 flex-1 bg-transparent text-xs text-slate-700" /><button type="button" onClick={() => void navigator.clipboard.writeText(shareLink).then(() => setMessage("Form link copied.")).catch(() => setError("Clipboard access is unavailable. Select and copy the link."))} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">Copy link</button></div>}
                {error && !draft && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              </>
            )}
      </main>
    </PageShell>
  );
}

function formatAnswer(answer: unknown): string {
  if (typeof answer === "string" || typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) return answer.join(", ");
  return answer ? JSON.stringify(answer) : "—";
}

interface PublicForm {
  id: string;
  title: string;
  description: string | null;
  schema: { questions: FormQuestion[] };
}

export function PublicFormPage() {
  const { token = "" } = useParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const formQuery = useQuery({
    queryKey: ["public-workspace-form", token],
    queryFn: () => apiRequest<PublicForm>(`/public-forms/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });
  const submit = useMutation({
    mutationFn: () => apiRequest<{ id: string; submittedAt: string }>(`/public-forms/${encodeURIComponent(token)}/responses`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), email: email.trim(), answers }),
    }),
    onSuccess: () => setSubmitted(true),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Your response could not be submitted."),
  });

  async function uploadFile(questionId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    setUploading(questionId);
    setError("");
    try {
      const result = await apiRequest<{ fileId: string }>(`/public-forms/${encodeURIComponent(token)}/questions/${encodeURIComponent(questionId)}/uploads`, { method: "POST", body: data });
      setAnswers((current) => ({ ...current, [questionId]: result.fileId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const missingChoice = questions.find((question) =>
      question.required
      && question.type === "CHECKBOXES"
      && (!Array.isArray(answers[question.id]) || !(answers[question.id] as unknown[]).length),
    );
    if (missingChoice) {
      setError(`Select at least one option for “${missingChoice.prompt}”.`);
      return;
    }
    submit.mutate();
  }

  const questions = useMemo(() => formQuery.data?.schema.questions ?? [], [formQuery.data]);
  return (
    <PageShell eyebrow="PUBLIC FORM" title={formQuery.data?.title ?? "Workspace form"} description={formQuery.data?.description ?? undefined}>
      <main className="mx-auto max-w-2xl pb-10">
        {formQuery.isPending ? <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">Loading form…</p>
          : formQuery.isError ? <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-700">This form is unavailable or its link has been disabled.</p>
            : submitted ? <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center"><span className="text-3xl text-emerald-700">✓</span><h2 className="mt-3 text-xl font-bold text-slate-900">Response submitted</h2><p className="mt-2 text-sm text-slate-600">Thank you. Your response has been sent to the workspace.</p></div>
              : <form onSubmit={submitForm} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div><h2 className="text-lg font-semibold text-slate-900">Your information</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label><label className="text-sm font-medium text-slate-700">Email<input required type="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label></div></div>
                {questions.map((question) => <fieldset key={question.id} className="space-y-2"><legend className="text-sm font-semibold text-slate-800">{question.prompt}{question.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}</legend>
                  {question.type === "PARAGRAPH" ? <textarea required={question.required} maxLength={10000} value={String(answers[question.id] ?? "")} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} rows={4} className="w-full rounded-xl border border-slate-200 p-3" />
                    : question.type === "MULTIPLE_CHOICE" ? <div className="space-y-2">{(question.choices ?? []).map((choice) => <label key={choice} className="flex items-center gap-2 text-sm text-slate-700"><input required={question.required && !answers[question.id]} type="radio" name={question.id} value={choice} checked={answers[question.id] === choice} onChange={() => setAnswers({ ...answers, [question.id]: choice })} />{choice}</label>)}</div>
                      : question.type === "CHECKBOXES" ? <div className="space-y-2">{(question.choices ?? []).map((choice) => { const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []; return <label key={choice} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selected.includes(choice)} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.checked ? [...selected, choice] : selected.filter((item) => item !== choice) })} />{choice}</label>; })}</div>
                        : question.type === "FILE_UPLOAD" ? <div><input required={question.required && !answers[question.id]} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => void uploadFile(question.id, event)} className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:text-xs file:font-semibold" /><p className="mt-1 text-xs text-slate-500">{uploading === question.id ? "Uploading…" : answers[question.id] ? "File uploaded." : "PDF, PNG or JPEG up to 5 MiB."}</p></div>
                          : <input required={question.required} type={question.type === "EMAIL" ? "email" : question.type === "NUMBER" ? "number" : "text"} maxLength={question.type === "EMAIL" ? 320 : 2000} value={String(answers[question.id] ?? "")} onChange={(event) => setAnswers({ ...answers, [question.id]: question.type === "NUMBER" && event.target.value ? Number(event.target.value) : event.target.value })} className="min-h-11 w-full rounded-xl border border-slate-200 px-3" />}
                </fieldset>)}
                {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                <button disabled={submit.isPending || uploading !== null} className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{submit.isPending ? "Submitting…" : "Submit response"}</button>
              </form>}
      </main>
    </PageShell>
  );
}
