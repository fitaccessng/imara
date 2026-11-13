import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  Eye,
  Heading2,
  Link2,
  Mail,
  Minus,
  Monitor,
  Search,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { apiRequest } from "../../lib/api";

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

type Audience = "ALL" | "FREE" | "PRO" | "BUSINESS";
type RecipientTarget = "AUDIENCE" | "SIGNUP_WINDOW" | "SELECTED";
const MAX_EMAIL_RECIPIENTS = 500;

interface Recipient {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface RecipientPage {
  items: Recipient[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

interface SendResult {
  campaignId: string;
  status: "QUEUED";
  queuedRecipientCount: number;
}

interface CampaignStatus {
  campaignId: string;
  subject: string;
  status: "QUEUED" | "SENDING" | "COMPLETED" | "COMPLETED_WITH_ERRORS";
  recipientCount: number;
  pendingCount: number;
  sendingCount: number;
  sentCount: number;
  failedCount: number;
  errors: Array<{ count: number; message: string }>;
}

const initialHtml = `<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:32px;line-height:1.15;color:#17364b;">A note from IMARA</h1>
<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#526579;">Write your message here. Keep it clear, useful, and easy to read on any screen.</p>
<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#526579;">You can edit this HTML directly, then check the live preview before sending.</p>
<a href="https://www.useimara.space" style="display:inline-block;border-radius:6px;background:#1d8a5b;padding:13px 20px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Visit IMARA</a>`;

const signupWindows = [
  { value: 30, label: "Last 30 minutes" },
  { value: 60, label: "Last hour" },
  { value: 1440, label: "Last 24 hours" },
  { value: 10080, label: "Last 7 days" },
  { value: 43200, label: "Last 30 days" },
];

function frameDocument(html: string, previewWidth: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none';"><style>html,body{margin:0;min-height:100%;}body{box-sizing:border-box;width:${previewWidth}px;max-width:100%;margin:0 auto;padding:32px 24px;background:#fff;overflow-wrap:anywhere;}img{max-width:100%;height:auto;}a{overflow-wrap:anywhere;}</style></head><body>${html}</body></html>`;
}

function insertMarkup(
  textarea: HTMLTextAreaElement | null,
  html: string,
  setHtml: (value: string) => void,
  before: string,
  after: string,
  fallback: string,
) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = html.slice(start, end) || fallback;
  const next = `${html.slice(0, start)}${before}${selected}${after}${html.slice(end)}`;
  setHtml(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
}

export function AdminEmailComposerPage() {
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [html, setHtml] = useState(initialHtml);
  const [target, setTarget] = useState<RecipientTarget>("AUDIENCE");
  const [audience, setAudience] = useState<Audience>("ALL");
  const [signupWindowMinutes, setSignupWindowMinutes] = useState(1440);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedRecipientSearch(recipientSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [recipientSearch]);

  const recipientsQuery = useQuery({
    queryKey: ["admin-email-recipients", target, audience, signupWindowMinutes, debouncedRecipientSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: target === "SELECTED" ? "20" : "1" });
      if (target === "AUDIENCE") params.set("audience", audience);
      if (target === "SIGNUP_WINDOW") params.set("createdWithinMinutes", String(signupWindowMinutes));
      if (target === "SELECTED") params.set("q", debouncedRecipientSearch);
      return apiRequest<RecipientPage>(`/admin/announcements/recipients?${params.toString()}`);
    },
    enabled: target !== "SELECTED" || debouncedRecipientSearch.length >= 2,
  });
  const campaignQuery = useQuery({
    queryKey: ["admin-email-campaign", campaignId],
    queryFn: () => apiRequest<CampaignStatus>(`/admin/email-composer/campaigns/${campaignId}`),
    enabled: Boolean(campaignId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "QUEUED" || status === "SENDING" ? 3000 : false;
    },
  });

