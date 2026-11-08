import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Folder,
  LockKeyhole,
  MailPlus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import { ActionModal, type ActionModalRequest } from "../components/ActionModal";
import { PlanLimitMessage } from "../components/PlanLimitMessage";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_PRESETS,
  roleLabel,
  workspaceHref,
  type FolderRule,
  type PermissionEffect,
  type PermissionKey,
  type Workspace,
  type WorkspaceActivity,
  type WorkspaceFolder,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
} from "./types";
import { useWorkspaceScope } from "./useWorkspaceScope";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function PageLoading({ label = "Loading workspace…" }: { label?: string }) {
  return <div className="page-loading"><span className="loader" />{label}</div>;
}

function WorkspaceHeader({
  workspace,
  workspaces,
  selectWorkspace,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  selectWorkspace: (id: string) => void;
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading workspace-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}<span className="heading-period">.</span></h1>
        <p className="page-subtitle">{subtitle}</p>
        {workspaces.length > 1 && (
          <label className="workspace-select-label">
            <span>Workspace</span>
            <span className="workspace-select-wrap">
              <select value={workspace.id} onChange={(event) => selectWorkspace(event.target.value)} aria-label="Select business workspace">
                {workspaces.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </label>
        )}
      </div>
      {action}
    </div>
  );
}

function WorkspaceLoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <div><strong>Business workspace couldn’t load.</strong><p>{error instanceof Error ? error.message : "Please try again."}</p></div>
      <button className="button button-outline button-small" onClick={retry}>Try again</button>
    </div>
  );
}

function CreateWorkspaceCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceName = name.trim();
    if (!workspaceName) {
      setError("Enter a name for your business workspace.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const workspace = await apiRequest<Workspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName }),
      });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      const next = new URLSearchParams(searchParams);
      next.set("workspace", workspace.id);
      setSearchParams(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workspace-empty-card">
      <div className="workspace-empty-mark"><Users size={20} /></div>
      <span className="eyebrow">BUSINESS WORKSPACE</span>
      <h2>Bring your team into one secure space.</h2>
      <p>Create a dedicated workspace to invite colleagues and decide exactly which folders they can access.</p>
      <form className="workspace-create-form" onSubmit={(event) => void createWorkspace(event)}>
        <label className="field"><span>Business name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="e.g. Imara Studio" /></label>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <button className="button button-green" type="submit" disabled={submitting}><Plus size={15} />{submitting ? "Creating…" : "Create business workspace"}</button>
      </form>
    </section>
  );
}

