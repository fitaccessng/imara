import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CircleAlert } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: "ALL" | "FREE" | "PRO" | "BUSINESS";
  readAt: string | null;
  createdAt: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: () => apiRequest<PlatformAnnouncement[]>("/announcements"),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/announcements/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-announcements"] });
    },
  });

  return (
    <PageShell
      eyebrow="Notifications"
      title="Platform announcements"
      description="Product updates and service notices shared by the IMARA team."
    >
      {query.isPending ? <div className="full-state"><span className="loader" />Loading announcements…</div>
        : query.isError ? <section className="state-card" role="alert">
          <CircleAlert size={20} /><h2>Announcements could not load</h2>
          <p>{query.error instanceof Error ? query.error.message : "The request could not be completed."}</p>
          <button className="button button-dark" type="button" onClick={() => void query.refetch()}>Try again</button>
        </section>
          : <section className="announcement-list" aria-label="Platform announcements">
            {query.data.map((announcement) => <article className={`announcement-card${announcement.readAt ? "" : " is-unread"}`} key={announcement.id}>
              <div className="announcement-card-icon"><Bell size={17} /></div>
              <div className="announcement-card-content">
                <div className="announcement-card-meta"><span>{announcement.audience === "ALL" ? "Platform update" : `${announcement.audience} plan update`}</span><time dateTime={announcement.createdAt}>{formatDate(announcement.createdAt)}</time></div>
                <h2>{announcement.title}</h2><p>{announcement.body}</p>
              </div>
              {!announcement.readAt && <button className="announcement-read-button" type="button" disabled={markRead.isPending} onClick={() => markRead.mutate(announcement.id)}><Check size={14} /> Mark read</button>}
            </article>)}
            {!query.data.length && <div className="announcement-empty"><Bell size={22} /><strong>You’re all caught up</strong><span>IMARA announcements will appear here.</span></div>}
            {markRead.isError && <p className="form-alert" role="alert">{markRead.error instanceof Error ? markRead.error.message : "Could not mark this announcement as read."}</p>}
          </section>}
    </PageShell>
  );
}

export default NotificationsPage;