  const selectedIds = useMemo(() => new Set(selectedRecipients.map(({ id }) => id)), [selectedRecipients]);
  const recipientCount = target === "SELECTED"
    ? selectedRecipients.length
    : recipientsQuery.data?.page.totalItems ?? 0;
  const recipientSearchPending = target === "SELECTED" && recipientSearch.trim() !== debouncedRecipientSearch;
  const recipientFilterLoading = target === "SELECTED"
    ? recipientSearchPending || (debouncedRecipientSearch.length >= 2 && recipientsQuery.isFetching)
    : recipientsQuery.isFetching;
  const canReview = Boolean(subject.trim() && html.trim() && recipientCount > 0
    && recipientCount <= MAX_EMAIL_RECIPIENTS
    && (target === "SELECTED" || (recipientsQuery.data && !recipientsQuery.isError)));

  const sendEmail = useMutation({
    mutationFn: () => apiRequest<SendResult>("/admin/email/send", {
      method: "POST",
      body: JSON.stringify({
        subject: subject.trim(),
        preheader: preheader.trim() || undefined,
        html,
        target,
        audience: target === "AUDIENCE" ? audience : "ALL",
        ...(target === "SIGNUP_WINDOW" ? { signupWindowMinutes } : {}),
        ...(target === "SELECTED" ? { userIds: selectedRecipients.map(({ id }) => id) } : {}),
      }),
    }),
    onSuccess: async (result) => {
      setCampaignId(result.campaignId);
      setNotice(`Email queued for ${formatNumber(result.queuedRecipientCount)} recipient${result.queuedRecipientCount === 1 ? "" : "s"}.`);
      setActionError("");
      setReviewOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-email-recipients"] });
    },
    onError: (cause) => {
      setNotice("");
      setActionError(cause instanceof Error ? cause.message : "The email could not be queued.");
    },
  });

  function changeTarget(value: RecipientTarget) {
    setTarget(value);
    setReviewOpen(false);
    setNotice("");
    setActionError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setActionError("");
    setReviewOpen(true);
  }

  const previewWidth = previewMode === "desktop" ? 600 : 375;
  const audienceLabel = target === "SELECTED"
    ? "Selected recipients"
    : target === "SIGNUP_WINDOW"
      ? signupWindows.find(({ value }) => value === signupWindowMinutes)?.label ?? "Recent signups"
      : `${audience === "ALL" ? "All active accounts" : `${audience} plan`} audience`;

