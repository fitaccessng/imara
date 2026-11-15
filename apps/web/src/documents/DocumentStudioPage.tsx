import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowUpRight, Check, Copy, Download, Eye, FileCheck2,
  FileSignature, FileText, Link2, ListPlus, LoaderCircle, Plus, Printer, Send, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { PageShell } from "../pages/PageShell";
import "./documents.css";

type DocumentKind = "FORM" | "AGREEMENT" | "INVOICE";
type QuestionKind = "SHORT_ANSWER" | "PARAGRAPH" | "MULTIPLE_CHOICE" | "CHECKBOXES";

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

interface FormResponse {
  id: string;
  name: string;
  email: string;
  answers?: Record<string, string | string[]>;
  submittedAt: string;
  signedAt?: string | null;
  signedName?: string | null;
  consent?: boolean;
}

interface PublicDocument extends Pick<StudioDocument, "id" | "type" | "title" | "description" | "content"> {}

const kindLabel: Record<DocumentKind, string> = {
  FORM: "Form",
  AGREEMENT: "Agreement",
  INVOICE: "Invoice",
};

const questionLabel: Record<QuestionKind, string> = {
  SHORT_ANSWER: "Short answer",
  PARAGRAPH: "Paragraph",
  MULTIPLE_CHOICE: "Multiple choice",
  CHECKBOXES: "Checkboxes",
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
  if (!document.title.trim()) return "Add a title before sharing.";
  if (document.type === "FORM") {
    const questions = document.content.questions ?? [];
    if (questions.some((question) => !question.prompt.trim())) return "Give every question a prompt before sharing.";
    if (questions.some((question) => {
      if (question.type !== "MULTIPLE_CHOICE" && question.type !== "CHECKBOXES") return false;
      const choices = (question.choices ?? []).map((choice) => choice.trim());
      return choices.length === 0 || choices.some((choice) => !choice) || new Set(choices).size !== choices.length;
    })) return "Choice questions need at least one unique, non-empty choice.";
  }
  if (document.type === "AGREEMENT" && !document.content.body?.trim()) return "Add the agreement terms before sharing.";
  if (document.type === "INVOICE") {
    const content = document.content;
    if (!content.businessName?.trim() || !content.customerName?.trim() || !content.invoiceNumber?.trim()) {
      return "Add your business name, customer name, and invoice number.";
    }
    if (!content.customerEmail?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.customerEmail.trim())) {
      return "Add a valid customer email address.";
    }
    if (!content.issueDate || !content.dueDate) return "Add the issue date and due date.";
    const lineItems = content.lineItems ?? [];
    if (!lineItems.length || lineItems.some((item) => !item.description.trim() || item.quantity <= 0 || item.unitPrice < 0)) {
      return "Add a description, positive quantity, and valid rate for every invoice item.";
    }
  }
  return null;
}

