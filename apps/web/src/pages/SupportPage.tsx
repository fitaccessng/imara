import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, MessageSquareText, Send } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "../lib/api";
import { PageShell } from "./PageShell";

type TicketStatus = "OPEN" | "PENDING" | "RESOLVED";
type TicketCategory = "ACCOUNT" | "BILLING" | "FILES" | "EVENTS" | "OTHER";

interface TicketSummary {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface TicketDetails extends Omit<TicketSummary, "messageCount"> {
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; role: "USER" | "ADMIN" };
  }>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SupportPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("OTHER");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [formError, setFormError] = useState("");
  const ticketsQuery = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => apiRequest<TicketSummary[]>("/support/tickets"),
  });
  const detailQuery = useQuery({
    queryKey: ["support-ticket", selectedId],
    queryFn: () => apiRequest<TicketDetails>(`/support/tickets/${encodeURIComponent(selectedId)}`),
    enabled: Boolean(selectedId),
    refetchInterval: 15_000,
  });
  const createTicket = useMutation({
    mutationFn: () => apiRequest<TicketSummary>("/support/tickets", {
      method: "POST",
      body: JSON.stringify({ subject, category, body: message }),
    }),
    onSuccess: async (created) => {
      setSubject("");
      setMessage("");
      setFormError("");
      setSelectedId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "The support request could not be sent."),
  });
  const sendReply = useMutation({
    mutationFn: () => apiRequest(`/support/tickets/${encodeURIComponent(selectedId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: reply }),
    }),
    onSuccess: async () => {
      setReply("");
      setFormError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["support-ticket", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["support-tickets"] }),
      ]);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Your reply could not be sent."),
  });
  const activeTicket = detailQuery.data;

  return <PageShell
    eyebrow="IMARA SUPPORT"
    title="How can we help?"
    description="Send a support request and follow the conversation from your account."
  >
    {formError && <p className="form-alert" role="alert">{formError}</p>}
    <div className="support-layout">
      <section className="support-compose panel">
        <div className="workspace-panel-heading"><h2><LifeBuoy size={17} /> New request</h2></div>
        <form className="support-form" onSubmit={(event) => { event.preventDefault(); createTicket.mutate(); }}>
          <label><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={160} required /></label>
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value as TicketCategory)}>
            <option value="ACCOUNT">Account</option><option value="BILLING">Billing</option><option value="FILES">Files and folders</option><option value="EVENTS">Events and galleries</option><option value="OTHER">Other</option>
          </select></label>
          <label><span>How can we help?</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={5000} required /></label>
          <button className="button button-dark" type="submit" disabled={createTicket.isPending}>{createTicket.isPending ? "Sending…" : "Send support request"}</button>
        </form>
      </section>

      <section className="support-tickets panel">
        <div className="workspace-panel-heading"><h2><MessageSquareText size={17} /> Your requests</h2></div>
        {ticketsQuery.isPending ? <p className="support-state">Loading your requests…</p>
          : ticketsQuery.isError ? <div className="support-state" role="alert"><span>Support requests could not load.</span><button className="text-button" type="button" onClick={() => void ticketsQuery.refetch()}>Try again</button></div>
            : <div className="support-ticket-list">
              {(ticketsQuery.data ?? []).map((ticket) => <button className={`support-ticket-row${selectedId === ticket.id ? " is-selected" : ""}`} type="button" key={ticket.id} onClick={() => { setSelectedId(ticket.id); setFormError(""); }}>
                <span><strong>{ticket.subject}</strong><small>{ticket.category.toLowerCase()} · Updated {formatDate(ticket.updatedAt)}</small></span>
                <span className={`support-status is-${ticket.status.toLowerCase()}`}>{ticket.status.toLowerCase()}</span>
              </button>)}
              {!ticketsQuery.data?.length && <p className="support-state">No support requests yet.</p>}
            </div>}
      </section>

      {selectedId && <section className="support-conversation panel">
        {detailQuery.isPending ? <p className="support-state">Loading conversation…</p>
          : detailQuery.isError ? <div className="support-state" role="alert"><span>This conversation could not load.</span><button className="text-button" type="button" onClick={() => void detailQuery.refetch()}>Try again</button></div>
            : activeTicket && <>
              <div className="workspace-panel-heading"><div><h2>{activeTicket.subject}</h2><span className={`support-status is-${activeTicket.status.toLowerCase()}`}>{activeTicket.status.toLowerCase()}</span></div></div>
              <div className="support-message-list">{activeTicket.messages.map((entry) => <article className={`support-message${entry.author.role === "ADMIN" ? " from-support" : ""}`} key={entry.id}>
                <div><strong>{entry.author.role === "ADMIN" ? "IMARA Support" : "You"}</strong><time>{formatDate(entry.createdAt)}</time></div>
                <p>{entry.body}</p>
              </article>)}</div>
              {activeTicket.status !== "RESOLVED" && <form className="support-reply-form" onSubmit={(event) => { event.preventDefault(); sendReply.mutate(); }}>
                <label htmlFor="support-reply">Reply</label><textarea id="support-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={3} required />
                <button className="button button-dark" type="submit" disabled={sendReply.isPending}><Send size={14} />{sendReply.isPending ? "Sending…" : "Send reply"}</button>
              </form>}
              {activeTicket.status === "RESOLVED" && <p className="support-state">This ticket is resolved. Send a new request if you need more help.</p>}
            </>}
      </section>}
    </div>
  </PageShell>;
}

export default SupportPage;
