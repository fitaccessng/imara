import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Inbox, Send } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest, downloadFile } from "../lib/api";
import { useWorkspaceScope } from "./useWorkspaceScope";
import { WorkspaceSetupPrompt } from "./WorkspaceSetupPrompt";
import "./workspace-file-deliveries.css";

interface FileDelivery {
  id: string;
  createdAt: string;
  sender: { id: string; name: string };
  recipient: { id: string; name: string; email: string };
  file: { id: string; name: string; mimeType: string; sizeBytes: string };
}

function bytes(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "—";
  if (amount < 1024) return `${amount} B`;
  const units = ["KB", "MB", "GB"];
  let size = amount;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

export function WorkspaceFileDeliveriesPage() {
  const { user } = useAuth();
  const { workspacesQuery, workspace } = useWorkspaceScope();
  const [view, setView] = useState<"received" | "sent">("received");
  const deliveriesQuery = useQuery({
    queryKey: ["workspace-file-deliveries", workspace?.id],
    queryFn: () => apiRequest<FileDelivery[]>(`/workspaces/${workspace?.id}/file-deliveries`),
    enabled: Boolean(workspace),
  });
  if (workspacesQuery.isLoading) return <div className="file-delivery-loading">Loading your workspace…</div>;
  if (workspacesQuery.isError) return <div className="file-delivery-error" role="alert">Your workspace couldn’t load. {workspacesQuery.error.message}</div>;
  if (!workspace) return <WorkspaceSetupPrompt title="A private place for team files." description="Create a workspace to receive files sent privately by your teammates." />;

  const deliveries = deliveriesQuery.data ?? [];
  const received = deliveries.filter((delivery) => delivery.recipient.id === user?.id);
  const sent = deliveries.filter((delivery) => delivery.sender.id === user?.id);
  const visibleDeliveries = view === "received" ? received : sent;

  async function download(delivery: FileDelivery) {
    try {
      await downloadFile(`/workspaces/${workspace.id}/file-deliveries/${delivery.id}/download`, delivery.file.name);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The file could not be downloaded.");
    }
  }

  return <main className="file-deliveries-page">
    <header className="file-deliveries-heading">
      <div><span className="calendar-kicker"><i /> PRIVATE DELIVERY</span><h1>Private files<span className="heading-period">.</span></h1><p>Files sent directly between members of {workspace.name}.</p></div>
    </header>
    {deliveriesQuery.isError && <div className="file-delivery-error" role="alert">Your private files couldn’t load. {deliveriesQuery.error.message}</div>}
    <div className="file-delivery-tabs" role="tablist" aria-label="Private file deliveries">
      <button type="button" role="tab" aria-selected={view === "received"} className={view === "received" ? "file-delivery-tab-active" : ""} onClick={() => setView("received")}><Inbox size={14} /> Received <span>{received.length}</span></button>
      <button type="button" role="tab" aria-selected={view === "sent"} className={view === "sent" ? "file-delivery-tab-active" : ""} onClick={() => setView("sent")}><Send size={14} /> Sent <span>{sent.length}</span></button>
    </div>
    {deliveriesQuery.isLoading ? <div className="file-delivery-loading">Checking for private file deliveries…</div>
      : visibleDeliveries.length === 0 ? <section className="file-delivery-empty"><span>{view === "received" ? <Inbox size={22} /> : <Send size={22} />}</span><h2>{view === "received" ? "Your private inbox is clear." : "No files sent yet."}</h2><p>{view === "received" ? "Files sent directly to you by workspace teammates will appear here." : "Files you send privately to workspace teammates will appear here."}</p></section>
        : <section className="file-delivery-list" aria-label="Files shared with you">
          {visibleDeliveries.map((delivery) => <article className="file-delivery-row" key={delivery.id}>
            <div className="file-delivery-icon">{view === "received" ? <Inbox size={18} /> : <Send size={17} />}</div>
            <div className="file-delivery-copy"><strong>{delivery.file.name}</strong><span>{view === "received" ? `From ${delivery.sender.name}` : `To ${delivery.recipient.name}`} · {bytes(delivery.file.sizeBytes)} · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.createdAt))}</span></div>
            <button type="button" className="button button-outline" onClick={() => void download(delivery)}><ArrowDownToLine size={15} /> Download</button>
          </article>)}
        </section>}
    <section className="file-delivery-footnote"><Send size={15} /><p>Files you send to teammates remain private to the sender and intended recipients.</p></section>
  </main>;
}