function DocumentTypeIcon({ type }: { type: DocumentKind }) {
  if (type === "FORM") return <ListPlus size={19} />;
  if (type === "AGREEMENT") return <FileSignature size={19} />;
  return <FileText size={19} />;
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
    enabled: Boolean(selectedId && activePanel === "RESPONSES" && (editing?.type === "FORM" || editing?.type === "AGREEMENT")),
  });
  useEffect(() => {
    if (selectedQuery.data) setEditing(selectedQuery.data);
  }, [selectedQuery.data]);

  const createDocument = useMutation({
    mutationFn: (type: DocumentKind) => apiRequest<StudioDocument>("/documents", {
      method: "POST",
      body: JSON.stringify({
        type,
        title: `Untitled ${kindLabel[type].toLowerCase()}`,
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
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The document could not be created."),
  });
  const saveDocument = useMutation({
    mutationFn: (document: StudioDocument) => apiRequest<StudioDocument>(`/documents/${document.id}`, {
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
      setNotice("Changes saved.");
      setError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["personal-documents"] }),
        queryClient.invalidateQueries({ queryKey: ["personal-document", saved.id] }),
      ]);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Changes could not be saved."),
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
      const link = await apiRequest<{ token: string }>(`/documents/${document.id}/share`, { method: "POST" });
      return { published, token: link.token };
    },
    onSuccess: async ({ published, token }) => {
      setEditing({ ...published, shareActive: true });
      setShareUrl(`${window.location.origin}/respond/${encodeURIComponent(token)}`);
      setNotice("Your public link is ready. Anyone with the link can open it.");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "A public link could not be created."),
  });
  const revokeShare = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/documents/${id}/share`, { method: "DELETE" }),
    onSuccess: async () => {
      if (editing) setEditing({ ...editing, shareActive: false, published: false });
      setShareUrl("");
      setNotice("The public link has been revoked.");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The public link could not be revoked."),
  });
  const deleteDocument = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelectedId("");
      setEditing(null);
      setShareUrl("");
      await queryClient.invalidateQueries({ queryKey: ["personal-documents"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The document could not be deleted."),
  });

  function updateEditing(update: (current: StudioDocument) => StudioDocument) {
    setEditing((current) => current ? update(current) : current);
    setNotice("");
  }

  function updateContent(update: (content: DocumentContent) => DocumentContent) {
    updateEditing((current) => ({ ...current, content: update(current.content) }));
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Link copied to clipboard.");
    } catch {
      setError("Could not copy automatically. Select and copy the link from the field.");
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
  const selectedFromList = documents.find((document) => document.id === selectedId);

  return (
    <PageShell
      eyebrow="PERSONAL STUDIO"
      title="Forms & documents"
      description="Build shareable forms, agreements, and invoices in one calm workspace."
    >
      <div className="document-studio">
        <aside className="document-studio-rail" aria-label="Your documents">
          <div className="document-studio-rail-heading">
            <span className="eyebrow">YOUR WORK</span>
            <span>{documents.length} saved</span>
          </div>
          <div className="document-studio-create">
            {(["FORM", "AGREEMENT", "INVOICE"] as const).map((type) => (
              <button
                type="button"
                key={type}
                disabled={createDocument.isPending}
                onClick={() => {
                  setError("");
                  setNotice("");
                  createDocument.mutate(type);
                }}
              >
                <span className={`document-studio-type-icon type-${type.toLowerCase()}`}><DocumentTypeIcon type={type} /></span>
                <span>New {kindLabel[type].toLowerCase()}</span>
                <Plus size={15} />
              </button>
            ))}
          </div>
          {documentsQuery.isLoading ? <p className="document-studio-muted">Loading your studio…</p>
            : documentsQuery.isError ? <div className="document-studio-error" role="alert">
              <p>{documentsQuery.error instanceof Error ? documentsQuery.error.message : "Documents couldn’t load."}</p>
              <button type="button" onClick={() => void documentsQuery.refetch()}>Try again</button>
            </div>
              : documents.length ? <div className="document-studio-list">
                {documents.map((document) => (
                  <button
                    className={`document-studio-list-item ${selectedId === document.id ? "is-current" : ""}`}
                    type="button"
                    key={document.id}
                    onClick={() => {
                      setSelectedId(document.id);
                      setEditing(null);
                      setActivePanel("EDITOR");
                      setShareUrl("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    <DocumentTypeIcon type={document.type} />
                    <span><strong>{document.title}</strong><small>{kindLabel[document.type]} · {document.published ? "Published" : "Draft"}</small></span>
                    {document.type === "FORM" && <em>{document.responseCount}</em>}
                  </button>
                ))}
              </div> : <p className="document-studio-muted">Your next great document starts with a blank page.</p>}
        </aside>

        <section className="document-studio-workspace">
          {!selectedId ? (
            <div className="document-studio-welcome">
              {error && <p className="form-alert" role="alert">{error}</p>}
              <div className="document-studio-welcome-mark"><FileCheck2 size={26} /></div>
              <span className="eyebrow">A BETTER WAY TO ASK, AGREE, AND BILL</span>
              <h2>Make the paperwork<br />work for you.</h2>
              <p>Create a form to collect responses, an agreement to sign, or an invoice to send. Publish a link when you’re ready.</p>
              <div className="document-studio-welcome-actions">
                <button className="button button-green" type="button" onClick={() => createDocument.mutate("FORM")}><ListPlus size={16} />Create a form</button>
                <button className="button button-outline" type="button" onClick={() => createDocument.mutate("AGREEMENT")}><FileSignature size={16} />Create agreement</button>
                <button className="button button-outline" type="button" onClick={() => createDocument.mutate("INVOICE")}><FileText size={16} />Create invoice</button>
              </div>
            </div>
          ) : selectedQuery.isLoading || !editing ? (
            <div className="page-loading"><span className="loader" />Opening your document…</div>
          ) : selectedQuery.isError ? (
            <div className="document-studio-empty-state" role="alert">
              <strong>This document couldn’t be opened.</strong>
              <p>{selectedQuery.error instanceof Error ? selectedQuery.error.message : "Please try again."}</p>
              <button className="button button-outline" type="button" onClick={() => void selectedQuery.refetch()}>Try again</button>
            </div>
          ) : (
            <div className="document-editor">
              <div className="document-editor-topbar">
                <button className="document-back-button" type="button" onClick={() => { setSelectedId(""); setEditing(null); }}>
                  <ArrowLeft size={15} /> All documents
                </button>
                <div className="document-editor-status">
                  <span className={`document-status-dot ${editing.published ? "is-published" : ""}`} />
                  {editing.published ? "Published" : "Draft"}
                  {selectedFromList && <small>Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(selectedFromList.updatedAt))}</small>}
                </div>
              </div>
              <div className="document-editor-heading">
                <span className={`document-studio-type-icon type-${editing.type.toLowerCase()}`}><DocumentTypeIcon type={editing.type} /></span>
                <div><span className="eyebrow">{kindLabel[editing.type].toUpperCase()} BUILDER</span><h2>{editing.title}</h2></div>
                <button className="document-delete-button" type="button" aria-label={`Delete ${editing.title}`} disabled={deleteDocument.isPending} onClick={() => {
                  if (window.confirm(`Delete “${editing.title}”? This cannot be undone.`)) deleteDocument.mutate(editing.id);
                }}><Trash2 size={16} /></button>
              </div>

              <div className="document-editor-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={activePanel === "EDITOR"} onClick={() => setActivePanel("EDITOR")}><FileText size={15} />Editor</button>
                {(editing.type === "FORM" || editing.type === "AGREEMENT") && <button type="button" role="tab" aria-selected={activePanel === "RESPONSES"} onClick={() => setActivePanel("RESPONSES")}><Check size={15} />{editing.type === "FORM" ? "Responses" : "Signatures"} <span>{editing.responseCount}</span></button>}
              </div>

              {error && <p className="form-alert" role="alert">{error}</p>}
              {notice && <p className="document-studio-notice" role="status">{notice}</p>}

              {activePanel === "RESPONSES" && (editing.type === "FORM" || editing.type === "AGREEMENT") ? (
                <ResponsePanel query={responsesQuery} questions={editing.content.questions ?? []} type={editing.type} />
              ) : (
                <div className="document-editor-body">
                  <label className="document-editor-field document-title-field">
                    <span>Document title</span>
                    <input maxLength={160} value={editing.title} onChange={(event) => updateEditing((current) => ({ ...current, title: event.target.value }))} placeholder="Give it a clear name" />
                  </label>
                  <label className="document-editor-field">
                    <span>{editing.type === "FORM" ? "Description" : "Message or note"} <small>Optional</small></span>
                    <textarea rows={2} maxLength={2000} value={editing.description ?? ""} onChange={(event) => updateEditing((current) => ({ ...current, description: event.target.value }))} placeholder="Add a little context for the person receiving this" />
                  </label>

                  {editing.type === "FORM" && <FormQuestionEditor
                    questions={editing.content.questions ?? []}
                    onChange={(questions) => updateContent((content) => ({ ...content, questions }))}
                  />}
                  {editing.type === "AGREEMENT" && <AgreementEditor
                    body={editing.content.body ?? ""}
                    onChange={(body) => updateContent((content) => ({ ...content, body }))}
                  />}
                  {editing.type === "INVOICE" && <InvoiceEditor
                    content={editing.content}
                    onChange={(content) => updateEditing((current) => ({ ...current, content }))}
                  />}

                  <div className="document-editor-actions">
                    <button className="button button-outline" type="button" disabled={saveDocument.isPending || !editing.title.trim()} onClick={() => saveDocument.mutate(editing)}>
                      {saveDocument.isPending ? <LoaderCircle className="document-spin" size={15} /> : <Check size={15} />}
                      {saveDocument.isPending ? "Saving…" : "Save changes"}
                    </button>
                    {editing.shareActive && <button className="button button-outline document-revoke-button" type="button" disabled={revokeShare.isPending} onClick={() => revokeShare.mutate(editing.id)}>
                      {revokeShare.isPending ? "Revoking…" : "Revoke link"}
                    </button>}
                    <button className="button button-green" type="button" disabled={shareDocument.isPending} onClick={() => publishAndShare(editing)}>
                      {shareDocument.isPending ? <LoaderCircle className="document-spin" size={15} /> : <Send size={15} />}
                      {shareDocument.isPending ? "Preparing link…" : editing.shareActive ? "Create new link" : "Publish & share"}
                    </button>
                  </div>
                  {shareUrl && <div className="document-share-link">
                    <div className="document-share-link-head"><Link2 size={16} /><strong>Your public link</strong><span>Anyone with the link can open it</span></div>
                    <div><input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Public document link" /><button className="button button-green" type="button" onClick={() => void copyShareLink()}><Copy size={14} />Copy</button></div>
                    <a href={shareUrl} target="_blank" rel="noreferrer">Preview public page <ArrowUpRight size={13} /></a>
                  </div>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function FormQuestionEditor({ questions, onChange }: { questions: DocumentQuestion[]; onChange: (questions: DocumentQuestion[]) => void }) {
  function updateQuestion(id: string, update: (question: DocumentQuestion) => DocumentQuestion) {
    onChange(questions.map((question) => question.id === id ? update(question) : question));
  }

  return <section className="form-question-editor" aria-label="Form questions">
    <div className="form-question-heading"><div><span className="eyebrow">BUILD YOUR FORM</span><h3>Questions</h3></div><span>{questions.length} added</span></div>
    {!questions.length && <div className="form-question-empty"><ListPlus size={20} /><strong>Start with a question</strong><span>Choose a response type and add as many questions as you need.</span></div>}
    {questions.map((question, index) => (
      <article className="form-question-card" key={question.id}>
        <div className="form-question-card-top"><span className="form-question-number">{String(index + 1).padStart(2, "0")}</span><select aria-label={`Response type for question ${index + 1}`} value={question.type} onChange={(event) => {
          const type = event.target.value as QuestionKind;
          updateQuestion(question.id, (item) => {
            const { choices, ...rest } = item;
            return type === "MULTIPLE_CHOICE" || type === "CHECKBOXES"
              ? { ...rest, type, choices: choices ?? ["Option 1", "Option 2"] }
              : { ...rest, type };
          });
        }}>
          {Object.entries(questionLabel).map(([type, label]) => <option value={type} key={type}>{label}</option>)}
        </select><button type="button" className="document-icon-button" aria-label={`Remove question ${index + 1}`} onClick={() => onChange(questions.filter((item) => item.id !== question.id))}><Trash2 size={15} /></button></div>
        <input className="form-question-title" value={question.prompt} onChange={(event) => updateQuestion(question.id, (item) => ({ ...item, prompt: event.target.value }))} placeholder={`Question ${index + 1}`} aria-label={`Question ${index + 1}`} />
        {(question.type === "MULTIPLE_CHOICE" || question.type === "CHECKBOXES") && <div className="form-question-choices">
          <label>Answer choices</label>
          {(question.choices ?? []).map((choice, choiceIndex) => <div className="form-question-choice-row" key={`${question.id}-choice-${choiceIndex}`}>
            <span className={question.type === "CHECKBOXES" ? "choice-checkbox-icon" : "choice-radio-icon"} aria-hidden="true" />
            <input maxLength={200} value={choice} onChange={(event) => updateQuestion(question.id, (item) => ({
              ...item,
              choices: (item.choices ?? []).map((option, index) => index === choiceIndex ? event.target.value : option),
            }))} aria-label={`Question ${index + 1}, choice ${choiceIndex + 1}`} placeholder={`Option ${choiceIndex + 1}`} />
            <button type="button" className="document-icon-button" disabled={(question.choices ?? []).length <= 1} aria-label={`Remove choice ${choiceIndex + 1}`} onClick={() => updateQuestion(question.id, (item) => ({
              ...item,
              choices: (item.choices ?? []).filter((_, optionIndex) => optionIndex !== choiceIndex),
            }))}><Trash2 size={13} /></button>
          </div>)}
          <button type="button" className="form-add-choice" disabled={(question.choices ?? []).length >= 20} onClick={() => updateQuestion(question.id, (item) => ({
            ...item,
            choices: [...(item.choices ?? []), `Option ${(item.choices ?? []).length + 1}`],
          }))}><Plus size={13} />Add choice</button>
        </div>}
        {question.type === "SHORT_ANSWER" && <div className="form-question-answer-preview">Short answer text</div>}
        {question.type === "PARAGRAPH" && <div className="form-question-answer-preview is-paragraph">Long answer</div>}
        <label className="form-question-required"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.id, (item) => ({ ...item, required: event.target.checked }))} />Required</label>
      </article>
    ))}
    <button className="form-add-question" type="button" onClick={() => onChange([...questions, makeQuestion()])}><Plus size={16} />Add a question</button>
    <p className="form-response-note">Responses include the respondent’s name and email address.</p>
  </section>;
}

function AgreementEditor({ body, onChange }: { body: string; onChange: (body: string) => void }) {
  return <section className="agreement-editor">
    <div className="agreement-editor-heading"><FileSignature size={17} /><div><strong>Agreement terms</strong><span>The recipient will review this text and sign electronically.</span></div></div>
    <textarea rows={15} maxLength={30000} value={body} onChange={(event) => onChange(event.target.value)} placeholder={"Write the agreement here...\n\nInclude the parties, terms, dates, and any relevant conditions."} aria-label="Agreement terms" />
    <p>Electronic signature includes the signer’s name, email, consent, and signature time.</p>
  </section>;
}

function InvoiceEditor({ content, onChange }: { content: DocumentContent; onChange: (content: DocumentContent) => void }) {
  const items = content.lineItems ?? [];
  const currency = content.currency || "USD";
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0);

  function setField<K extends keyof DocumentContent>(key: K, value: DocumentContent[K]) {
    onChange({ ...content, [key]: value });
  }

  function updateLine(index: number, key: keyof InvoiceLine, value: string) {
    onChange({ ...content, lineItems: items.map((item, current) => current === index
      ? { ...item, [key]: key === "description" ? value : Number(value) || 0 }
      : item) });
  }

  return <section className="invoice-editor">
    <div className="invoice-editor-heading"><span className="eyebrow">INVOICE DETAILS</span><strong>{formatCurrency(total, currency)}</strong></div>
    <div className="invoice-editor-grid">
      <label className="document-editor-field"><span>Your business</span><input value={content.businessName ?? ""} onChange={(event) => setField("businessName", event.target.value)} placeholder="Business or sender name" /></label>
      <label className="document-editor-field"><span>Invoice number</span><input maxLength={80} value={content.invoiceNumber ?? ""} onChange={(event) => setField("invoiceNumber", event.target.value)} /></label>
      <label className="document-editor-field"><span>Bill to</span><input maxLength={160} value={content.customerName ?? ""} onChange={(event) => setField("customerName", event.target.value)} placeholder="Customer name" /></label>
      <label className="document-editor-field"><span>Customer email</span><input type="email" maxLength={320} value={content.customerEmail ?? ""} onChange={(event) => setField("customerEmail", event.target.value)} placeholder="name@example.com" /></label>
      <label className="document-editor-field"><span>Issue date</span><input type="date" value={content.issueDate ?? ""} onChange={(event) => setField("issueDate", event.target.value)} /></label>
      <label className="document-editor-field"><span>Due date</span><input type="date" value={content.dueDate ?? ""} onChange={(event) => setField("dueDate", event.target.value)} /></label>
      <label className="document-editor-field"><span>Currency</span><select value={currency} onChange={(event) => setField("currency", event.target.value)}><option value="USD">USD · US Dollar</option><option value="NGN">NGN · Naira</option><option value="GBP">GBP · Pound</option><option value="EUR">EUR · Euro</option><option value="CAD">CAD · Canadian Dollar</option><option value="GHS">GHS · Cedi</option></select></label>
    </div>
    <div className="invoice-line-items-heading"><strong>Items</strong><span>Description · quantity · rate</span></div>
    <div className="invoice-line-items">
      {items.map((item, index) => <div className="invoice-line-row" key={`line-${index}`}>
        <input aria-label={`Item ${index + 1} description`} maxLength={300} value={item.description} onChange={(event) => updateLine(index, "description", event.target.value)} placeholder="What are you billing for?" />
        <input aria-label={`Item ${index + 1} quantity`} type="number" min="0" step="0.01" value={item.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} />
        <input aria-label={`Item ${index + 1} unit price`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} />
        <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), currency)}</strong>
        <button type="button" className="document-icon-button" aria-label={`Remove item ${index + 1}`} disabled={items.length <= 1} onClick={() => setField("lineItems", items.filter((_, current) => current !== index))}><Trash2 size={15} /></button>
      </div>)}
    </div>
    <button className="invoice-add-line" type="button" onClick={() => setField("lineItems", [...items, { description: "", quantity: 1, unitPrice: 0 }])}><Plus size={15} />Add line item</button>
    <label className="document-editor-field"><span>Note <small>Optional</small></span><textarea rows={3} maxLength={2000} value={content.note ?? ""} onChange={(event) => setField("note", event.target.value)} placeholder="Payment instructions or a note for the customer" /></label>
    <p className="invoice-sharing-note">The public invoice is read-only. Recipients can print or save it as a PDF; payments are not collected here.</p>
  </section>;
}

function ResponsePanel({ query, questions, type }: { query: ReturnType<typeof useQuery<FormResponse[]>>; questions: DocumentQuestion[]; type: "FORM" | "AGREEMENT" }) {
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question.prompt || "Untitled question"])), [questions]);
  if (query.isLoading) return <div className="document-studio-muted">Loading responses…</div>;
  if (query.isError) return <div className="document-studio-error" role="alert"><p>{query.error instanceof Error ? query.error.message : "Responses couldn’t load."}</p><button type="button" onClick={() => void query.refetch()}>Try again</button></div>;
  const responses = query.data ?? [];
  function downloadCsv() {
    const columns = type === "FORM"
      ? ["Respondent name", "Respondent email", "Submitted at", ...questions.map((question) => question.prompt || "Untitled question")]
      : ["Signer name", "Signer email", "Signed name", "Signed at", "Consent"];
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = responses.map((response) => [
      response.name,
      response.email,
      response.submittedAt,
      ...(type === "FORM"
        ? questions.map((question) => {
          const answer = response.answers?.[question.id];
          return Array.isArray(answer) ? answer.join(", ") : answer ?? "";
        })
        : [response.signedName ?? "", response.signedAt ?? "", response.consent ? "Yes" : "No"]),
    ]);
    const contents = [columns, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "form-responses.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return <div className="form-response-panel">
    <div className="form-response-summary"><span><strong>{responses.length}</strong><small> {type === "FORM" ? "responses" : "signatures"}</small></span><p>{type === "FORM" ? "Each submission is saved with the respondent’s name and email." : "Electronic signatures include name, email, consent, and signed time."}</p>{responses.length > 0 && <button type="button" className="button button-outline button-small" onClick={downloadCsv}><Download size={14} />Export CSV</button>}</div>
    {!responses.length ? <div className="form-response-empty"><Eye size={21} /><strong>{type === "FORM" ? "No responses yet" : "No signatures yet"}</strong><span>{type === "FORM" ? "Share your form to start collecting answers." : "Share your agreement to request an electronic signature."}</span></div>
      : responses.map((response, index) => <article className="form-response-card" key={response.id}>
        <header><span className="form-response-index">#{String(index + 1).padStart(2, "0")}</span><div><strong>{response.name}</strong><small>{response.email} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(response.submittedAt))}</small></div></header>
        {type === "FORM"
          ? <dl>{Object.entries(response.answers ?? {}).map(([questionId, answer]) => <div key={questionId}><dt>{questionById.get(questionId) ?? "Question"}</dt><dd>{Array.isArray(answer) ? answer.join(", ") : answer || "—"}</dd></div>)}</dl>
          : <dl><div><dt>Electronic signature</dt><dd>{response.signedName || response.name}</dd></div><div><dt>Consent</dt><dd>{response.consent ? "Given" : "Not recorded"}</dd></div><div><dt>Signed at</dt><dd>{response.signedAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(response.signedAt)) : "—"}</dd></div></dl>}
      </article>)}
  </div>;
}

export function PublicDocumentPage() {
  const { token = "" } = useParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const documentQuery = useQuery({
    queryKey: ["public-document", token],
    queryFn: () => apiRequest<PublicDocument>(`/public-documents/${encodeURIComponent(token)}`),
    enabled: Boolean(token),
  });
  const document = documentQuery.data;
  const mutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error("This document is unavailable.");
      const path = `/public-documents/${encodeURIComponent(token)}/${document.type === "FORM" ? "responses" : "sign"}`;
      const body = document.type === "FORM" ? { name: name.trim(), email: email.trim(), answers } : { name: name.trim(), email: email.trim(), consent };
      return apiRequest(path, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { setSubmitted(true); setError(""); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Your submission could not be sent."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!document) return;
    if (document.type === "FORM") {
      const missing = (document.content.questions ?? []).find((question) => question.required && !(answers[question.id] ?? "").toString().trim());
      if (missing) {
          setError(`Please answer “${missing.prompt || "the required question"}”.`);
        return;
      }
    } else if (!consent) {
      setError("Please confirm your consent to sign electronically.");
      return;
    }
    mutation.mutate();
  }

  if (documentQuery.isPending) return <main className="public-document-page"><div className="public-document-card"><span className="loader" />Loading shared document…</div></main>;
  if (documentQuery.isError || !document) return <main className="public-document-page"><div className="public-document-card public-document-unavailable"><span className="eyebrow">SHARED DOCUMENT</span><h1>This link isn’t available.</h1><p>It may have expired, been revoked, or the document is no longer published.</p><a href="/">Go to IMARA <ArrowUpRight size={14} /></a></div></main>;
  if (submitted) return <main className="public-document-page"><div className="public-document-card public-document-success"><span className="public-document-success-icon"><Check size={24} /></span><span className="eyebrow">ALL SET</span><h1>{document.type === "FORM" ? "Response recorded." : "Document signed."}</h1><p>{document.type === "FORM" ? "Thank you for taking the time to respond." : "Your electronic signature and consent have been recorded."}</p><a href="/">Made with IMARA <ArrowUpRight size={14} /></a></div></main>;

  return <main className="public-document-page">
    <article className="public-document-card">
      <div className={`public-document-banner public-${document.type.toLowerCase()}`}><DocumentTypeIcon type={document.type} /><span>{kindLabel[document.type]}</span></div>
      <header className="public-document-heading"><span className="eyebrow">SHARED WITH YOU</span><h1>{document.title}</h1>{document.description && <p>{document.description}</p>}</header>
      {document.type === "INVOICE" ? <PublicInvoice content={document.content} title={document.title} /> : (
        <form className="public-document-form" onSubmit={handleSubmit}>
          <label className="public-document-field"><span>Your name <em>Required</em></span><input autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="public-document-field"><span>Email address <em>Required</em></span><input type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {document.type === "FORM" ? (document.content.questions ?? []).map((question, index) => <PublicQuestion
            key={question.id}
            question={question}
            index={index}
            value={answers[question.id] ?? (question.type === "CHECKBOXES" ? [] : "")}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          />) : <PublicAgreement content={document.content} consent={consent} onConsentChange={setConsent} />}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <button className="button button-green public-document-submit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <LoaderCircle className="document-spin" size={16} /> : document.type === "FORM" ? <Send size={15} /> : <FileSignature size={15} />}
            {mutation.isPending ? "Sending…" : document.type === "FORM" ? "Submit response" : "Sign agreement"}
          </button>
        </form>
      )}
      <footer className="public-document-footer"><FileCheck2 size={14} /> Securely shared with IMARA</footer>
    </article>
  </main>;
}

function PublicQuestion({ question, index, value, onChange }: {
  question: DocumentQuestion;
  index: number;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  return <fieldset className="public-document-question">
    <legend>{index + 1}. {question.prompt || "Question"}{question.required && <em>Required</em>}</legend>
    {question.type === "SHORT_ANSWER" && <input maxLength={4000} required={question.required} value={Array.isArray(value) ? "" : value} onChange={(event) => onChange(event.target.value)} placeholder="Your answer" />}
    {question.type === "PARAGRAPH" && <textarea maxLength={10000} required={question.required} rows={4} value={Array.isArray(value) ? "" : value} onChange={(event) => onChange(event.target.value)} placeholder="Your answer" />}
    {question.type === "MULTIPLE_CHOICE" && (question.choices ?? []).map((choice) => <label className="public-document-choice" key={choice}><input type="radio" name={`question-${question.id}`} required={question.required} checked={value === choice} onChange={() => onChange(choice)} />{choice}</label>)}
    {question.type === "CHECKBOXES" && (question.choices ?? []).map((choice) => {
      const checkedValues = Array.isArray(value) ? value : [];
      return <label className="public-document-choice" key={choice}><input type="checkbox" checked={checkedValues.includes(choice)} onChange={(event) => onChange(event.target.checked ? [...checkedValues, choice] : checkedValues.filter((item) => item !== choice))} />{choice}</label>;
    })}
  </fieldset>;
}

function PublicAgreement({ content, consent, onConsentChange }: { content: DocumentContent; consent: boolean; onConsentChange: (value: boolean) => void }) {
  return <section className="public-agreement">
    <div className="public-agreement-copy">{content.body || "No agreement terms have been added."}</div>
    <label className="public-agreement-consent"><input type="checkbox" required checked={consent} onChange={(event) => onConsentChange(event.target.checked)} /><span>I agree to the terms above and consent to signing this document electronically.</span></label>
    <p>Your name, email, consent, and signature time will be recorded.</p>
  </section>;
}

function PublicInvoice({ content, title }: { content: DocumentContent; title: string }) {
  const items = content.lineItems ?? [];
  const currency = content.currency || "USD";
  const total = typeof content.total === "number" ? content.total : items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return <div className="public-invoice">
    <div className="public-invoice-top">
      <div><span>FROM</span><strong>{content.businessName || title}</strong></div>
      <div><span>INVOICE</span><strong>{content.invoiceNumber || "—"}</strong></div>
    </div>
    <div className="public-invoice-recipient"><span>BILL TO</span><strong>{content.customerName || "Customer"}</strong>{content.customerEmail && <small>{content.customerEmail}</small>}</div>
    <div className="public-invoice-dates"><span>Issued <strong>{content.issueDate || "—"}</strong></span><span>Due <strong>{content.dueDate || "—"}</strong></span></div>
    <div className="public-invoice-lines">
      <div className="public-invoice-line public-invoice-line-header"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
      {items.map((item, index) => <div className="public-invoice-line" key={`invoice-${index}`}><span>{item.description || "—"}</span><span>{item.quantity}</span><span>{formatCurrency(item.unitPrice, currency)}</span><strong>{formatCurrency(item.total ?? item.quantity * item.unitPrice, currency)}</strong></div>)}
    </div>
    <div className="public-invoice-total"><span>Total due</span><strong>{formatCurrency(total, currency)}</strong></div>
    {content.note && <p className="public-invoice-note">{content.note}</p>}
    <button className="button button-green public-invoice-print" type="button" onClick={() => window.print()}><Printer size={15} />Print or save as PDF</button>
  </div>;
}

export default DocumentStudioPage;