export function WorkspaceTeamPage() {
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);
  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: () => apiRequest<WorkspaceMember[]>(`/workspaces/${workspace?.id}/members`),
    enabled: Boolean(workspace && (workspace.role === "OWNER" || workspace.role === "ADMIN")),
  });
  const invitationsQuery = useQuery({
    queryKey: ["workspace-invitations", workspace?.id],
    queryFn: () => apiRequest<WorkspaceInvitation[]>(`/workspaces/${workspace?.id}/invitations`),
    enabled: Boolean(workspace && (workspace.role === "OWNER" || workspace.role === "ADMIN")),
  });

  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") {
    return <NavigateToWorkspace workspaceId={workspace.id} />;
  }

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const pending = invitations.filter((invitation) => invitation.status === "PENDING");
  const filteredMembers = members.filter((member) => {
    const statusMatch = filter === "ALL" || member.status === filter;
    const searchText = `${member.displayName ?? member.user.name} ${member.user.email} ${member.role}`.toLowerCase();
    return statusMatch && (!search.trim() || searchText.includes(search.trim().toLowerCase()));
  });

  async function runMemberAction(member: WorkspaceMember, action: "suspend" | "restore" | "remove") {
    setActionError("");
    setBusyId(member.id);
    try {
      if (action === "remove") {
        await apiRequest<void>(`/workspaces/${workspace!.id}/members/${member.id}`, { method: "DELETE" });
      } else {
        await apiRequest(`/workspaces/${workspace!.id}/members/${member.id}/${action}`, { method: "POST" });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspace!.id] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update this team member.");
      throw error;
    } finally {
      setBusyId("");
    }
  }

  function requestMemberAction(member: WorkspaceMember, action: "suspend" | "restore" | "remove") {
    if (action === "restore") {
      void runMemberAction(member, action).catch(() => undefined);
      return;
    }
    const displayName = member.displayName ?? member.user.name;
    setActionModal({
      title: action === "remove" ? "Remove team member" : "Suspend access",
      description: action === "remove"
        ? `Remove ${displayName} from ${workspace!.name}? Their workspace access and folder permissions will be revoked.`
        : `Suspend ${displayName}? They will lose access immediately.`,
      confirmLabel: action === "remove" ? "Remove member" : "Suspend access",
      danger: true,
      onConfirm: async () => {
        await runMemberAction(member, action);
        setActionModal(null);
      },
    });
  }

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader
        workspace={workspace}
        workspaces={workspaces}
        selectWorkspace={selectWorkspace}
        eyebrow="BUSINESS · PEOPLE"
        title="Your team"
        subtitle="Manage who belongs here and the work they can reach."
        action={<Link className="button button-green" to={workspaceHref("/workspace/team/invite", workspace.id)}><UserPlus size={15} /> Invite a teammate</Link>}
      />
      {membersQuery.isError && <WorkspaceLoadError error={membersQuery.error} retry={() => void membersQuery.refetch()} />}
      {invitationsQuery.isError && <WorkspaceLoadError error={invitationsQuery.error} retry={() => void invitationsQuery.refetch()} />}
      {actionError && <p className="form-alert workspace-alert" role="alert"><PlanLimitMessage message={actionError} /></p>}
      <div className="workspace-metrics" aria-label="Team summary">
        <MetricCard label="Team members" value={members.length} icon={<Users size={17} />} />
        <MetricCard label="Active" value={members.filter((member) => member.status === "ACTIVE").length} accent="green" />
        <MetricCard label="Pending invitations" value={pending.length} icon={<Clock3 size={16} />} />
        <MetricCard label="Suspended" value={members.filter((member) => member.status === "SUSPENDED").length} accent="amber" />
      </div>

      <section className="workspace-panel">
        <div className="workspace-panel-heading">
          <div><span className="eyebrow">PEOPLE & ACCESS</span><h2>Members</h2></div>
          <Link className="subtle-link" to={workspaceHref("/workspace/invitations", workspace.id)}>View invitations <ArrowRight size={13} /></Link>
        </div>
        <div className="workspace-list-toolbar">
          <label className="workspace-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role" aria-label="Search members" /></label>
          <label className="workspace-filter-label">
            <span className="sr-only">Filter members</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="ALL">All members</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option>
            </select>
          </label>
        </div>
        {membersQuery.isLoading ? <PageLoading label="Loading team…" /> : (
          <div className="workspace-member-list">
            {filteredMembers.map((member) => {
              const displayName = member.displayName?.trim() || member.user.name;
              const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const isOwner = member.role === "OWNER";
              return (
                <article className="workspace-member-row" key={member.id}>
                  <div className={`workspace-member-avatar ${member.status === "SUSPENDED" ? "avatar-muted" : ""}`}>{initials || "U"}</div>
                  <div className="workspace-member-main">
                    <Link className="workspace-member-name" to={workspaceHref(`/workspace/team/${member.id}`, workspace.id)}>{displayName}</Link>
                    <span>{member.user.email}</span>
                    <small>Joined {dateFormat.format(new Date(member.joinedAt))}</small>
                  </div>
                  <span className={`role-chip role-${member.role.toLowerCase()}`}>{roleLabel(member.role)}</span>
                  <span className={`member-state state-${member.status.toLowerCase()}`}><i />{member.status === "ACTIVE" ? "Active" : "Suspended"}</span>
                  <span className="workspace-member-access">{member.accessibleFolderCount ?? 0} folders</span>
                  <div className="workspace-member-actions">
                    <Link className="button button-outline button-small" to={workspaceHref(`/workspace/team/${member.id}`, workspace.id)}>Manage</Link>
                    {!isOwner && (workspace.role === "OWNER" || member.role !== "ADMIN") && (
                      <div className="workspace-action-menu">
                        <button className="icon-button" aria-label={`More actions for ${displayName}`} title="More actions" onClick={(event) => {
                          const menu = event.currentTarget.nextElementSibling;
                          if (menu instanceof HTMLElement) menu.hidden = !menu.hidden;
                        }}><MoreHorizontal size={17} /></button>
                        <div className="workspace-action-popover" hidden>
                          {member.status === "ACTIVE"
                            ? <button disabled={busyId === member.id} onClick={() => requestMemberAction(member, "suspend")}>Suspend access</button>
                            : <button disabled={busyId === member.id} onClick={() => requestMemberAction(member, "restore")}>Restore access</button>}
                          <button className="danger-action" disabled={busyId === member.id} onClick={() => requestMemberAction(member, "remove")}>Remove from workspace</button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            {!filteredMembers.length && <div className="workspace-list-empty"><Users size={22} /><strong>{search || filter !== "ALL" ? "No matching members" : "No team members yet"}</strong><span>Invite a colleague to begin sharing work securely.</span></div>}
          </div>
        )}
      </section>
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
      <p className="workspace-note"><LockKeyhole size={13} /> Folder permissions are enforced by the server, not just hidden in this dashboard.</p>
    </div>
  );
}

function MetricCard({ label, value, icon, accent = "navy" }: { label: string; value: number; icon?: ReactNode; accent?: string }) {
  return <div className={`workspace-metric metric-${accent}`}><span className="metric-icon">{icon ?? <Check size={15} />}</span><span className="metric-copy"><small>{label}</small><strong>{value}</strong></span></div>;
}

function NavigateToWorkspace({ workspaceId }: { workspaceId: string }) {
  return (
    <section className="workspace-empty-card">
      <div className="workspace-empty-mark"><LockKeyhole size={19} /></div>
      <span className="eyebrow">YOUR BUSINESS SPACE</span>
      <h2>Folders for the work you do.</h2>
      <p>Your workspace access is limited to the folders assigned by a business administrator.</p>
      <Link className="button button-green" to={workspaceHref("/workspace", workspaceId)}>Open my folders <ArrowRight size={15} /></Link>
    </section>
  );
}

export function WorkspaceInvitePage() {
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("STAFF");
  const [preset, setPreset] = useState("Editor");
  const [inherit, setInherit] = useState(true);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const foldersQuery = useQuery({
    queryKey: ["workspace-accessible-folders", workspace?.id],
    queryFn: () => apiRequest<WorkspaceFolder[]>(`/workspaces/${workspace?.id}/my-folders`),
    enabled: Boolean(workspace),
  });

  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;
  const folderOptions = foldersQuery.data ?? [];

  function toggleFolder(folderId: string) {
    setFolderIds((current) => current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId]);
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (role !== "ADMIN" && folderIds.length === 0) {
      setError("Choose at least one folder to grant initial access, or invite as an administrator.");
      return;
    }
    setSubmitting(true);
    try {
      const initialPermissions = role === "ADMIN" ? [] : folderIds.map((folderId) => ({
        folderId,
        permissionKeys: PERMISSION_PRESETS[preset],
        inherit,
      }));
      await apiRequest(`/workspaces/${workspace.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, ...(name.trim() ? { name: name.trim() } : {}), role, initialPermissions }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace.id] }),
      ]);
      navigate(workspaceHref("/workspace/invitations", workspace.id), { state: { notice: `Invitation sent to ${email}.` } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send this invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · PEOPLE" title="Invite a teammate" subtitle="Send a secure invitation and start with the right level of access." />
      <Link className="back-link workspace-back-link" to={workspaceHref("/workspace/team", workspace.id)}><ArrowLeft size={14} /> Back to team</Link>
      <form className="workspace-form-card" onSubmit={(event) => void submitInvite(event)}>
        <div className="workspace-form-section">
          <span className="eyebrow">01 · INVITATION</span>
          <h2>Who should join?</h2>
          <p>They’ll receive a secure link and can use an existing IMARA account.</p>
          <div className="workspace-fields-grid">
            <label className="field"><span>Work email</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="colleague@company.com" /></label>
            <label className="field"><span>Name <small>Optional</small></span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Their full name" /></label>
          </div>
        </div>
        <div className="workspace-form-section">
          <span className="eyebrow">02 · ROLE</span>
          <h2>Choose their role.</h2>
          <div className="role-choice-grid">
            {(["STAFF", "MANAGER", ...(workspace.role === "OWNER" ? ["ADMIN" as const] : [])] as WorkspaceRole[]).map((item) => (
              <button type="button" className={`role-choice ${role === item ? "role-choice-selected" : ""}`} onClick={() => setRole(item)} key={item}>
                <span className="role-choice-icon">{item === "ADMIN" ? <Shield size={17} /> : <Users size={17} />}</span>
                <strong>{roleLabel(item)}</strong>
                <small>{item === "ADMIN" ? "Manage members, folders and workspace files." : item === "MANAGER" ? "Work in assigned folders; access is scoped per folder." : "Work only in folders assigned to them."}</small>
                {role === item && <Check size={15} className="role-choice-check" />}
              </button>
            ))}
          </div>
        </div>
        {role !== "ADMIN" && (
          <div className="workspace-form-section">
            <span className="eyebrow">03 · STARTING ACCESS</span>
            <h2>Give them a place to begin.</h2>
            <p>Access applies to the selected folder and, optionally, all existing and future subfolders.</p>
            {foldersQuery.isLoading ? <PageLoading label="Loading folder list…" /> : foldersQuery.isError ? <WorkspaceLoadError error={foldersQuery.error} retry={() => void foldersQuery.refetch()} /> : (
              <>
                <div className="workspace-initial-access">
                  {folderOptions.map((folder) => (
                    <label className="workspace-folder-option" key={folder.id}>
                      <input type="checkbox" checked={folderIds.includes(folder.id)} onChange={() => toggleFolder(folder.id)} />
                      <Folder size={16} />
                      <span>{folder.name}</span>
                      {folder.parentFolderId && <small>Subfolder</small>}
                    </label>
                  ))}
                  {!folderOptions.length && <div className="workspace-inline-empty"><Folder size={17} /><span>No folders yet. Create folders first, then add access here.</span></div>}
                </div>
                {folderIds.length > 0 && (
                  <div className="workspace-permission-controls">
                    <label className="field"><span>Permission preset</span>
                      <select value={preset} onChange={(event) => setPreset(event.target.value)}>
                        {Object.keys(PERMISSION_PRESETS).map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="workspace-checkbox-line"><input type="checkbox" checked={inherit} onChange={(event) => setInherit(event.target.checked)} /><span>Include current and future subfolders</span></label>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {role === "ADMIN" && <div className="workspace-admin-notice"><Shield size={16} /><span>Administrators have workspace-wide folder access. Use Manager or Staff for folder-scoped access.</span></div>}
        {error && <p className="form-alert" role="alert"><PlanLimitMessage message={error} /></p>}
        <div className="workspace-form-footer">
          <span><LockKeyhole size={13} /> Invitation links expire after 7 days.</span>
          <button type="submit" className="button button-green" disabled={submitting || foldersQuery.isLoading}>{submitting ? "Sending invitation…" : "Send invitation"}<ArrowRight size={15} /></button>
        </div>
      </form>
    </div>
  );
}

export function WorkspaceMemberPage() {
  const { memberId = "" } = useParams();
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [role, setRole] = useState<WorkspaceRole | "">("");
  const [displayName, setDisplayName] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);
  const memberQuery = useQuery({
    queryKey: ["workspace-member", workspace?.id, memberId],
    queryFn: () => apiRequest<WorkspaceMember>(`/workspaces/${workspace?.id}/members/${memberId}`),
    enabled: Boolean(workspace && memberId),
  });

  useEffect(() => {
    if (memberQuery.data) {
      setRole(memberQuery.data.role);
      setDisplayName(memberQuery.data.displayName ?? memberQuery.data.user.name);
    }
  }, [memberQuery.data]);

  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;
  const member = memberQuery.data;

  async function saveRole() {
    if (!member || !role || role === member.role) return;
    setError("");
    try {
      await apiRequest(`/workspaces/${workspace!.id}/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-member", workspace!.id, member.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] }),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the member.");
    throw reason;
    }
  }

  function requestMemberDetailAction(action: "suspend" | "restore" | "remove") {
    if (action === "restore") {
    void performAction(action).catch(() => undefined);
    return;
    }
    const display = member?.displayName || member?.user.name || "this member";
    setActionModal({
    title: action === "remove" ? "Remove team member" : "Suspend access",
    description: `${action === "remove" ? `Remove ${display} from this workspace?` : `Suspend ${display}'s workspace access?`} This change takes effect immediately.`,
    confirmLabel: action === "remove" ? "Remove member" : "Suspend access",
    danger: true,
    onConfirm: async () => {
      await performAction(action);
      setActionModal(null);
    },
    });
  }

  async function saveDisplayName() {
    if (!member || !displayName.trim() || displayName.trim() === (member.displayName ?? member.user.name)) return;
    setError("");
    try {
      await apiRequest(`/workspaces/${workspace!.id}/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: displayName.trim() }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-member", workspace!.id, member.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] }),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the member name.");
    }
  }

  async function performAction(action: "suspend" | "restore" | "remove") {
    if (!member) return;
    setError("");
    try {
      if (action === "remove") {
        await apiRequest<void>(`/workspaces/${workspace!.id}/members/${member.id}`, { method: "DELETE" });
        await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] });
        navigate(workspaceHref("/workspace/team", workspace!.id));
        return;
      }
      await apiRequest(`/workspaces/${workspace!.id}/members/${member.id}/${action}`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-member", workspace!.id, member.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace!.id] }),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the member.");
    }
  }

  return (
    <div className="workspace-admin-page">
      {workspace && <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · PEOPLE" title="Member details" subtitle="Review workspace role and folder access." />}
      <Link className="back-link workspace-back-link" to={workspaceHref("/workspace/team", workspace?.id)}><ArrowLeft size={14} /> Back to team</Link>
      {memberQuery.isLoading ? <PageLoading label="Loading member…" /> : memberQuery.isError ? <WorkspaceLoadError error={memberQuery.error} retry={() => void memberQuery.refetch()} /> : member && (
        <section className="workspace-member-detail">
          <div className="workspace-detail-person">
            <div className="workspace-member-avatar workspace-member-avatar-large">{(member.displayName || member.user.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
            <div><span className="eyebrow">{member.role === "OWNER" ? "WORKSPACE OWNER" : "TEAM MEMBER"}</span><h2>{member.displayName || member.user.name}</h2><p>{member.user.email}</p></div>
            <span className={`member-state state-${member.status.toLowerCase()}`}><i />{member.status === "ACTIVE" ? "Active" : "Suspended"}</span>
          </div>
          <div className="workspace-detail-grid">
            <div className="workspace-detail-card">
              <span className="eyebrow">ROLE</span>
              {member.role === "OWNER" || (member.role === "ADMIN" && workspace.role !== "OWNER") ? <strong>{roleLabel(member.role)}</strong> : (
                <div className="workspace-role-edit">
                  <select value={role || member.role} onChange={(event) => setRole(event.target.value as WorkspaceRole)} aria-label="Assigned role">
                    {(["STAFF", "MANAGER", ...(workspace?.role === "OWNER" ? ["ADMIN" as const] : [])] as WorkspaceRole[]).map((item) => <option value={item} key={item}>{roleLabel(item)}</option>)}
                  </select>
                  <button className="button button-outline button-small" onClick={() => void saveRole()} disabled={!role || role === member.role}>Save role</button>
                </div>
              )}
            </div>
            <div className="workspace-detail-card"><span className="eyebrow">JOINED</span><strong>{dateFormat.format(new Date(member.joinedAt))}</strong></div>
            <div className="workspace-detail-card"><span className="eyebrow">ACCESSIBLE FOLDERS</span><strong>{member.status !== "ACTIVE" ? "No access while suspended" : member.role === "OWNER" || member.role === "ADMIN" ? "All workspace folders" : `${member.accessibleFolderCount ?? 0} folders`}</strong></div>
          </div>
          {member.role !== "OWNER" && (workspace.role === "OWNER" || member.role !== "ADMIN") && (
            <div className="workspace-member-name-edit">
              <label className="field"><span>Workspace display name</span><input value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <button className="button button-outline button-small" onClick={() => void saveDisplayName()} disabled={!displayName.trim() || displayName.trim() === (member.displayName ?? member.user.name)}>Save name</button>
            </div>
          )}
          {member.role !== "OWNER" && member.role !== "ADMIN" && (
            <div className="workspace-access-callout">
              <div><LockKeyhole size={18} /><span><strong>Folder access is individually scoped</strong><small>Review inherited grants and explicit restrictions before changing access.</small></span></div>
              <Link className="button button-green button-small" to={workspaceHref(`/workspace/team/${member.id}/permissions`, workspace?.id)}>Manage folder access <ArrowRight size={14} /></Link>
            </div>
          )}
          {error && <p className="form-alert" role="alert"><PlanLimitMessage message={error} /></p>}
          {member.role !== "OWNER" && (workspace.role === "OWNER" || member.role !== "ADMIN") && (
            <div className="workspace-danger-zone">
              <div><span className="eyebrow">MEMBERSHIP</span><p>Changes apply to this business workspace only.</p></div>
              {member.status === "ACTIVE"
                ? <button className="button button-outline button-small danger-button" onClick={() => requestMemberDetailAction("suspend")}>Suspend access</button>
                : <button className="button button-outline button-small" onClick={() => requestMemberDetailAction("restore")}>Restore access</button>}
              <button className="button button-outline button-small danger-button" onClick={() => requestMemberDetailAction("remove")}>Remove member</button>
            </div>
          )}
        </section>
      )}
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
    </div>
  );
}

type PermissionDraft = {
  effect: PermissionEffect | "NONE";
  permissionKeys: PermissionKey[];
  inherit: boolean;
};

function normalizeKeys(keys: string[]): PermissionKey[] {
  return keys.filter((key): key is PermissionKey => (PERMISSION_KEYS as readonly string[]).includes(key));
}

function folderDepth(folder: WorkspaceFolder, byId: Map<string, WorkspaceFolder>) {
  let depth = 0;
  let cursor = folder.parentFolderId;
  const seen = new Set([folder.id]);
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parentFolderId ?? null;
  }
  return depth;
}

function effectiveKeys(folder: WorkspaceFolder, folders: WorkspaceFolder[], drafts: Record<string, PermissionDraft>) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const path: WorkspaceFolder[] = [];
  let cursor: WorkspaceFolder | undefined = folder;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
  }
  const allowed = new Set<PermissionKey>();
  for (const item of path) {
    const rule = drafts[item.id];
    if (!rule || (!rule.inherit && item.id !== folder.id)) continue;
    if (rule.effect === "RESTRICT") {
      for (const key of rule.permissionKeys) allowed.delete(key);
    } else if (rule.effect === "GRANT") {
      for (const key of rule.permissionKeys) allowed.add(key);
    }
  }
  return [...allowed];
}

function hasInheritedRule(folder: WorkspaceFolder, folders: WorkspaceFolder[], drafts: Record<string, PermissionDraft>) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  let cursor = folder.parentFolderId ? byId.get(folder.parentFolderId) : undefined;
  const seen = new Set([folder.id]);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const rule = drafts[cursor.id];
    if (rule && rule.effect !== "NONE" && rule.inherit) return true;
    cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
  }
  return false;
}

export function WorkspacePermissionsPage() {
  const { memberId = "" } = useParams();
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const foldersQuery = useQuery({
    queryKey: ["workspace-accessible-folders", workspace?.id],
    queryFn: () => apiRequest<WorkspaceFolder[]>(`/workspaces/${workspace?.id}/my-folders`),
    enabled: Boolean(workspace),
  });
  const permissionQuery = useQuery({
    queryKey: ["workspace-member-permissions", workspace?.id, memberId],
    queryFn: () => apiRequest<{ memberId: string; role: WorkspaceRole; permissions: FolderRule[] }>(`/workspaces/${workspace?.id}/members/${memberId}/permissions`),
    enabled: Boolean(workspace && memberId),
  });
  const memberQuery = useQuery({
    queryKey: ["workspace-member", workspace?.id, memberId],
    queryFn: () => apiRequest<WorkspaceMember>(`/workspaces/${workspace?.id}/members/${memberId}`),
    enabled: Boolean(workspace && memberId),
  });

  useEffect(() => {
    if (!permissionQuery.data) return;
    const next: Record<string, PermissionDraft> = {};
    for (const rule of permissionQuery.data.permissions) {
      next[rule.folderId] = {
        effect: rule.effect,
        permissionKeys: normalizeKeys(rule.permissionKeys),
        inherit: rule.inherit,
      };
    }
    setDrafts(next);
  }, [permissionQuery.data]);

  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;

  const folders = (foldersQuery.data ?? []).slice().sort((a, b) => folderDepth(a, new Map(foldersQuery.data?.map((folder) => [folder.id, folder]) ?? [])) - folderDepth(b, new Map(foldersQuery.data?.map((folder) => [folder.id, folder]) ?? [])) || a.name.localeCompare(b.name));
  const member = memberQuery.data;
  const busy = foldersQuery.isLoading || permissionQuery.isLoading || memberQuery.isLoading;

  function updateDraft(folderId: string, update: Partial<PermissionDraft>) {
    setSaved(false);
    setDrafts((current) => ({
      ...current,
      [folderId]: {
        effect: current[folderId]?.effect ?? "NONE",
        permissionKeys: current[folderId]?.permissionKeys ?? [],
        inherit: current[folderId]?.inherit ?? false,
        ...update,
      },
    }));
  }

  function selectPreset(folderId: string, presetName: string) {
    if (presetName === "No direct rule") {
      updateDraft(folderId, { effect: "NONE", permissionKeys: [] });
    } else if (presetName === "Restricted") {
      updateDraft(folderId, { effect: "RESTRICT", permissionKeys: [...PERMISSION_KEYS] });
    } else {
      updateDraft(folderId, { effect: "GRANT", permissionKeys: PERMISSION_PRESETS[presetName] });
    }
  }

  async function savePermissions() {
    setError("");
    setSaved(false);
    setSaving(true);
    const permissions = Object.entries(drafts)
      .filter(([, draft]) => draft.effect !== "NONE")
      .map(([folderId, draft]) => ({
        folderId,
        effect: draft.effect,
        permissionKeys: draft.effect === "RESTRICT" ? [...PERMISSION_KEYS] : draft.permissionKeys,
        inherit: draft.inherit,
      }));
    try {
      await apiRequest(`/workspaces/${workspace!.id}/members/${memberId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-member-permissions", workspace!.id, memberId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-member", workspace!.id, memberId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-accessible-folders", workspace!.id] }),
      ]);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save folder access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · ACCESS CONTROL" title="Folder permissions" subtitle="A folder rule can grant access, or explicitly block inherited access." />
      <Link className="back-link workspace-back-link" to={workspaceHref(`/workspace/team/${memberId}`, workspace.id)}><ArrowLeft size={14} /> Back to member</Link>
      {member && <div className="permissions-person"><div className="workspace-member-avatar">{(member.displayName || member.user.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><span><strong>{member.displayName || member.user.name}</strong><small>{member.user.email} · {roleLabel(member.role)}</small></span></div>}
      {busy ? <PageLoading label="Resolving folder access…" /> : foldersQuery.isError || permissionQuery.isError || memberQuery.isError ? (
        <WorkspaceLoadError error={foldersQuery.error ?? permissionQuery.error ?? memberQuery.error} retry={() => {
          void foldersQuery.refetch(); void permissionQuery.refetch(); void memberQuery.refetch();
        }} />
      ) : (
        <>
          <div className="permission-explainer"><LockKeyhole size={16} /><p><strong>Precedence:</strong> direct and inherited rules are resolved from parent to child. A child restriction overrides inherited grants for that folder and its descendants; a more specific grant can restore selected actions.</p></div>
          <section className="workspace-panel permission-panel">
            <div className="workspace-panel-heading"><div><span className="eyebrow">ACCESS MAP</span><h2>Folder tree</h2></div><span className="permission-tree-count">{folders.length} folders</span></div>
            {folders.length ? (
              <div className="permission-tree">
                {folders.map((folder) => {
                  const draft = drafts[folder.id] ?? { effect: "NONE" as const, permissionKeys: [], inherit: false };
                  const effective = effectiveKeys(folder, folders, drafts);
                  const inherited = hasInheritedRule(folder, folders, drafts);
                  const depth = folderDepth(folder, new Map(folders.map((item) => [item.id, item])));
                  return (
                    <article className="permission-folder-row" key={folder.id} style={{ "--folder-depth": depth } as React.CSSProperties}>
                      <div className="permission-folder-heading"><Folder size={16} /><strong>{folder.name}</strong>{draft.effect === "RESTRICT" && <span className="restricted-tag"><LockKeyhole size={11} /> Restricted</span>}</div>
                      <div className="permission-folder-controls">
                        <label className="field"><span>Direct rule</span><select value={draft.effect === "RESTRICT" ? "Restricted" : draft.effect === "GRANT" ? "Custom grant" : "No direct rule"} onChange={(event) => {
                          const choice = event.target.value;
                          if (choice === "No direct rule") selectPreset(folder.id, choice);
                          else if (choice === "Restricted") selectPreset(folder.id, choice);
                          else updateDraft(folder.id, { effect: "GRANT", permissionKeys: draft.permissionKeys.length ? draft.permissionKeys : PERMISSION_PRESETS.Editor });
                        }}>
                          <option>No direct rule</option><option>Custom grant</option><option>Restricted</option>
                        </select></label>
                        <label className="field"><span>Preset</span><select disabled={draft.effect === "RESTRICT"} value={Object.entries(PERMISSION_PRESETS).find(([, keys]) => keys.length === draft.permissionKeys.length && keys.every((key) => draft.permissionKeys.includes(key)))?.[0] ?? "Custom"} onChange={(event) => {
                          if (event.target.value !== "Custom") selectPreset(folder.id, event.target.value);
                        }}>
                          {Object.keys(PERMISSION_PRESETS).map((presetName) => <option key={presetName}>{presetName}</option>)}<option>Custom</option>
                        </select></label>
                        <label className="workspace-checkbox-line permission-inherit"><input type="checkbox" checked={draft.inherit} disabled={draft.effect === "NONE"} onChange={(event) => updateDraft(folder.id, { inherit: event.target.checked })} /><span>Include subfolders</span></label>
                      </div>
                      {draft.effect === "GRANT" && (
                        <div className="permission-key-grid">
                          {PERMISSION_KEYS.map((key) => (
                            <label key={key}><input type="checkbox" checked={draft.permissionKeys.includes(key)} onChange={(event) => {
                              const next = event.target.checked ? [...draft.permissionKeys, key] : draft.permissionKeys.filter((item) => item !== key);
                              updateDraft(folder.id, { permissionKeys: next, effect: "GRANT" });
                            }} /><span>{PERMISSION_LABELS[key]}</span></label>
                          ))}
                        </div>
                      )}
                      <div className="permission-effective-summary">
                        <span>{draft.effect === "NONE" && inherited ? "Inherited rule" : "Effective access"}</span>
                        <strong>{effective.length ? effective.map((key) => PERMISSION_LABELS[key]).join(" · ") : "No permissions"}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="workspace-list-empty"><Folder size={21} /><strong>No folders to manage</strong><span>Create folders in the business workspace first.</span></div>}
            {error && <p className="form-alert" role="alert">{error}</p>}
            {saved && <p className="form-success workspace-save-success" role="status"><Check size={15} /> Folder access saved. Changes take effect immediately.</p>}
            <div className="workspace-form-footer"><span>Permissions are checked by the API on every folder and file request.</span><button className="button button-green" onClick={() => void savePermissions()} disabled={saving}>{saving ? "Saving…" : "Save access changes"}</button></div>
          </section>
        </>
      )}
    </div>
  );
}

export function WorkspaceInvitationsPage() {
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const location = useLocation();
  const notice = typeof location.state === "object" && location.state !== null && "notice" in location.state && typeof location.state.notice === "string" ? location.state.notice : "";
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalRequest | null>(null);
  const invitationsQuery = useQuery({
    queryKey: ["workspace-invitations", workspace?.id],
    queryFn: () => apiRequest<WorkspaceInvitation[]>(`/workspaces/${workspace?.id}/invitations`),
    enabled: Boolean(workspace && (workspace.role === "OWNER" || workspace.role === "ADMIN")),
  });
  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;

  async function invitationAction(invitation: WorkspaceInvitation, action: "resend" | "revoke") {
    setBusyId(invitation.id);
    setError("");
    try {
      const path = `/workspaces/${workspace!.id}/invitations/${invitation.id}`;
      await apiRequest(action === "resend" ? `${path}/resend` : path, { method: action === "resend" ? "POST" : "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspace!.id] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the invitation.");
      throw reason;
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · PEOPLE" title="Invitations" subtitle="Track invitations and resend or revoke a pending link." action={<Link className="button button-green" to={workspaceHref("/workspace/team/invite", workspace.id)}><MailPlus size={15} /> Invite teammate</Link>} />
      {notice && <p className="form-success workspace-alert" role="status"><Check size={14} /> {notice}</p>}
      {error && <p className="form-alert workspace-alert" role="alert">{error}</p>}
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><div><span className="eyebrow">INVITATION REGISTER</span><h2>Sent invitations</h2></div></div>
        {invitationsQuery.isLoading ? <PageLoading label="Loading invitations…" /> : invitationsQuery.isError ? <WorkspaceLoadError error={invitationsQuery.error} retry={() => void invitationsQuery.refetch()} /> : (
          <div className="workspace-invitation-list">
            {(invitationsQuery.data ?? []).map((invitation) => (
              <article className="workspace-invitation-row" key={invitation.id}>
                <div className="invitation-avatar"><MailPlus size={16} /></div>
                <div className="workspace-member-main"><strong>{invitation.name || invitation.email.split("@")[0]}</strong><span>{invitation.email} · {roleLabel(invitation.role)}</span></div>
                <span className={`invitation-state invitation-${invitation.status.toLowerCase()}`}>{invitation.status.toLowerCase()}</span>
                <span className="workspace-invitation-date">{invitation.status === "ACCEPTED" && invitation.acceptedAt ? `Joined ${dateFormat.format(new Date(invitation.acceptedAt))}` : invitation.status === "PENDING" ? `Expires ${dateFormat.format(new Date(invitation.expiresAt))}` : `Sent ${dateFormat.format(new Date(invitation.createdAt))}`}</span>
                <div className="workspace-row-actions">
                  {invitation.status === "PENDING" && <>
                    <button className="button button-outline button-small" disabled={busyId === invitation.id} onClick={() => void invitationAction(invitation, "resend").catch(() => undefined)}><RefreshCw size={13} /> Resend</button>
                    <button className="text-button danger-text" disabled={busyId === invitation.id} onClick={() => setActionModal({
                      title: "Revoke invitation",
                      description: `Revoke the invitation for ${invitation.email}? The current invitation link will stop working.`,
                      confirmLabel: "Revoke invitation",
                      danger: true,
                      onConfirm: async () => {
                        await invitationAction(invitation, "revoke");
                        setActionModal(null);
                      },
                    })}>Revoke</button>
                  </>}
                </div>
              </article>
            ))}
            {!invitationsQuery.data?.length && <div className="workspace-list-empty"><MailPlus size={20} /><strong>No invitations yet</strong><span>Invitations you send will be tracked here.</span></div>}
          </div>
        )}
      </section>
      {actionModal && <ActionModal request={actionModal} onClose={() => setActionModal(null)} />}
    </div>
  );
}

export function WorkspaceActivityPage() {
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  const activityQuery = useQuery({
    queryKey: ["workspace-activity", workspace?.id],
    queryFn: () => apiRequest<WorkspaceActivity[]>(`/workspaces/${workspace?.id}/activity`),
    enabled: Boolean(workspace && (workspace.role === "OWNER" || workspace.role === "ADMIN")),
  });
  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · GOVERNANCE" title="Workspace activity" subtitle="A record of membership and folder-access changes." />
      <section className="workspace-panel">
        <div className="workspace-panel-heading"><div><span className="eyebrow">AUDIT LOG</span><h2>Recent activity</h2></div><span className="permission-tree-count">Latest 100 events</span></div>
        {activityQuery.isLoading ? <PageLoading label="Loading activity…" /> : activityQuery.isError ? <WorkspaceLoadError error={activityQuery.error} retry={() => void activityQuery.refetch()} /> : (
          <div className="workspace-activity-list">
            {(activityQuery.data ?? []).map((event) => (
              <article className="workspace-activity-row" key={event.id}>
                <span className="activity-mark"><Shield size={15} /></span>
                <span className="workspace-activity-copy"><strong>{event.action.replace(/_/g, " ").toLowerCase()}</strong><small>{event.actor?.name ?? "System"} · {event.targetType}{event.targetId ? ` · ${event.targetId}` : ""}</small></span>
                <time dateTime={event.createdAt}>{dateTimeFormat.format(new Date(event.createdAt))}</time>
              </article>
            ))}
            {!activityQuery.data?.length && <div className="workspace-list-empty"><Clock3 size={20} /><strong>No activity recorded</strong><span>Important workspace changes will appear here.</span></div>}
          </div>
        )}
      </section>
    </div>
  );
}

export function WorkspaceRolesPage() {
  const { workspacesQuery, workspaces, workspace, selectWorkspace } = useWorkspaceScope();
  if (workspacesQuery.isLoading) return <PageLoading />;
  if (workspacesQuery.isError) return <WorkspaceLoadError error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  if (!workspace) return <CreateWorkspaceCard />;
  if (workspace.role !== "OWNER" && workspace.role !== "ADMIN") return <NavigateToWorkspace workspaceId={workspace.id} />;

  const roles: Array<{ role: WorkspaceRole; summary: string; capabilities: string[]; accent: string }> = [
    { role: "OWNER", summary: "Complete control of membership, access, workspace settings and business storage.", capabilities: ["Manage workspace and storage", "Invite and manage every role", "Grant and restrict folder access", "View workspace activity"], accent: "owner" },
    { role: "ADMIN", summary: "Workspace-wide operations and staff management, without owner-only controls.", capabilities: ["Manage staff and invitations", "Create and organize workspace folders", "Manage business files", "View activity; cannot transfer ownership"], accent: "admin" },
    { role: "MANAGER", summary: "A focused working role with access scoped to assigned folders.", capabilities: ["View assigned folders and files", "Upload and organize where permitted", "No automatic access to other folders", "No workspace administration by default"], accent: "manager" },
    { role: "STAFF", summary: "A clear, limited workspace experience for each person's assigned work.", capabilities: ["Access only assigned folders", "Actions follow each folder's permission set", "No staff administration", "No business settings access"], accent: "staff" },
  ];

  return (
    <div className="workspace-admin-page">
      <WorkspaceHeader workspace={workspace} workspaces={workspaces} selectWorkspace={selectWorkspace} eyebrow="BUSINESS · GOVERNANCE" title="Workspace roles" subtitle="Roles set the workspace boundary; folder rules decide what managers and staff can do." action={<Link className="button button-outline" to={workspaceHref("/workspace/team", workspace.id)}><Users size={15} /> Manage team</Link>} />
      <div className="role-policy-note"><Shield size={16} /><p>Roles are workspace-wide capabilities, not folder permissions. Owner and Administrator have broad workspace access; Manager and Staff require explicit folder grants. Custom roles are not enabled yet.</p></div>
      <section className="workspace-role-cards" aria-label="Workspace roles">
        {roles.map(({ role, summary, capabilities, accent }) => (
          <article className={`workspace-role-card role-card-${accent}`} key={role}>
            <div className="workspace-role-card-heading"><span className="role-card-mark"><Users size={17} /></span><span className={`role-chip role-${role.toLowerCase()}`}>{roleLabel(role)}</span></div>
            <h2>{role === "OWNER" ? "The owner." : role === "ADMIN" ? "The administrator." : role === "MANAGER" ? "The manager." : "The staff member."}</h2>
            <p>{summary}</p>
            <ul>{capabilities.map((capability) => <li key={capability}><Check size={13} />{capability}</li>)}</ul>
          </article>
        ))}
      </section>
      <div className="workspace-role-footer"><LockKeyhole size={15} /><span>Every file operation is checked on the server against membership, role, folder rules and explicit restrictions.</span></div>
    </div>
  );
}

export function AcceptWorkspaceInvitationPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"ready" | "accepting" | "accepted" | "error">(token ? "ready" : "error");
  const [error, setError] = useState(token ? "" : "This invitation link is incomplete. Ask the workspace owner to send you a new invitation.");

  async function accept() {
    if (!token) return;
    setStatus("accepting");
    setError("");
    try {
      const result = await apiRequest<{ workspaceId: string }>("/invitations/" + encodeURIComponent(token) + "/accept", { method: "POST" });
      await navigate(workspaceHref("/workspace", result.workspaceId), { replace: true });
      setStatus("accepted");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to accept this invitation.");
      setStatus("error");
    }
  }

  const returnTo = `${location.pathname}${location.search}`;
  return (
    <main className="invite-accept-page">
      <section className="invite-accept-card">
        <span className="eyebrow">IMARA · BUSINESS</span>
        <div className="invite-accept-mark"><Users size={21} /></div>
        <h1>{status === "accepted" ? "You’re in." : "A place on the team."}</h1>
        <p>{user ? "Accept this secure invitation to join the business workspace. You must be signed in with the invited email address." : "Sign in or create an account with the email address that received this invitation."}</p>
        {error && <p className="form-alert" role="alert"><CircleAlert size={14} />{error}</p>}
        {user ? (
          <button className="button button-green button-wide" onClick={() => void accept()} disabled={status === "accepting" || status === "accepted"}>
            {status === "accepting" ? "Accepting invitation…" : "Accept invitation"}<ArrowRight size={15} />
          </button>
        ) : (
          <div className="invite-auth-actions">
            <Link className="button button-dark button-wide" to="/login" state={{ from: returnTo }}>Sign in to accept <ArrowRight size={15} /></Link>
            <Link className="invite-register-link" to={`/register?invite=${encodeURIComponent(token ?? "")}`}>New to IMARA? Create an account</Link>
          </div>
        )}
        <small><LockKeyhole size={12} /> Invitation links expire after 7 days and can only be used by the invited email.</small>
      </section>
    </main>
  );
}
