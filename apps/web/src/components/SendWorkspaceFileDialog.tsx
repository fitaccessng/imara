import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Send, Users, X } from "lucide-react";
import { apiRequest } from "../lib/api";
import type { WorkspaceFile, WorkspaceMember } from "../workspaces/types";

interface DeliveryResult {
  deliveries: unknown[];
  emailed: number;
}

export function SendWorkspaceFileDialog({
  workspaceId,
  workspaceName,
  file,
  onClose,
}: {
  workspaceId: string;
  workspaceName: string;
  file: WorkspaceFile;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<DeliveryResult | null>(null);
  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => apiRequest<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  });
  const members = (membersQuery.data ?? []).filter((member) => member.status === "ACTIVE");
  const send = useMutation({
    mutationFn: () => apiRequest<DeliveryResult>(`/workspaces/${workspaceId}/files/${file.id}/send`, {
      method: "POST",
      body: JSON.stringify({
        ...(recipients.length ? { recipientUserIds: recipients } : {}),
        ...(emailRecipients.trim() ? { emailRecipients: emailRecipients.split(/[,\n;]+/).map((value) => value.trim()).filter(Boolean) } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      }),
    }),
    onSuccess: (result) => {
      setSent(result);
      setError("");
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "The file could not be sent."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!recipients.length && !emailRecipients.trim()) {
      setError("Choose at least one workspace member or email address.");
      return;
    }
    send.mutate();
  }

  return <div className="folder-move-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !send.isPending) onClose();
  }}>
    <section className="folder-move-dialog send-file-dialog" role="dialog" aria-modal="true" aria-labelledby="send-workspace-file-title">
      <div className="folder-move-heading">
        <div><span className="eyebrow">PRIVATE FILE DELIVERY</span><h2 id="send-workspace-file-title">{sent ? "File sent" : "Send a file"}</h2></div>
        <button className="icon-button" type="button" aria-label="Close dialog" disabled={send.isPending} onClick={onClose}><X size={18} /></button>
      </div>
      {sent ? <>
        <p><strong>{file.name}</strong> was sent to {sent.deliveries.length} workspace {sent.deliveries.length === 1 ? "member" : "members"}{sent.emailed ? ` and emailed to ${sent.emailed} recipient${sent.emailed === 1 ? "" : "s"}` : ""}.</p>
        <div className="folder-move-actions"><button className="button button-green" type="button" onClick={onClose}>Done</button></div>
      </> : <>
        <p>Send <strong>{file.name}</strong> privately to {workspaceName} members or email a direct file attachment.</p>
        <form onSubmit={submit}>
          <label className="field"><Users size={14} /> Workspace members</label>
          {membersQuery.isLoading ? <p className="send-file-status">Loading active members…</p>
            : membersQuery.isError ? <p className="form-alert" role="alert">Workspace members couldn’t load. {membersQuery.error.message}</p>
              : <div className="send-file-member-list">
                {members.map((member) => {
                  const name = member.displayName?.trim() || member.user.name;
                  const checked = recipients.includes(member.user.id);
                  return <label className={`send-file-member${checked ? " send-file-member-selected" : ""}`} key={member.id}>
                    <input type="checkbox" checked={checked} onChange={(event) => setRecipients((current) => event.target.checked
                      ? [...current, member.user.id]
                      : current.filter((id) => id !== member.user.id))} />
                    <span><strong>{name}</strong><small>{member.role.toLowerCase()} · {member.user.email}</small></span>
                  </label>;
                })}
                {!members.length && <p className="send-file-status">There are no active workspace members.</p>}
              </div>}
          <label className="field" htmlFor="file-email-recipients"><Mail size={14} /> Email recipients <span className="optional-label">OPTIONAL</span></label>
          <textarea id="file-email-recipients" className="folder-dialog-input send-file-emails" rows={2} value={emailRecipients} onChange={(event) => setEmailRecipients(event.target.value)} placeholder="name@example.com, another@example.com" />
          <label className="field" htmlFor="file-send-message">Message <span className="optional-label">OPTIONAL</span></label>
          <textarea id="file-send-message" className="folder-dialog-input send-file-message" rows={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add a note for the recipients" />
          <p className="send-file-brand-note">Email attachments will be sent with <strong>{workspaceName}</strong> as the sender name.</p>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="folder-move-actions">
            <button className="button button-outline" type="button" disabled={send.isPending} onClick={onClose}>Cancel</button>
            <button className="button button-green" type="submit" disabled={send.isPending || membersQuery.isLoading}>
              <Send size={14} />{send.isPending ? "Sending…" : "Send file"}
            </button>
          </div>
        </form>
      </>}
    </section>
  </div>;
}
