import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Files,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  LifeBuoy,
  MailPlus,
  MessageCircle,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  FileSignature,
  Star,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import { BrandIdentity } from "./BrandLockup";
import { ReferralPromotionModal } from "./ReferralComponents";
import type { Workspace, WorkspaceNotification } from "../workspaces/types";
import { workspaceHref } from "../workspaces/types";
import type { FormEvent, ReactNode } from "react";

interface ProductTourStep {
  label: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

function createProductTourSteps(workspaceId?: string): ProductTourStep[] {
  const steps: ProductTourStep[] = [
    {
      label: "YOUR DASHBOARD",
      title: "Your work, at a glance.",
      description: "Start here to see your storage, recent files, and quick actions for keeping your personal space organised.",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "PERSONAL SPACE",
      title: "Keep plans and dates together.",
      description: "Use Calendar to keep track of important dates and personal events.",
      href: "/calendar",
      icon: CalendarDays,
    },
    {
      label: "PERSONAL SPACE",
      title: "Your documents, in one place.",
      description: "Files is your private library. Create folders, upload or scan documents, and manage what you have stored.",
      href: "/files",
      icon: Files,
    },
    {
      label: "PERSONAL SPACE",
      title: "Plan and share events.",
      description: "Events helps you organise event details and share galleries with the people who matter.",
      href: "/events",
      icon: CalendarDays,
    },
    {
      label: "PERSONAL SPACE",
      title: "Find the files you saved.",
      description: "Favorites keeps your starred files close, so you can return to important documents quickly.",
      href: "/favorites",
      icon: Star,
    },
  ];

  if (workspaceId) {
    steps.push(
      {
        label: "BUSINESS SPACE",
        title: "Work together on shared files.",
        description: "Shared files is your team library for documents and folders that workspace members can access.",
        href: workspaceHref("/workspace", workspaceId),
        icon: Files,
      },
      {
        label: "BUSINESS SPACE",
        title: "Coordinate the team calendar.",
        description: "Shared calendar helps your workspace keep team dates and events visible in one place.",
        href: workspaceHref("/workspace/calendar", workspaceId),
        icon: CalendarDays,
      },
      {
        label: "BUSINESS SPACE",
        title: "Deliver files privately.",
        description: "Private files gives you a workspace area for sharing documents directly with specific recipients.",
        href: workspaceHref("/workspace/file-deliveries", workspaceId),
        icon: LockKeyhole,
      },
      {
        label: "BUSINESS SPACE",
        title: "Collect signatures.",
        description: "Create and track signature requests, then follow their progress from the Signatures page.",
        href: workspaceHref("/workspace/signatures", workspaceId),
        icon: FileSignature,
      },
      {
        label: "BUSINESS SPACE",
        title: "Move decisions forward.",
        description: "Approvals gives your team a place to review and respond to requests that need a decision.",
        href: workspaceHref("/workspace/approvals", workspaceId),
        icon: ClipboardCheck,
      },
      {
        label: "BUSINESS SPACE",
        title: "Stay on top of follow-ups.",
        description: "Use Reminders to keep important tasks and deadlines from slipping through the cracks.",
        href: workspaceHref("/workspace/reminders", workspaceId),
        icon: BellRing,
      },
      {
        label: "BUSINESS SPACE",
        title: "Keep team conversations connected.",
        description: "Team chat gives workspace members a shared place to discuss work and coordinate next steps.",
        href: workspaceHref("/workspace/chat", workspaceId),
        icon: MessageCircle,
      },
    );
  }

  return steps;
}

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
  const personalNotificationsQuery = useQuery({
    queryKey: ["personal-notifications"],
    queryFn: () => apiRequest<WorkspaceNotification[]>("/notifications"),
    refetchInterval: 30_000,
  });
  const workspaceNotificationsQuery = useQuery({
    queryKey: ["workspace-notifications", businessWorkspace?.id],
    queryFn: () => apiRequest<WorkspaceNotification[]>(`/workspaces/${businessWorkspace?.id}/notifications`),
    enabled: Boolean(businessWorkspace),
    refetchInterval: 30_000,
  });
  const announcementsQuery = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: () => apiRequest<Array<{ readAt: string | null }>>("/announcements"),
  });
  const unreadAnnouncementCount = (announcementsQuery.data ?? []).filter((item) => !item.readAt).length;
  const notifications = [
    ...(personalNotificationsQuery.data ?? []).map((notification) => ({ notification, scope: "personal" as const })),
    ...(workspaceNotificationsQuery.data ?? []).map((notification) => ({ notification, scope: "workspace" as const })),
  ].sort((first, second) => Date.parse(second.notification.createdAt) - Date.parse(first.notification.createdAt));
  const unreadNotifications = notifications.filter(({ notification }) => !notification.readAt);
  const businessHref = (path: string) => workspaceHref(path, businessWorkspace?.id);
  const tourSteps = useMemo(() => createProductTourSteps(businessWorkspace?.id), [businessWorkspace?.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourTarget, setTourTarget] = useState<DOMRect | null>(null);
  const tourStorageKey = user ? `imara-product-tour-complete:${user.id}` : null;

  function finishTour() {
    if (tourStorageKey) window.localStorage.setItem(tourStorageKey, "true");
    setTourStep(null);
  }

  function startTour() {
    setTourStep(0);
    setMenuOpen(false);
  }

  useEffect(() => {
    const handleStartTour = () => startTour();
    window.addEventListener("imara:start-product-tour", handleStartTour);
    return () => window.removeEventListener("imara:start-product-tour", handleStartTour);
  }, []);

  useEffect(() => {
    if (!tourStorageKey || !["/dashboard", "/dashboard/storage"].includes(location.pathname) || workspacesQuery.isLoading || tourStep !== null) return;
    if (window.localStorage.getItem(tourStorageKey) !== "true") setTourStep(0);
  }, [location.pathname, tourStorageKey, tourStep, workspacesQuery.isLoading]);

  useEffect(() => {
    if (tourStep === null) {
      setTourTarget(null);
      return;
    }

    const step = tourSteps[tourStep];
    if (!step) {
      if (tourStorageKey) window.localStorage.setItem(tourStorageKey, "true");
      setTourStep(null);
      return;
    }

    if (`${location.pathname}${location.search}` !== step.href) {
      setTourTarget(null);
      navigate(step.href, { replace: true });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    const target = document.querySelector<HTMLElement>("[data-product-tour-page]");
    if (!target) {
      setTourTarget(null);
      return;
    }
    const updateTarget = () => setTourTarget(target.getBoundingClientRect());
    const frame = window.requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [location.pathname, location.search, navigate, tourStep, tourSteps]);

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

  async function markNotificationRead(notificationId: string, scope: "personal" | "workspace") {
    setNotificationError("");
    try {
      if (scope === "personal") {
        await apiRequest(`/notifications/${notificationId}/read`, { method: "POST" });
        await queryClient.invalidateQueries({ queryKey: ["personal-notifications"] });
      } else if (businessWorkspace) {
        await apiRequest(`/workspaces/${businessWorkspace.id}/notifications/${notificationId}/read`, { method: "POST" });
        await queryClient.invalidateQueries({ queryKey: ["workspace-notifications", businessWorkspace.id] });
      }
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
  const pageTitle = pathname === "/favorites" || pathname === "/starred" ? "Favourites" : pathname === "/trash" ? "Recycle Bin" : pathname.startsWith("/settings") ? "Account settings" : pathname.startsWith("/scanner") ? "Document scanner" : pathname === "/calendar" ? "Calendar" : pathname === "/workspace/calendar" ? "Shared calendar" : pathname === "/workspace/file-deliveries" ? "Private files" : pathname === "/file-requests" ? "Request files" : pathname === "/document-tools" ? "Document tools" : pathname.startsWith("/files") ? "Your files" : pathname.startsWith("/events") ? "Events" : pathname.startsWith("/workspace/chat") ? "Team chat" : pathname.startsWith("/workspace/signatures") ? "Signatures" : pathname.startsWith("/workspace/approvals") ? "Approvals" : pathname.startsWith("/workspace/reminders") ? "Reminders" : pathname.startsWith("/workspace/team/invite") ? "Invite a teammate" : pathname.startsWith("/workspace/team") ? "Your team" : pathname.startsWith("/workspace/invitations") ? "Invitations" : pathname.startsWith("/workspace/activity") ? "Activity" : pathname.startsWith("/workspace/roles") ? "Workspace roles" : pathname === "/workspace" && !businessWorkspace ? "Set up workspace" : isBusinessPage ? "Shared files" : "Overview";
  const workspaceName = isBusinessPage ? businessWorkspace?.name ?? "Business space" : "Personal space";
  const renderNotificationControl = () => (
    <div className="notification-wrap">
      <button className="icon-button notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}>
        <Bell size={16} />{unreadNotifications.length > 0 && <span aria-label={`${unreadNotifications.length} unread notifications`} />}
      </button>
      {notificationsOpen && <section className="notification-popover" aria-label="Personal and workspace notifications">
        <div className="notification-popover-heading"><div><span className="eyebrow">PERSONAL &amp; TEAM</span><strong>Notifications</strong></div><button className="text-button" onClick={() => setNotificationsOpen(false)}>Close</button></div>
        {notificationError && <p className="form-alert notification-error" role="alert">{notificationError}</p>}
        {personalNotificationsQuery.isLoading || (businessWorkspace && workspaceNotificationsQuery.isLoading) ? <p className="notification-empty">Loading notifications…</p>
          : personalNotificationsQuery.isError || (businessWorkspace && workspaceNotificationsQuery.isError) ? <div className="notification-empty"><span>Notifications couldn’t load.</span><button className="text-button" onClick={() => {
            if (personalNotificationsQuery.isError) void personalNotificationsQuery.refetch();
            if (businessWorkspace && workspaceNotificationsQuery.isError) void workspaceNotificationsQuery.refetch();
          }}>Try again</button></div> : (
            <div className="notification-list">
              {notifications.map(({ notification, scope }) => (
                <article className={`notification-item ${notification.readAt ? "" : "notification-unread"}`} key={notification.id}>
                  <span className="notification-item-dot" />
                  <div><p>{notification.message}</p><time dateTime={notification.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</time></div>
                  {!notification.readAt && <button className="notification-mark-read" aria-label="Mark notification as read" onClick={() => void markNotificationRead(notification.id, scope)}>Mark read</button>}
                </article>
              ))}
              {!notifications.length && <p className="notification-empty">You’re all caught up.</p>}
            </div>
          )}
      </section>}
    </div>
  );
  return (
    <div className="app-frame min-h-screen bg-imara-paper">
      <header className="mobile-topbar">
        <Link to="/dashboard" className="brand-lockup" aria-label="imara home"><BrandIdentity /></Link>
        <div className="mobile-topbar-actions">
          {renderNotificationControl()}
          <button className="icon-button mobile-signout-button" aria-label={signingOut ? "Signing out" : signOutError ? `Sign out failed: ${signOutError}` : "Sign out"} title={signOutError || "Sign out"} onClick={() => void handleSignOut()} disabled={signingOut}>
            <LogOut size={17} />
          </button>
          <button className="icon-button mobile-menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <Link to="/dashboard" className="brand-lockup" aria-label="imara home"><BrandIdentity /></Link>
        <div className="workspace-switcher">
          <div className={`workspace-avatar ${isBusinessPage ? "workspace-avatar-business" : ""}`}>{isBusinessPage ? <BriefcaseBusiness size={15} /> : "P"}</div>
          <div className="workspace-copy"><strong>{isBusinessPage ? workspaceName : "Personal space"}</strong><span>{isBusinessPage ? businessWorkspace ? businessWorkspace.role.toLowerCase() : "Business workspace" : "My workspace"}</span></div>
        </div>
        <div className="nav-section-label">Personal</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <LayoutDashboard size={17} strokeWidth={1.8} /><span>Overview</span>
          </NavLink>
          <NavLink to="/files" end className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Files size={17} strokeWidth={1.8} /><span>Your files</span>
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CalendarDays size={17} strokeWidth={1.8} /><span>Calendar</span>
          </NavLink>
          <NavLink to="/favorites" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Star size={17} strokeWidth={1.8} /><span>Favourites</span>
          </NavLink>
          <NavLink to="/notifications" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Bell size={17} strokeWidth={1.8} /><span>Announcements</span>{unreadAnnouncementCount > 0 && <small className="announcement-nav-count">{unreadAnnouncementCount}</small>}
          </NavLink>
          <NavLink to="/billing/plans" end className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <CreditCard size={17} strokeWidth={1.8} /><span>Pricing</span>
          </NavLink>
          <NavLink to="/settings/profile" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Settings size={17} strokeWidth={1.8} /><span>Account settings</span>
          </NavLink>
          <NavLink to="/trash" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <Trash2 size={17} strokeWidth={1.8} /><span>Recycle Bin</span>
          </NavLink>
          <NavLink to="/support" className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
            <LifeBuoy size={17} strokeWidth={1.8} /><span>Help & support</span>
          </NavLink>
        </nav>
        <div className="nav-section-label business-nav-label">Business</div>
        <nav className="side-nav" aria-label="Business workspace navigation">
          {workspacesQuery.isError ? (
            <NavLink to="/workspace" end className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Building2 size={17} strokeWidth={1.8} /><span>Workspace unavailable</span>
            </NavLink>
          ) : !businessWorkspace ? (
            <NavLink to="/workspace" end className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Building2 size={17} strokeWidth={1.8} /><span>Set up workspace</span>
            </NavLink>
          ) : <>
            <NavLink to={businessHref("/workspace")} end className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Files size={17} strokeWidth={1.8} /><span>Shared files</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/calendar")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <CalendarDays size={17} strokeWidth={1.8} /><span>Shared calendar</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/file-deliveries")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <Files size={17} strokeWidth={1.8} /><span>Private files</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/signatures")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <FileSignature size={17} strokeWidth={1.8} /><span>Signatures</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/approvals")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <ClipboardCheck size={17} strokeWidth={1.8} /><span>Approvals</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/reminders")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <BellRing size={17} strokeWidth={1.8} /><span>Reminders</span>
            </NavLink>
            <NavLink to={businessHref("/workspace/chat")} className={({ isActive }) => `nav-link ${isActive && isBusinessPage ? "nav-link-active" : ""}`} onClick={() => setMenuOpen(false)}>
              <MessageCircle size={17} strokeWidth={1.8} /><span>Team chat</span>
            </NavLink>
          </>}
        </nav>
        {businessWorkspace && (businessWorkspace.role === "OWNER" || businessWorkspace.role === "ADMIN") && <>
          <div className="nav-section-label">Manage</div>
          <nav className="side-nav" aria-label="Workspace management">
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
          </nav>
        </>}
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
            {renderNotificationControl()}
            <span className="topbar-divider" />
            <span className="avatar avatar-small">{initials || "U"}</span>
            {signOutError && <span className="topbar-signout-error" role="alert">{signOutError}</span>}
            <button className="topbar-signout-button" onClick={() => void handleSignOut()} disabled={signingOut}>
              <LogOut size={15} />{signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>
        <main className="page-content" data-product-tour-page>{children}</main>
      </div>
      {tourStep !== null && (() => {
        const step = tourSteps[tourStep];
        if (!step) return null;
        const StepIcon = step.icon;
        return <div className="dashboard-tour-backdrop" style={tourTarget ? { background: "transparent", backdropFilter: "none" } : undefined}>
          {tourTarget && <div
            className="dashboard-tour-spotlight"
            style={{ top: tourTarget.top - 6, left: tourTarget.left - 6, width: tourTarget.width + 12, height: tourTarget.height + 12 }}
            aria-hidden="true"
          />}
          <section className="dashboard-tour-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-tour-title" aria-describedby="dashboard-tour-description">
            <div className="dashboard-tour-topline">
              <span className="eyebrow">A QUICK WALKTHROUGH</span>
              <button type="button" className="dashboard-tour-close" aria-label="Close walkthrough" onClick={finishTour}><X size={18} /></button>
            </div>
            <div className="dashboard-tour-progress" aria-label={`Step ${tourStep + 1} of ${tourSteps.length}`}>
              {tourSteps.map((item, index) => <span key={item.href} className={index <= tourStep ? "is-current" : ""} />)}
            </div>
            <div className="dashboard-tour-icon"><StepIcon size={22} /></div>
            <span className="dashboard-tour-step-label">{step.label} · {tourStep + 1} OF {tourSteps.length}</span>
            <h2 id="dashboard-tour-title">{step.title}</h2>
            <p id="dashboard-tour-description">{step.description}</p>
            <div className="dashboard-tour-footer">
              <button className="dashboard-tour-skip" type="button" onClick={finishTour}>Skip tour</button>
              <div>
                <button className="button button-outline button-compact" type="button" disabled={tourStep === 0} onClick={() => setTourStep((current) => current === null ? null : current - 1)}>Back</button>
                <button className="button button-green button-compact" type="button" onClick={() => tourStep === tourSteps.length - 1 ? finishTour() : setTourStep(tourStep + 1)}>
                  {tourStep === tourSteps.length - 1 ? "Finish" : "Next"}
                  {tourStep < tourSteps.length - 1 && <ArrowRight size={14} />}
                </button>
              </div>
            </div>
          </section>
        </div>;
      })()}
      {user?.id && <ReferralPromotionModal userId={user.id} suppressed={tourStep !== null} />}
    </div>
  );
}
