import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckSquare,
  CircleDot,
  Copy,
  FileCheck2,
  FileSignature,
  FileText,
  Link2,
  ListPlus,
  LoaderCircle,
  Plus,
  Printer,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

type DocumentKind = "FORM" | "AGREEMENT" | "INVOICE";
type QuestionKind = "SHORT_ANSWER" | "PARAGRAPH" | "MULTIPLE_CHOICE" | "CHECKBOXES" | "EMAIL" | "NUMBER";

interface DocumentQuestion {
  id: string;
  prompt: string;
  type: QuestionKind;
  required: boolean;
  choices?: string[];
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface DocumentContent {
  questions?: DocumentQuestion[];
  body?: string;
  businessName?: string;
  customerName?: string;
  customerEmail?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  lineItems?: Array<InvoiceLine & { total?: number }>;
  note?: string;
  total?: number;
}

interface StudioDocument {
  id: string;
  type: DocumentKind;
  title: string;
  description: string | null;
  content: DocumentContent;
  published: boolean;
  shareActive: boolean;
  createdAt: string;
  updatedAt: string;
  responseCount: number;
}

type PublicDocument = Pick<StudioDocument, "id" | "type" | "title" | "description" | "content">;

interface FormResponse {
  id: string;
  name: string;
  email: string;
  answers?: Record<string, string | string[] | number>;
  submittedAt: string;
  signedAt?: string | null;
  signedName?: string | null;
  consent?: boolean;
}

const KIND_META: Record<
  DocumentKind,
  {
    label: string;
    subtitle: string;
    setupTitle: string;
    badgeClass: string;
    iconBgClass: string;
    cardHoverClass: string;
    actionPillClass: string;
  }
> = {
  FORM: {
    label: "Form",
    subtitle: "Collect responses & details",
    setupTitle: "Build your form",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    iconBgClass: "bg-sky-50 text-sky-600 ring-1 ring-sky-200/80",
    cardHoverClass: "hover:border-sky-300 hover:shadow-md hover:shadow-sky-950/5",
    actionPillClass: "bg-sky-50 text-sky-700 group-hover:bg-sky-600 group-hover:text-white",
  },
  AGREEMENT: {
    label: "Agreement",
    subtitle: "Set terms & collect signatures",
    setupTitle: "Write your agreement",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    iconBgClass: "bg-violet-50 text-violet-600 ring-1 ring-violet-200/80",
    cardHoverClass: "hover:border-violet-300 hover:shadow-md hover:shadow-violet-950/5",
    actionPillClass:
      "bg-violet-50 text-violet-700 group-hover:bg-violet-600 group-hover:text-white",
  },
  INVOICE: {
    label: "Invoice",
    subtitle: "Itemise work & request payment",
    setupTitle: "Prepare your invoice",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconBgClass: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80",
    cardHoverClass: "hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-950/5",
    actionPillClass:
      "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white",
  },
};

const QUESTION_LABEL: Record<QuestionKind, string> = {
  SHORT_ANSWER: "Short answer",
  PARAGRAPH: "Paragraph",
  MULTIPLE_CHOICE: "Multiple choice",
  CHECKBOXES: "Checkboxes",
  EMAIL: "Email",
  NUMBER: "Number",
};

function makeDefaultContent(type: DocumentKind): DocumentContent {
  if (type === "FORM") return { questions: [] };
  if (type === "AGREEMENT") return { body: "" };
  const today = new Date().toISOString().slice(0, 10);
  return {
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    issueDate: today,
    dueDate: "",
    currency: "USD",
    lineItems: [{ description: "", quantity: 1, unitPrice: 0 }],
    note: "",
  };
}

function makeQuestion(): DocumentQuestion {
  return {
    id: crypto.randomUUID(),
    prompt: "",
    type: "SHORT_ANSWER",
    required: false,
  };
}

function formatCurrency(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function validateForSharing(document: StudioDocument): string | null {
  if (!document.title.trim()) return "Title required.";
  if (document.type === "FORM") {
    const questions = document.content.questions ?? [];
    if (questions.some((q) => !q.prompt.trim())) return "All questions require a prompt.";
    if (
      questions.some((q) => {
        if (q.type !== "MULTIPLE_CHOICE" && q.type !== "CHECKBOXES") return false;
        const choices = (q.choices ?? []).map((c) => c.trim());
        return (
          choices.length === 0 ||
          choices.some((c) => !c) ||
          new Set(choices).size !== choices.length
        );
      })
    ) {
      return "Choice questions require unique, non-empty options.";
    }
  }
  if (document.type === "AGREEMENT" && !document.content.body?.trim()) {
    return "Agreement terms required.";
  }
  if (document.type === "INVOICE") {
    const c = document.content;
    if (!c.businessName?.trim() || !c.customerName?.trim() || !c.invoiceNumber?.trim()) {
      return "Business, customer, and invoice number required.";
    }
    if (!c.customerEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.customerEmail.trim())) {
      return "Valid customer email required.";
    }
    if (!c.issueDate || !c.dueDate) return "Issue and due dates required.";
    const items = c.lineItems ?? [];
    if (
      !items.length ||
      items.some((i) => !i.description.trim() || i.quantity <= 0 || i.unitPrice < 0)
    ) {
      return "Valid line items required.";
    }
  }
  return null;
}

function hasDocumentEdits(current: StudioDocument, saved: StudioDocument) {
  return (
    current.title !== saved.title ||
    current.description !== saved.description ||
    JSON.stringify(current.content) !== JSON.stringify(saved.content)
  );
}

function DocumentTypeIcon({ type, size = 18 }: { type: DocumentKind; size?: number }) {
  if (type === "FORM") return <ListPlus size={size} />;
  if (type === "AGREEMENT") return <FileSignature size={size} />;
  return <FileText size={size} />;
}

export function DocumentStudioPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<StudioDocument | null>(null);
  const [activePanel, setActivePanel] = useState<"EDITOR" | "RESPONSES">("EDITOR");
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const documentsQuery = useQuery({
    queryKey: ["personal-documents"],
    queryFn: () => apiRequest<StudioDocument[]>("/documents"),
  });