  return (
    <div className="admin-page-content">
      <header className="admin-page-heading email-studio-heading">
        <div><span className="admin-eyebrow">MARKETING / DIRECT EMAIL</span><h1>Email studio</h1><p>Compose a responsive HTML email, choose who receives it, and review the exact message before it is queued.</p></div>
        <span className="admin-readonly-chip"><Mail size={13} /> Admin only</span>
      </header>

      {notice && <p className="admin-form-success email-studio-alert" role="status">{notice}</p>}
      {actionError && <p className="admin-form-error email-studio-alert" role="alert">{actionError}</p>}
      {campaignId && <section className="admin-panel email-studio-campaign">
        <div className="admin-panel-heading">
          <div><span className="admin-eyebrow">DELIVERY STATUS</span><h2>{campaignQuery.data?.subject ?? subject}</h2></div>
          <button type="button" className="admin-button admin-button-secondary" disabled={campaignQuery.isFetching} onClick={() => void campaignQuery.refetch()}>
            {campaignQuery.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {campaignQuery.isPending ? <p className="email-studio-hint">Loading delivery progress…</p>
          : campaignQuery.isError ? <div className="email-studio-campaign-error"><p role="alert">Delivery status couldn’t load. {campaignQuery.error.message}</p><button type="button" className="admin-button admin-button-secondary" onClick={() => void campaignQuery.refetch()}>Try again</button></div>
            : campaignQuery.data && <>
              <span className={`email-studio-campaign-status ${campaignQuery.data.status === "COMPLETED_WITH_ERRORS" ? "has-failures" : ""}`}>
                <i /> {campaignQuery.data.status.replace(/_/g, " ")}
              </span>
              <div className="email-studio-delivery-counts">
                <span><strong>{formatNumber(campaignQuery.data.sentCount)}</strong><small>Sent</small></span>
                <span><strong>{formatNumber(campaignQuery.data.pendingCount + campaignQuery.data.sendingCount)}</strong><small>In queue</small></span>
                <span><strong>{formatNumber(campaignQuery.data.failedCount)}</strong><small>Failed</small></span>
              </div>
              {campaignQuery.data.errors.map((item, index) => <p className="email-studio-campaign-error" role="status" key={`${item.count}-${index}`}>{item.message} ({formatNumber(item.count)}).</p>)}
            </>}
      </section>}

      <form className="email-studio-layout" onSubmit={submit}>
        <div className="email-studio-main">
          <section className="admin-panel email-studio-compose">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">MESSAGE</span><h2>Compose email</h2></div>
              <span className="email-studio-step">01</span>
            </div>
            <label className="email-studio-field"><span>Subject line</span><input value={subject} onChange={(event) => { setSubject(event.target.value); setReviewOpen(false); }} maxLength={180} required placeholder="A clear subject that earns an open" /></label>
            <label className="email-studio-field"><span>Preview text <small>OPTIONAL</small></span><input value={preheader} onChange={(event) => { setPreheader(event.target.value); setReviewOpen(false); }} maxLength={250} placeholder="The short line shown beside the subject in an inbox" /></label>

            <div className="email-studio-editor-heading">
              <div><span className="admin-eyebrow">HTML CONTENT</span><strong>Message body</strong></div>
              <span className="email-studio-code-label"><span /> HTML</span>
            </div>
            <div className="email-studio-toolbar" aria-label="HTML insert tools">
              <button type="button" aria-label="Insert heading" title="Insert heading" onClick={() => insertMarkup(editorRef.current, html, setHtml, "<h2>", "</h2>", "Your heading")}><Heading2 size={15} /></button>
              <button type="button" aria-label="Insert paragraph" title="Insert paragraph" onClick={() => insertMarkup(editorRef.current, html, setHtml, "<p>", "</p>", "Write your paragraph here.")}><AlignLeft size={15} /></button>
              <button type="button" aria-label="Insert link" title="Insert link" onClick={() => insertMarkup(editorRef.current, html, setHtml, '<a href="https://www.useimara.space">', "</a>", "Link text")}><Link2 size={15} /></button>
              <button type="button" aria-label="Insert divider" title="Insert divider" onClick={() => insertMarkup(editorRef.current, html, setHtml, "<hr>", "", "")}><Minus size={15} /></button>
              <span className="email-studio-toolbar-divider" />
              <button type="button" className="email-studio-reset" onClick={() => { setHtml(initialHtml); setReviewOpen(false); }}>Restore starter</button>
            </div>
            <label className="email-studio-code-label-screenreader" htmlFor="email-html-body">Email HTML source</label>
            <textarea
              ref={editorRef}
              id="email-html-body"
              className="email-studio-code-editor"
              value={html}
              onChange={(event) => { setHtml(event.target.value); setReviewOpen(false); }}
              maxLength={30_000}
              rows={18}
              spellCheck={false}
              required
              aria-describedby="email-html-guidance"
            />
            <div className="email-studio-editor-foot">
              <p id="email-html-guidance">HTML only. Use inline styles for reliable email-client rendering. Scripts and unsafe markup are not supported.</p>
              <span>{html.length.toLocaleString()} / 30,000</span>
            </div>
          </section>

          <section className="admin-panel email-studio-preview">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">LIVE RENDER</span><h2><Eye size={15} /> Preview</h2></div>
              <div className="email-studio-device-switch" role="group" aria-label="Preview width">
                <button type="button" className={previewMode === "desktop" ? "is-active" : ""} aria-pressed={previewMode === "desktop"} onClick={() => setPreviewMode("desktop")}><Monitor size={14} /><span>Desktop</span></button>
                <button type="button" className={previewMode === "mobile" ? "is-active" : ""} aria-pressed={previewMode === "mobile"} onClick={() => setPreviewMode("mobile")}><Smartphone size={14} /><span>Mobile</span></button>
              </div>
            </div>
            <div className="email-studio-preview-window">
              <div className="email-studio-inbox-preview"><span>INBOX PREVIEW</span><strong>{subject || "Your subject line"}</strong><small>{preheader || "Your preview text appears here."}</small></div>
              <div className="email-studio-iframe-wrap">
                <iframe title="HTML email preview" sandbox="" srcDoc={frameDocument(html, previewWidth)} />
              </div>
            </div>
            <p className="admin-panel-note">This preview is isolated from the admin page. Email clients may render some styles differently.</p>
          </section>
        </div>

        <aside className="email-studio-sidebar">
          <section className="admin-panel email-studio-recipients">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">DELIVERY</span><h2>Recipients</h2></div>
              <span className="email-studio-step">02</span>
            </div>
            <fieldset className="email-studio-targets">
              <legend>Choose a recipient set</legend>
              <label><input type="radio" name="email-target" checked={target === "AUDIENCE"} onChange={() => changeTarget("AUDIENCE")} /><span><strong>Plan audience</strong><small>Active customer accounts</small></span></label>
              <label><input type="radio" name="email-target" checked={target === "SIGNUP_WINDOW"} onChange={() => changeTarget("SIGNUP_WINDOW")} /><span><strong>Recent signups</strong><small>Newly created accounts</small></span></label>
              <label><input type="radio" name="email-target" checked={target === "SELECTED"} onChange={() => changeTarget("SELECTED")} /><span><strong>Choose people</strong><small>Search and select accounts</small></span></label>
            </fieldset>

            {target === "AUDIENCE" && <label className="email-studio-field"><span>Plan</span><select value={audience} onChange={(event) => { setAudience(event.target.value as Audience); setReviewOpen(false); }}>
              <option value="ALL">All active accounts</option><option value="FREE">Free</option><option value="PRO">Pro</option><option value="BUSINESS">Business</option>
            </select></label>}
            {target === "SIGNUP_WINDOW" && <label className="email-studio-field"><span>Signed up within</span><select value={signupWindowMinutes} onChange={(event) => { setSignupWindowMinutes(Number(event.target.value)); setReviewOpen(false); }}>
              {signupWindows.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select></label>}

            {target === "SELECTED" && <div className="email-studio-picker">
              <label className="email-studio-field"><span>Find accounts</span><div className="email-studio-search"><Search size={14} /><input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Name or email" autoComplete="off" /></div></label>
              {selectedRecipients.length > 0 && <div className="email-studio-chips" aria-live="polite">
                <strong>{selectedRecipients.length} selected</strong>
                {selectedRecipients.map((recipient) => <button key={recipient.id} type="button" title={`Remove ${recipient.name}`} onClick={() => {
                  setSelectedRecipients((current) => current.filter(({ id }) => id !== recipient.id));
                  setReviewOpen(false);
                }}>{recipient.name}<span aria-hidden="true">×</span></button>)}
              </div>}
              {debouncedRecipientSearch.length < 2
                ? <p className="email-studio-hint">Enter at least two characters to search.</p>
                : recipientsQuery.isError
                  ? <p className="admin-form-error" role="alert">{recipientsQuery.error instanceof Error ? recipientsQuery.error.message : "Recipients couldn’t be searched."}</p>
                  : recipientFilterLoading
                    ? <p className="email-studio-hint">Searching accounts…</p>
                    : recipientsQuery.data?.items.length
                      ? <div className="email-studio-results" aria-label="Matching account results">
                        {recipientsQuery.data.items.map((recipient) => {
                          const checked = selectedIds.has(recipient.id);
                          return <label className="email-studio-recipient" key={recipient.id}>
                            <input type="checkbox" checked={checked} disabled={!checked && selectedRecipients.length >= MAX_EMAIL_RECIPIENTS} onChange={(event) => {
                              setSelectedRecipients((current) => event.target.checked
                                ? [...current, recipient]
                                : current.filter(({ id }) => id !== recipient.id));
                              setReviewOpen(false);
                            }} />
                            <span><strong>{recipient.name}</strong><small>{recipient.email}</small></span>
                          </label>;
                        })}
                        {recipientsQuery.data.page.totalItems > recipientsQuery.data.items.length && <p className="email-studio-hint">Showing 20 matches; refine your search to locate someone specific.</p>}
                        {selectedRecipients.length >= MAX_EMAIL_RECIPIENTS && <p className="email-studio-hint">The limit of {formatNumber(MAX_EMAIL_RECIPIENTS)} individual recipients has been reached.</p>}
                      </div>
                      : <p className="email-studio-hint">No matching accounts. Try another name or email.</p>}
            </div>}

            {target !== "SELECTED" && <div className="email-studio-count" aria-live="polite">
              <Users size={15} />
              {recipientFilterLoading ? <span>Counting recipients…</span>
                : recipientsQuery.isError ? <span role="alert">Couldn’t count this audience. Retry before sending.</span>
                  : recipientCount > MAX_EMAIL_RECIPIENTS
                    ? <span role="alert">This audience has {formatNumber(recipientCount)} accounts. Narrow it to {formatNumber(MAX_EMAIL_RECIPIENTS)} or fewer.</span>
                    : <span><strong>{formatNumber(recipientCount)}</strong> accounts match <b>{audienceLabel}</b></span>}
            </div>}
            {target === "SELECTED" && <div className="email-studio-count"><Users size={15} /><span><strong>{formatNumber(recipientCount)}</strong> selected</span></div>}
            <p className="admin-panel-note">Email is sent using the platform’s configured SMTP account. Recipients are processed in the background.</p>
          </section>

          <section className="email-studio-send-card">
            <span className="email-studio-send-icon"><Send size={17} /></span>
            <span className="admin-eyebrow">READY WHEN YOU ARE</span>
            <h2>Review before sending</h2>
            <p>Check the subject, HTML preview, and recipient count. Sending queues email and cannot be undone.</p>
            <button type="submit" className="admin-button admin-button-primary" disabled={!canReview || recipientFilterLoading || sendEmail.isPending}>
              <Eye size={14} /> Review email
            </button>
          </section>
        </aside>
      </form>

      {reviewOpen && <div className="email-studio-review-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendEmail.isPending) setReviewOpen(false); }}>
        <section className="email-studio-review" role="dialog" aria-modal="true" aria-labelledby="email-review-title">
          <span className="email-studio-send-icon"><Mail size={18} /></span>
          <span className="admin-eyebrow">FINAL CHECK</span>
          <h2 id="email-review-title">Queue this email?</h2>
          <p>It will be sent to <strong>{formatNumber(recipientCount)} {recipientCount === 1 ? "account" : "accounts"}</strong> in <strong>{audienceLabel}</strong>.</p>
          <div className="email-studio-review-subject"><small>SUBJECT</small><strong>{subject}</strong></div>
          <div className="email-studio-review-actions">
            <button type="button" className="admin-button admin-button-secondary" disabled={sendEmail.isPending} onClick={() => setReviewOpen(false)}>Continue editing</button>
            <button type="button" className="admin-button admin-button-primary" disabled={sendEmail.isPending || !recipientCount} onClick={() => sendEmail.mutate()}>
              <Send size={14} /> {sendEmail.isPending ? "Queueing…" : `Send to ${formatNumber(recipientCount)}`}
            </button>
          </div>
        </section>
      </div>}
    </div>
  );
}

export default AdminEmailComposerPage;
