import { useState } from "react";
import {
  ArrowUpRight,
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CalendarClock,
  CreditCard,
  CircleCheck,
  Files,
  LayoutDashboard,
  LogOut,
  LifeBuoy,
  MailPlus,
  Menu,
  Settings2,
  Search,
  ScanSearch,
  ShieldCheck,
  FileSignature,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import type { Workspace, WorkspaceNotification } from "../workspaces/types";
import { workspaceHref } from "../workspaces/types";
import type { FormEvent, ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiRequest<Workspace[]>("/workspaces"),
  });
  const businessWorkspaces = workspacesQuery.data ?? [];
  const selectedWorkspaceId = new URLSearchParams(search).get("workspace");
  const businessWorkspace =
    businessWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
    businessWorkspaces[0] ??
    null;
  const notificationsQuery = useQuery({
    queryKey: ["workspace-notifications", businessWorkspace?.id],
    queryFn: () => apiRequest<WorkspaceNotification[]>(`/workspaces/${businessWorkspace?.id}/notifications`),
    enabled: Boolean(businessWorkspace),
  });
  const announcementsQuery = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: () => apiRequest<Array<{ readAt: string | null }>>("/announcements"),
  });
  const unreadAnnouncementCount = (announcementsQuery.data ?? []).filter((item) => !item.readAt).length;
  const unreadNotifications = (notificationsQuery.data ?? []).filter((notification) => !notification.readAt);
  const businessHref = (path: string) => workspaceHref(path, businessWorkspace?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (!businessWorkspace) return;
    setNotificationError("");
    try {
      await apiRequest(`/workspaces/${businessWorkspace.id}/notifications/${notificationId}/read`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["workspace-notifications", businessWorkspace.id] });
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Unable to update this notification.");
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchTerm.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  const nameParts = user?.name.trim().split(/\s+/) ?? [];
  const initials = (nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1]?.[0]}`
    : nameParts[0]?.slice(0, 2) ?? "").toUpperCase();
  const isBusinessPage = pathname.startsWith("/workspace");
  const pageTitle = pathname === "/favorites" || pathname === "/starred" ? "Favourites" : pathname === "/trash" ? "Recycle Bin" : pathname === "/smart-files" ? "Smart file library" : pathname.startsWith("/settings") ? "Account settings" : pathname.startsWith("/scanner") ? "Document scanner" : pathname.startsWith("/files") ? "Your files" : pathname.startsWith("/events") ? "Events" : pathname.startsWith("/workspace/signatures") ? "Electronic signatures" : pathname.startsWith("/workspace/approvals") ? "Approval workflows" : pathname.startsWith("/workspace/reminders") ? "Reminders" : pathname.startsWith("/workspace/team/invite") ? "Invite a teammate" : pathname.startsWith("/workspace/team") ? "Your team" : pathname.startsWith("/workspace/invitations") ? "Invitations" : pathname.startsWith("/workspace/activity") ? "Activity" : pathname.startsWith("/workspace/roles") ? "Workspace roles" : isBusinessPage ? "Shared files" : "Overview";
  const workspaceName = isBusinessPage ? businessWorkspace?.name ?? "Business space" : "Personal space";

  return (
    <div className="app-frame min-h-screen bg-imara-paper">
      <header className="mobile-topbar">
        <Link to="/dashboard" className="brand-lockup"><span className="brand-mark">i</span>IMARA</Link>
        <div className="mobile-topbar-actions">
          <button className="icon-button mobile-signout-button" aria-label={signingOut ? "Signing out" : signOutError ? `Sign out failed: ${signOutError}` : "Sign out"} title={signOutError || "Sign out"} onClick={() => void handleSignOut()} disabled={signingOut}>
            <LogOut size={17} />
          </button>
          <button className="icon-button mobile-menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <Link to="/dashboard" className="brand-lockup"><span className="brand-mark">i</span>IMARA<span className="brand-dot">.</span></Link>
        <div className="workspace-switcher">
          <div className={`workspace-avatar ${isBusinessPage ? "workspace-avatar-business" : ""}`}>{isBusinessPage ? <BriefcaseBusiness size={15} /> : "P"}</div>
          <div className="workspace-copy"><strong>{isBusinessPage ? workspaceName : "Personal space"}</strong><span>{isBusinessPage ? businessWorkspace ? businessWorkspace.role.toLowerCase() : "Business workspace" : "My workspace"}</span></div>
        </div>
        <div className="nav-section-label">Workspace</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <LayoutDashboard size={17} strokeWidth={1.8} /><span>Overview</span>
          </NavLink>
          <NavLink to="/files" end className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Files size={17} strokeWidth={1.8} /><span>Your files</span>
          </NavLink>
          <NavLink to="/smart-files" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <ScanSearch size={17} strokeWidth={1.8} /><span>Smart library</span>
          </NavLink>
          <NavLink to="/favorites" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Star size={17} strokeWidth={1.8} /><span>Favourites</span>
          </NavLink>
          <NavLink to="/trash" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Trash2 size={17} strokeWidth={1.8} /><span>Recycle Bin</span>
          </NavLink>
          <NavLink to="/events" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CalendarDays size={17} strokeWidth={1.8} /><span>Events</span>
          </NavLink>
          <NavLink to="/settings/profile" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Settings2 size={17} strokeWidth={1.8} /><span>Account settings</span>
          </NavLink>
          <NavLink to="/billing/plans" end className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CreditCard size={17} strokeWidth={1.8} /><span>Pricing</span>
          </NavLink>
          <NavLink to="/notifications" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Bell size={17} strokeWidth={1.8} /><span>Announcements</span>{unreadAnnouncementCount > 0 && <small className="announcement-nav-count">{unreadAnnouncementCount}</small>}
          </NavLink>
          <NavLink to="/support" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <LifeBuoy size={17} strokeWidth={1.8} /><span>Help & support</span>
          </NavLink>
        </nav>
        <div className="nav-section-label business-nav-label">Business</div>
        <nav className="side-nav" aria-label="Business workspace navigation">
          <NavLink to={businessHref("/workspace/signatures")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <FileSignature size={17} strokeWidth={1.8} /><span>Signatures</span>
          </NavLink>
          <NavLink to={businessHref("/workspace/approvals")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CircleCheck size={17} strokeWidth={1.8} /><span>Approvals</span>
          </NavLink>
          <NavLink to={businessHref("/workspace/reminders")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CalendarClock size={17} strokeWidth={1.8} /><span>Reminders</span>
          </NavLink>
          <NavLink to={businessHref("/workspace")} end className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <BriefcaseBusiness size={17} strokeWidth={1.8} /><span>{businessWorkspace ? "Shared folders" : "Set up workspace"}</span>
          </NavLink>
          {businessWorkspace && (businessWorkspace.role === "OWNER" || businessWorkspace.role === "ADMIN") && <>
            <NavLink to={businessHref("/workspace/team")} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Users size={17} strokeWidth={1.8} /><span>Team & access</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/invitations")} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <MailPlus size={17} strokeWidth={1.8} /><span>Invitations</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/activity")} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Activity size={17} strokeWidth={1.8} /><span>Workspace activity</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/roles")} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <ShieldCheck size={17} strokeWidth={1.8} /><span>Workspace roles</span>
            </NavLink>
          </>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-icon"><ShieldCheck size={17} /></div>
            <strong>Your space, protected.</strong>
            <p>Your files are private and only accessible to you.</p>
            <Link to="/settings/profile">Review account <ArrowUpRight size={13} /></Link>
          </div>
          <button className="account-row" onClick={() => navigate("/settings/profile")}>
            <span className="avatar">{initials || "U"}</span>
            <span className="account-copy"><strong>{user?.name}</strong><span>{user?.email}</span></span>
          </button>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-breadcrumb"><span>{workspaceName}</span><span className="breadcrumb-separator">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-actions">
            <form className="topbar-search" role="search" onSubmit={submitSearch}>
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search files"
                placeholder="Search files"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <kbd>/</kbd>
            </form>
            {businessWorkspace && <div className="notification-wrap">
              <button className="icon-button notification-button" aria-label="Workspace notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
                <Bell size={16} />{unreadNotifications.length > 0 && <span aria-label={`${unreadNotifications.length} unread notifications`} />}
              </button>
              {notificationsOpen && <section className="notification-popover" aria-label="Workspace notifications">
                <div className="notification-popover-heading"><div><span className="eyebrow">BUSINESS SPACE</span><strong>Notifications</strong></div><button className="text-button" onClick={() => setNotificationsOpen(false)}>Close</button></div>
                {notificationError && <p className="form-alert notification-error" role="alert">{notificationError}</p>}
                {notificationsQuery.isLoading ? <p className="notification-empty">Loading notifications…</p> : notificationsQuery.isError ? <div className="notification-empty"><span>Notifications couldn’t load.</span><button className="text-button" onClick={() => void notificationsQuery.refetch()}>Try again</button></div> : (
                  <div className="notification-list">
                    {(notificationsQuery.data ?? []).map((notification) => (
                      <article className={`notification-item ${notification.readAt ? "" : "notification-unread"}`} key={notification.id}>
                        <span className="notification-item-dot" />
                        <div><p>{notification.message}</p><time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</time></div>
                        {!notification.readAt && <button className="notification-mark-read" aria-label="Mark notification as read" onClick={() => void markNotificationRead(notification.id)}>Mark read</button>}
                      </article>
                    ))}
                    {!notificationsQuery.data?.length && <p className="notification-empty">You’re all caught up.</p>}
                  </div>
                )}
              </section>}
            </div>}
            <span className="topbar-divider" />
            <span className="avatar avatar-small">{initials || "U"}</span>
            {signOutError && <span className="topbar-signout-error" role="alert">{signOutError}</span>}
            <button className="topbar-signout-button" onClick={() => void handleSignOut()} disabled={signingOut}>
              <LogOut size={15} />{signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