  const selectedQuery = useQuery({
    queryKey: ["personal-document", selectedId],
    queryFn: () => apiRequest<StudioDocument>(`/documents/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const responsesQuery = useQuery({
    queryKey: ["personal-document-responses", selectedId],
    queryFn: () => apiRequest<FormResponse[]>(`/documents/${selectedId}/responses`),
    enabled: Boolean(
      selectedId &&
        activePanel === "RESPONSES" &&
        (editing?.type === "FORM" || editing?.type === "AGREEMENT")
    ),
  });

  useEffect(() => {
    const saved = selectedQuery.data;
    if (!saved) return;
    setEditing((current) =>
      current?.id === saved.id && hasDocumentEdits(current, saved) ? current : saved
    );
  }, [selectedQuery.data]);

  const createDocument = useMutation({
    mutationFn: (type: DocumentKind) =>
      apiRequest<StudioDocument>("/documents", {
        method: "POST",
        body: JSON.stringify({
          type,
          title: `Untitled ${KIND_META[type].label.toLowerCase()}`,
          description: "",
          content: makeDefaultContent(type),
          published: false,
        }),
      }),
    onSuccess: async (created) => {
      setSelectedId(created.id);
      setEditing(created);
      setActivePanel("EDITOR");
      setShareUrl("");
      setNotice("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Failed to create."),
  });

  const saveDocument = useMutation({
    mutationFn: (document: StudioDocument) =>
      apiRequest<StudioDocument>(`/documents/${document.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: document.title,
          description: document.description,
          content: document.content,
          published: document.published,
        }),
      }),
    onSuccess: async (saved) => {
      setEditing(saved);
      setNotice("Saved");
      setError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["personal-documents"] }),
        queryClient.invalidateQueries({ queryKey: ["personal-document", saved.id] }),
      ]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Failed to save."),
  });

  const shareDocument = useMutation({
    mutationFn: async (document: StudioDocument) => {
      let published = document;
      if (!document.published) {
        published = await apiRequest<StudioDocument>(`/documents/${document.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: document.title,
            description: document.description,
            content: document.content,
            published: true,
          }),
        });
      }
      const link = await apiRequest<{ token: string }>(`/documents/${document.id}/share`, {
        method: "POST",
      });
      return { published, token: link.token };
    },
    onSuccess: async ({ published, token }) => {
      setEditing({ ...published, shareActive: true });
      setShareUrl(`${window.location.origin}/respond/${encodeURIComponent(token)}`);
      setNotice("Link active");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Failed to share."),
  });

  const revokeShare = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/documents/${id}/share`, { method: "DELETE" }),
    onSuccess: async () => {
      if (editing) setEditing({ ...editing, shareActive: false, published: false });
      setShareUrl("");
      setNotice("Revoked");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Failed to revoke."),
  });

  const deleteDocument = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelectedId("");
      setEditing(null);
      setShareUrl("");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Failed to delete."),
  });

  function updateEditing(update: (current: StudioDocument) => StudioDocument) {
    setEditing((current) => (current ? update(current) : current));
    setNotice("");
  }

  function updateContent(update: (content: DocumentContent) => DocumentContent) {
    updateEditing((current) => ({ ...current, content: update(current.content) }));
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Copied");
    } catch {
      setError("Copy failed");
    }
  }

  function publishAndShare(document: StudioDocument) {
    const validationError = validateForSharing(document);
    if (validationError) {
      setError(validationError);
      setNotice("");
      return;
    }
    setError("");
    shareDocument.mutate(document);
  }

  const documents = documentsQuery.data ?? [];
  const isDirty = Boolean(
    editing && selectedQuery.data && hasDocumentEdits(editing, selectedQuery.data)
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header & Styled Creation Buttons */}
        <header className="mb-8 space-y-6 border-b border-slate-200 pb-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-500 uppercase">
                <span>Imara</span>
                <span className="text-slate-300">/</span>
                <span className="text-emerald-700">Workspace</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                Document studio
              </h1>
              <p className="text-sm text-slate-600">
                Create, organise, and share forms, agreements, and invoices.
              </p>
            </div>
            {createDocument.isPending && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <LoaderCircle className="animate-spin" size={13} />
                Creating...
              </span>
            )}
          </div>

          <section aria-label="Create a document">
            <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-3">
              {(["FORM", "AGREEMENT", "INVOICE"] as const).map((type) => {
                const meta = KIND_META[type];
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={createDocument.isPending}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      createDocument.mutate(type);
                    }}
                    className={`group flex w-full items-center justify-between gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xs transition-all duration-150 active:scale-[0.99] disabled:opacity-50 ${meta.cardHoverClass}`}
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105 ${meta.iconBgClass}`}
                      >
                        <DocumentTypeIcon type={type} size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">
                          {meta.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {meta.subtitle}
                        </span>
                      </span>
                    </div>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${meta.actionPillClass}`}
                      aria-hidden="true"
                    >
                      <Plus size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </header>

        {/* Main View: Full Document History OR Active Editor */}
        {!selectedId ? (
          <section aria-label="Document history" className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800"
              >
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">History</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 tabular-nums">
                {documents.length}
              </span>
            </div>

            {documentsQuery.isLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-400">
                <LoaderCircle className="animate-spin" size={20} />
              </div>
            ) : documentsQuery.isError ? (
              <div
                role="alert"
                className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-xs text-rose-800 sm:flex-row sm:items-center"
              >
                <span>Couldn’t load your documents.</span>
                <button
                  type="button"
                  onClick={() => void documentsQuery.refetch()}
                  className="w-full rounded-lg bg-rose-600 px-3.5 py-2 font-medium text-white transition hover:bg-rose-700 sm:w-auto sm:py-1.5"
                >
                  Retry
                </button>
              </div>
            ) : documents.length ? (
              <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                {documents.map((doc) => {
                  const meta = KIND_META[doc.type];
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(doc.id);
                        setEditing(null);
                        setActivePanel("EDITOR");
                        setShareUrl("");
                        setError("");
                        setNotice("");
                      }}
                      className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.iconBgClass}`}
                      >
                        <DocumentTypeIcon type={doc.type} size={16} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-950 group-hover:text-emerald-700">
                          {doc.title || `Untitled ${meta.label.toLowerCase()}`}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                doc.published ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                            {doc.published ? "Published" : "Draft"}
                          </span>
                          <span className="hidden text-slate-300 sm:inline">•</span>
                          <span className="hidden sm:inline">
                            Updated {new Date(doc.updatedAt).toLocaleDateString()}
                          </span>
                        </span>
                      </span>

                      {(doc.type === "FORM" || doc.type === "AGREEMENT") &&
                        doc.responseCount > 0 && (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 tabular-nums">
                            {doc.responseCount}{" "}
                            <span className="hidden text-slate-500 sm:inline">
                              {doc.type === "FORM"
                                ? doc.responseCount === 1
                                  ? "response"
                                  : "responses"
                                : doc.responseCount === 1
                                  ? "signature"
                                  : "signatures"}
                            </span>
                          </span>
                        )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-14 text-center">
                <FileText size={22} className="mb-2.5 text-slate-400" />
                <p className="text-sm font-medium text-slate-900">No documents yet</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Choose Form, Agreement, or Invoice above to create your first document.
                </p>
              </div>
            )}
          </section>
        ) : selectedQuery.isLoading || !editing ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-2xs">
            <LoaderCircle className="animate-spin" size={20} />
          </div>
        ) : selectedQuery.isError ? (
          <div
            role="alert"
            className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xs"
          >
            <p className="text-sm text-slate-700">Unable to open this document.</p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => setSelectedId("")}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 sm:w-auto"
              >
                Back to history
              </button>
              <button
                type="button"
                onClick={() => void selectedQuery.refetch()}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 sm:w-auto"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {/* Editor Top Bar */}
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId("");
                    setEditing(null);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  <ArrowLeft size={14} />
                  <span>History</span>
                </button>

                <div
                  role="tablist"
                  className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePanel === "EDITOR"}
                    onClick={() => setActivePanel("EDITOR")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      activePanel === "EDITOR"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    <FileText size={13} />
                    Editor
                  </button>

                  {(editing.type === "FORM" || editing.type === "AGREEMENT") && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activePanel === "RESPONSES"}
                      onClick={() => setActivePanel("RESPONSES")}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        activePanel === "RESPONSES"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:text-slate-950"
                      }`}
                    >
                      <Check size={13} />
                      {editing.type === "FORM" ? "Responses" : "Signatures"}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                          activePanel === "RESPONSES"
                            ? "bg-slate-800 text-slate-100"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {editing.responseCount}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 pt-2.5 sm:justify-end sm:border-t-0 sm:pt-0">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      editing.published ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {editing.published ? "Published" : "Draft"}
                  {isDirty && <span className="text-slate-400">• Unsaved</span>}
                </span>

                <button
                  type="button"
                  aria-label={`Delete ${editing.title}`}
                  disabled={deleteDocument.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete “${editing.title}”?`)) {
                      deleteDocument.mutate(editing.id);
                    }
                  }}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Feedback Banners */}
            {(error || notice) && (
              <div className="px-4 pt-4 sm:px-6">
                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
                  >
                    <AlertCircle size={15} className="shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}
                {notice && !error && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800"
                  >
                    <Check size={15} className="shrink-0 text-emerald-600" />
                    <span>{notice}</span>
                  </div>
                )}
              </div>
            )}

            {/* Panel Content */}
            {activePanel === "RESPONSES" &&
            (editing.type === "FORM" || editing.type === "AGREEMENT") ? (
              <ResponsePanel
                query={responsesQuery}
                questions={editing.content.questions ?? []}
                type={editing.type}
              />
            ) : (
              <div className="space-y-6 p-4 sm:p-6">
                {/* Document Intro */}
                <div className="flex items-start gap-3.5">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      KIND_META[editing.type].iconBgClass
                    }`}
                  >
                    <DocumentTypeIcon type={editing.type} size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      {KIND_META[editing.type].label} setup
                    </p>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {KIND_META[editing.type].setupTitle}
                    </h2>
                    <p className="text-xs text-slate-600">
                      Give it a clear title and complete the fields below.
                    </p>
                  </div>
                </div>

                {/* Title & Description */}
                <div className="grid grid-cols-1 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-700">Document title</span>
                    <input
                      maxLength={160}
                      value={editing.title}
                      onChange={(e) =>
                        updateEditing((c) => ({ ...c, title: e.target.value }))
                      }
                      placeholder="e.g., Client Onboarding Form"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        {editing.type === "FORM"
                          ? "What should people know?"
                          : "Additional note"}
                      </span>
                      <span className="text-slate-400">Optional</span>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={editing.description ?? ""}
                      onChange={(e) =>
                        updateEditing((c) => ({ ...c, description: e.target.value }))
                      }
                      placeholder="Add helpful context or instructions..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder-slate-400 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </label>
                </div>

                {/* Type-Specific Body */}
                {editing.type === "FORM" && (
                  <FormQuestionEditor
                    questions={editing.content.questions ?? []}
                    onChange={(questions) =>
                      updateContent((c) => ({ ...c, questions }))
                    }
                  />
                )}

                {editing.type === "AGREEMENT" && (
                  <AgreementEditor
                    body={editing.content.body ?? ""}
                    onChange={(body) => updateContent((c) => ({ ...c, body }))}
                  />
                )}

                {editing.type === "INVOICE" && (
                  <InvoiceEditor
                    content={editing.content}
                    onChange={(content) => updateEditing((c) => ({ ...c, content }))}
                  />
                )}

                {/* Responsive Action Bar */}
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      disabled={saveDocument.isPending || !editing.title.trim()}
                      onClick={() => saveDocument.mutate(editing)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2"
                    >
                      {saveDocument.isPending ? (
                        <LoaderCircle className="animate-spin" size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      Save draft
                    </button>

                    {editing.shareActive && (
                      <button
                        type="button"
                        disabled={revokeShare.isPending}
                        onClick={() => revokeShare.mutate(editing.id)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 sm:w-auto sm:py-2"
                      >
                        Revoke link
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={shareDocument.isPending}
                    onClick={() => publishAndShare(editing)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:py-2"
                  >
                    {shareDocument.isPending ? (
                      <LoaderCircle className="animate-spin" size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                    {editing.shareActive ? "Generate new link" : "Publish & share"}
                  </button>
                </div>

                {/* Shareable Link Box */}
                {shareUrl && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <Link2 size={14} className="shrink-0 text-emerald-600" />
                        <input
                          readOnly
                          value={shareUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label="Share link"
                          className="w-full min-w-0 bg-transparent text-xs text-slate-800 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyShareLink()}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 sm:flex-initial"
                        >
                          <Copy size={13} />
                          Copy
                        </button>
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open link"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                        >
                          <ArrowUpRight size={15} />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function FormQuestionEditor({
  questions,
  onChange,
}: {
  questions: DocumentQuestion[];
  onChange: (questions: DocumentQuestion[]) => void;
}) {
  function updateQuestion(id: string, update: (q: DocumentQuestion) => DocumentQuestion) {
    onChange(questions.map((q) => (q.id === id ? update(q) : q)));
  }

  return (
    <section aria-label="Questions" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Questions ({questions.length})
        </h3>
      </div>

      {questions.map((question, index) => (
        <article
          key={question.id}
          className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial sm:gap-2.5">
              <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <select
                aria-label={`Type ${index + 1}`}
                value={question.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionKind;
                  updateQuestion(question.id, (item) => {
                    const { choices, ...rest } = item;
                    return type === "MULTIPLE_CHOICE" || type === "CHECKBOXES"
                      ? { ...rest, type, choices: choices ?? ["Option 1", "Option 2"] }
                      : { ...rest, type };
                  });
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-600 sm:w-auto"
              >
                {Object.entries(QUESTION_LABEL).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              aria-label={`Remove ${index + 1}`}
              onClick={() => onChange(questions.filter((item) => item.id !== question.id))}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <input
            value={question.prompt}
            onChange={(e) =>
              updateQuestion(question.id, (item) => ({ ...item, prompt: e.target.value }))
            }
            placeholder={`Question ${index + 1}`}
            aria-label={`Question ${index + 1}`}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-950 placeholder-slate-400 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />

          {(question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOXES") && (
            <div className="space-y-2 sm:pl-2">
              {(question.choices ?? []).map((choice, choiceIndex) => (
                <div
                  key={`${question.id}-choice-${choiceIndex}`}
                  className="flex items-center gap-2"
                >
                  {question.type === "CHECKBOXES" ? (
                    <CheckSquare size={14} className="shrink-0 text-slate-400" />
                  ) : (
                    <CircleDot size={14} className="shrink-0 text-slate-400" />
                  )}
                  <input
                    maxLength={200}
                    value={choice}
                    onChange={(e) =>
                      updateQuestion(question.id, (item) => ({
                        ...item,
                        choices: (item.choices ?? []).map((opt, idx) =>
                          idx === choiceIndex ? e.target.value : opt
                        ),
                      }))
                    }
                    placeholder={`Option ${choiceIndex + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-600"
                  />
                  <button
                    type="button"
                    disabled={(question.choices ?? []).length <= 1}
                    onClick={() =>
                      updateQuestion(question.id, (item) => ({
                        ...item,
                        choices: (item.choices ?? []).filter((_, idx) => idx !== choiceIndex),
                      }))
                    }
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                disabled={(question.choices ?? []).length >= 20}
                onClick={() =>
                  updateQuestion(question.id, (item) => ({
                    ...item,
                    choices: [
                      ...(item.choices ?? []),
                      `Option ${(item.choices ?? []).length + 1}`,
                    ],
                  }))
                }
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40 sm:w-auto sm:justify-start"
              >
                <Plus size={13} />
                Add option
              </button>
            </div>
          )}

          <div className="flex items-center justify-end border-t border-slate-200/80 pt-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) =>
                  updateQuestion(question.id, (item) => ({ ...item, required: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              Required field
            </label>
          </div>
        </article>
      ))}

      <button
        type="button"
        onClick={() => onChange([...questions, makeQuestion()])}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-2.5 text-xs font-medium text-slate-700 transition hover:border-emerald-500 hover:bg-emerald-50/40 hover:text-emerald-800"
      >
        <Plus size={15} />
        Add question
      </button>
    </section>
  );
}

function AgreementEditor({
  body,
  onChange,
}: {
  body: string;
  onChange: (body: string) => void;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor="agreement-terms" className="font-medium text-slate-700">
          Agreement terms
        </label>
        <span className="text-slate-400 tabular-nums">{body.length} / 30,000</span>
      </div>
      <textarea
        id="agreement-terms"
        rows={14}
        maxLength={30000}
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write scope, deliverables, payment terms, or legal clauses..."
        aria-label="Terms"
        className="w-full rounded-xl border border-slate-300 bg-white p-3.5 font-mono text-xs leading-relaxed text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:p-4"
      />
    </section>
  );
}

function InvoiceEditor({
  content,
  onChange,
}: {
  content: DocumentContent;
  onChange: (content: DocumentContent) => void;
}) {
  const items = content.lineItems ?? [];
  const currency = content.currency || "USD";
  const total = items.reduce(
    (sum, item) =>
      sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0),
    0
  );

  function setField<K extends keyof DocumentContent>(key: K, value: DocumentContent[K]) {
    onChange({ ...content, [key]: value });
  }

  function updateLine(index: number, key: keyof InvoiceLine, value: string) {
    onChange({
      ...content,
      lineItems: items.map((item, current) =>
        current === index
          ? { ...item, [key]: key === "description" ? value : Number(value) || 0 }
          : item
      ),
    });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-xs font-medium text-slate-600">Invoice total</span>
        <strong className="text-lg font-semibold text-emerald-700 tabular-nums">
          {formatCurrency(total, currency)}
        </strong>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Business name</span>
          <input
            value={content.businessName ?? ""}
            onChange={(e) => setField("businessName", e.target.value)}
            placeholder="Your business"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Invoice number</span>
          <input
            value={content.invoiceNumber ?? ""}
            onChange={(e) => setField("invoiceNumber", e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Customer name</span>
          <input
            value={content.customerName ?? ""}
            onChange={(e) => setField("customerName", e.target.value)}
            placeholder="Client or company"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Customer email</span>
          <input
            type="email"
            value={content.customerEmail ?? ""}
            onChange={(e) => setField("customerEmail", e.target.value)}
            placeholder="billing@client.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Issue date</span>
          <input
            type="date"
            value={content.issueDate ?? ""}
            onChange={(e) => setField("issueDate", e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
          />
        </label>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Due date</span>
            <input
              type="date"
              value={content.dueDate ?? ""}
              onChange={(e) => setField("dueDate", e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-emerald-600"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Currency</span>
            <input
              maxLength={3}
              value={currency}
              onChange={(e) => setField("currency", e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 uppercase outline-none focus:border-emerald-600"
            />
          </label>
        </div>
      </div>

      {/* Line Items */}
      <div className="space-y-2.5">
        <span className="block text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Line items
        </span>
        {items.map((item, idx) => {
          const lineTotal =
            Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-12 sm:items-center"
            >
              <input
                value={item.description}
                onChange={(e) => updateLine(idx, "description", e.target.value)}
                placeholder="Item description"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-950 outline-none focus:border-emerald-600 sm:col-span-5"
              />
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                aria-label={`Quantity ${idx + 1}`}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-950 outline-none focus:border-emerald-600 sm:col-span-2"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateLine(idx, "unitPrice", e.target.value)}
                aria-label={`Unit price ${idx + 1}`}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-950 outline-none focus:border-emerald-600 sm:col-span-2"
              />
              <div className="flex items-center justify-between pt-1 sm:col-span-3 sm:justify-end sm:gap-2 sm:pt-0">
                <span className="text-xs font-semibold text-slate-800 tabular-nums">
                  {formatCurrency(lineTotal, currency)}
                </span>
                <button
                  type="button"
                  disabled={items.length <= 1}
                  onClick={() =>
                    onChange({
                      ...content,
                      lineItems: items.filter((_, i) => i !== idx),
                    })
                  }
                  className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            onChange({
              ...content,
              lineItems: [...items, { description: "", quantity: 1, unitPrice: 0 }],
            })
          }
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 sm:w-auto sm:py-1.5"
        >
          <Plus size={14} />
          Add line item
        </button>
      </div>
    </section>
  );
}

function ResponsePanel({
  query,
  questions,
  type,
}: {
  query: { data?: FormResponse[]; isLoading: boolean; isError: boolean };
  questions: DocumentQuestion[];
  type: "FORM" | "AGREEMENT";
}) {
  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-14 text-slate-400">
        <LoaderCircle className="animate-spin" size={18} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-6 text-center text-xs text-rose-700">
        Couldn’t load {type === "FORM" ? "responses" : "signatures"}.
      </div>
    );
  }
  const rows = query.data ?? [];
  if (!rows.length) {
    return (
      <div className="p-10 text-center text-xs text-slate-500">
        No {type === "FORM" ? "responses" : "signatures"} yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200 p-4 sm:p-6">
      {rows.map((row) => (
        <div key={row.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
          <div className="flex flex-col justify-between gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {row.name || row.signedName || "Anonymous"}
              </p>
              <p className="truncate text-xs text-slate-500">{row.email}</p>
            </div>
            <span className="text-xs text-slate-400">
              {new Date(row.signedAt || row.submittedAt).toLocaleString()}
            </span>
          </div>
          {type === "FORM" && row.answers && (
            <dl className="mt-2 space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs">
              {questions.map((q) => {
                const val = row.answers?.[q.id];
                return (
                  <div key={q.id} className="min-w-0">
                    <dt className="text-slate-500">{q.prompt || "Question"}</dt>
                    <dd className="mt-0.5 font-medium break-words text-slate-900">
                      {Array.isArray(val) ? val.join(", ") : val === undefined || val === "" ? "—" : val}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

export function PublicDocumentPage() {
    const { token = "" } = useParams();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [consent, setConsent] = useState(false);
    const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
    const [submitted, setSubmitted] = useState(false);
    const [validationError, setValidationError] = useState("");
    const documentQuery = useQuery({
      queryKey: ["public-document", token],
      queryFn: () => apiRequest<PublicDocument>(`/public-documents/${encodeURIComponent(token)}`),
      enabled: Boolean(token),
    });
    const document = documentQuery.data;
    const submission = useMutation({
      mutationFn: () => {
        if (!document) throw new Error("This document is unavailable.");
        const path = `/public-documents/${encodeURIComponent(token)}/${document.type === "FORM" ? "responses" : "sign"}`;
        const submissionAnswers = Object.fromEntries(
          Object.entries(answers).filter(([, answer]) =>
            Array.isArray(answer) ? answer.length > 0 : answer !== "",
          ),
        );
        const body = document.type === "FORM"
          ? { name: name.trim(), email: email.trim(), answers: submissionAnswers }
          : { name: name.trim(), email: email.trim(), consent };
        return apiRequest<{ id: string }>(path, {
          method: "POST",
          body: JSON.stringify(body),
        });
      },
      onSuccess: () => setSubmitted(true),
    });

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!document || document.type === "INVOICE") return;
      setValidationError("");
      if (document.type === "FORM") {
        const missing = (document.content.questions ?? []).find((question) => {
          if (!question.required) return false;
          const answer = answers[question.id];
          return Array.isArray(answer)
            ? answer.length === 0
            : typeof answer === "number"
              ? !Number.isFinite(answer) || Math.abs(answer) > 1_000_000_000_000
              : !answer?.trim();
        });
        if (missing) {
          setValidationError(`Please answer “${missing.prompt || "the required question"}”.`);
          return;
        }
      } else if (!consent) {
        setValidationError("Please confirm your consent to sign electronically.");
        return;
      }
      submission.mutate();
    }

    if (documentQuery.isPending) {
      return (
        <main className="public-document-page">
          <div className="public-document-card public-document-unavailable" role="status">
            <LoaderCircle className="document-spin" size={20} />
            <p>Loading shared document…</p>
          </div>
        </main>
      );
    }

    if (documentQuery.isError || !document) {
      return (
        <main className="public-document-page">
          <div className="public-document-card public-document-unavailable">
            <span className="eyebrow">SHARED DOCUMENT</span>
            <h1>This link isn&apos;t available.</h1>
            <p>It may have expired, been revoked, or the document is no longer published.</p>
            <Link to="/">Go to IMARA <ArrowUpRight size={14} /></Link>
          </div>
        </main>
      );
    }

    if (submitted) {
      return (
        <main className="public-document-page">
          <div className="public-document-card public-document-success">
            <span className="public-document-success-icon"><Check size={24} /></span>
            <span className="eyebrow">ALL SET</span>
            <h1>{document.type === "FORM" ? "Response recorded." : "Document signed."}</h1>
            <p>{document.type === "FORM"
              ? "Thank you for taking the time to respond."
              : "Your electronic signature and consent have been recorded."}</p>
            <Link to="/">Made with IMARA <ArrowUpRight size={14} /></Link>
          </div>
        </main>
      );
    }

    return (
      <main className="public-document-page">
        <article className="public-document-card">
          <div className={`public-document-banner public-${document.type.toLowerCase()}`}>
            <DocumentTypeIcon type={document.type} />
            <span>{KIND_META[document.type].label}</span>
          </div>
          <header className="public-document-heading">
            <span className="eyebrow">SHARED WITH YOU</span>
            <h1>{document.title}</h1>
            {document.description && <p>{document.description}</p>}
          </header>
          {document.type === "INVOICE" ? (
            <PublicInvoice content={document.content} title={document.title} />
          ) : (
            <form className="public-document-form" onSubmit={handleSubmit}>
              <label className="public-document-field">
                <span>Your name <em>Required</em></span>
                <input
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="public-document-field">
                <span>Email address <em>Required</em></span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {document.type === "FORM"
                ? (document.content.questions ?? []).map((question, index) => (
                  <PublicQuestion
                    key={question.id}
                    question={question}
                    index={index}
                    value={answers[question.id] ?? (question.type === "CHECKBOXES" ? [] : "")}
                    onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  />
                ))
                : <PublicAgreement
                  content={document.content}
                  consent={consent}
                  onConsentChange={setConsent}
                />}
              {(validationError || submission.isError) && (
                <p className="form-alert" role="alert">
                  {validationError || (submission.error instanceof Error
                    ? submission.error.message
                    : "Your submission could not be sent.")}
                </p>
              )}
              <button
                className="button button-green public-document-submit"
                type="submit"
                disabled={submission.isPending}
              >
                {submission.isPending
                  ? <LoaderCircle className="document-spin" size={16} />
                  : document.type === "FORM" ? <Send size={15} /> : <FileSignature size={15} />}
                {submission.isPending
                  ? "Sending…"
                  : document.type === "FORM" ? "Submit response" : "Sign agreement"}
              </button>
            </form>
          )}
          <footer className="public-document-footer">
            <FileCheck2 size={14} /> Securely shared with IMARA
          </footer>
        </article>
      </main>
    );
  }

  function PublicQuestion({
    question,
    index,
    value,
    onChange,
  }: {
    question: DocumentQuestion;
    index: number;
    value: string | string[] | number;
    onChange: (value: string | string[] | number) => void;
  }) {
    return (
      <fieldset className="public-document-question">
        <legend>{index + 1}. {question.prompt || "Question"}{question.required && <em>Required</em>}</legend>
        {question.type === "SHORT_ANSWER" && (
          <input
            maxLength={2000}
            required={question.required}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Your answer"
          />
        )}
        {question.type === "PARAGRAPH" && (
          <textarea
            maxLength={10000}
            required={question.required}
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Your answer"
          />
        )}
        {question.type === "EMAIL" && (
          <input
            type="email"
            maxLength={320}
            required={question.required}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="name@example.com"
          />
        )}
        {question.type === "NUMBER" && (
          <input
            type="number"
            step="any"
            min={-1_000_000_000_000}
            max={1_000_000_000_000}
            required={question.required}
            value={typeof value === "number" || typeof value === "string" ? value : ""}
            onChange={(event) => onChange(
              event.target.value === "" ? "" : event.currentTarget.valueAsNumber,
            )}
            placeholder="Your answer"
          />
        )}
        {question.type === "MULTIPLE_CHOICE" && (question.choices ?? []).map((choice) => (
          <label className="public-document-choice" key={choice}>
            <input
              type="radio"
              name={`question-${question.id}`}
              required={question.required}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            {choice}
          </label>
        ))}
        {question.type === "CHECKBOXES" && (question.choices ?? []).map((choice) => {
          const checkedValues = Array.isArray(value) ? value : [];
          return (
            <label className="public-document-choice" key={choice}>
              <input
                type="checkbox"
                checked={checkedValues.includes(choice)}
                onChange={(event) => onChange(
                  event.target.checked
                    ? [...checkedValues, choice]
                    : checkedValues.filter((item) => item !== choice),
                )}
              />
              {choice}
            </label>
          );
        })}
      </fieldset>
    );
  }

  function PublicAgreement({
    content,
    consent,
    onConsentChange,
  }: {
    content: DocumentContent;
    consent: boolean;
    onConsentChange: (value: boolean) => void;
  }) {
    return (
      <section className="public-agreement">
        <div className="public-agreement-copy">{content.body || "No agreement terms have been added."}</div>
        <label className="public-agreement-consent">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
          />
          <span>I agree to the terms above and consent to signing this document electronically.</span>
        </label>
        <p>Your name, email, consent, and signature time will be recorded.</p>
      </section>
    );
  }

  function PublicInvoice({ content, title }: { content: DocumentContent; title: string }) {
    const items = content.lineItems ?? [];
    const currency = content.currency || "USD";
    const total = typeof content.total === "number"
      ? content.total
      : items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return (
      <div className="public-invoice">
        <div className="public-invoice-top">
          <div><span>FROM</span><strong>{content.businessName || title}</strong></div>
          <div><span>INVOICE</span><strong>{content.invoiceNumber || "—"}</strong></div>
        </div>
        <div className="public-invoice-recipient">
          <span>BILL TO</span>
          <strong>{content.customerName || "Customer"}</strong>
          {content.customerEmail && <small>{content.customerEmail}</small>}
        </div>
        <div className="public-invoice-dates">
          <span>Issued <strong>{content.issueDate || "—"}</strong></span>
          <span>Due <strong>{content.dueDate || "—"}</strong></span>
        </div>
        <div className="public-invoice-lines">
          <div className="public-invoice-line public-invoice-line-header">
            <span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span>
          </div>
          {items.map((item, index) => (
            <div className="public-invoice-line" key={`invoice-${index}`}>
              <span>{item.description || "—"}</span>
              <span>{item.quantity}</span>
              <span>{formatCurrency(item.unitPrice, currency)}</span>
              <strong>{formatCurrency(item.total ?? item.quantity * item.unitPrice, currency)}</strong>
            </div>
          ))}
        </div>
        <div className="public-invoice-total">
          <span>Total due</span><strong>{formatCurrency(total, currency)}</strong>
        </div>
        {content.note && <p className="public-invoice-note">{content.note}</p>}
        <button className="button button-green public-invoice-print" type="button" onClick={() => window.print()}>
          <Printer size={15} /> Print or save as PDF
        </button>
      </div>
    );
  }