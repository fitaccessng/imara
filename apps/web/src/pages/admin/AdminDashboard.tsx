import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Ban,
  Banknote,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  Database,
  FileText,
  FileStack,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LogOut,
  LifeBuoy,
  Megaphone,
  Mail,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../lib/api";
import { BrandMark, BrandWordmark } from "../../components/BrandLockup";
import { PlanManagementPage } from "./PlanManagementPage";
import { SubscriptionManagementPage } from "./SubscriptionManagementPage";
import { PaymentManagementPage } from "./PaymentManagementPage";
import { PlatformSettingsPage } from "./PlatformSettingsPage";
import { AdminRolesPage } from "./AdminRolesPage";
import { adminCurrency } from "./AdminManagementCommon";

type AdminRole =
  | "SUPER_ADMIN"
  | "USER_MANAGEMENT_ADMIN"
  | "FINANCE_ADMIN"
  | "SUPPORT_ADMIN"
  | "MARKETING_ADMIN"
  | "OPERATIONS_ADMIN"
  | "SECURITY_ADMIN";

interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: "ADMIN";
  platformAdminRole: AdminRole;
}

interface PageResult<T> {
  items: T[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

interface Overview {
  counts: {
    users: number;
    verifiedUsers: number;
    plans: Record<"FREE" | "PRO" | "BUSINESS", number>;
    workspaces: number;
    members: number;
    files: number;
    storageBytes: string;
    events: number;
    eventMedia: number;
    eventMediaStorageBytes: string;
  };
  recentRegistrations: Array<{ id: string; email: string; name: string; createdAt: string }>;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  emailVerified: boolean;
  accountStatus: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  subscription: { plan: "FREE" | "PRO" | "BUSINESS" } | null;
}

interface AdminUserDetail extends Omit<AdminUser, "subscription"> {
  subscription: {
    plan: "FREE" | "PRO" | "BUSINESS";
    storageLimitBytes: string;
    storageUsedBytes: string;
    storageReservedBytes: string;
  } | null;
  activity: {
    fileCount: number;
    eventCount: number;
    readyFileBytes: string;
    activeSessionCount: number;
  };
  paymentHistory: Array<{
    id: string;
    plan: "FREE" | "PRO" | "BUSINESS";
    amountMinor: string;
    currency: string;
    status: "PENDING" | "SUCCEEDED" | "EXPIRED";
    createdAt: string;
    paidAt: string | null;
  }> | null;
  supportHistory: {
    total: number;
    OPEN: number;
    PENDING: number;
    RESOLVED: number;
  } | null;
  businesses: Array<{
    id: string;
    name: string;
    createdAt: string;
    memberCount: number;
    fileCount: number;
    storage: { usedBytes: string; limitBytes: string };
  }>;
  memberships: Array<{
    role: string;
    joinedAt: string;
    workspace: { id: string; name: string };
  }>;
  activeSessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    userAgent: string | null;
  }>;
  loginHistory: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    userAgent: string | null;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
  }>;
}

interface AdminBusiness {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  memberCount: number;
  storage: { usedBytes: string; limitBytes: string };
}

interface AdminBusinessDetail {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  members: Array<{
    id: string;
    role: string;
    status: string;
    displayName: string | null;
    joinedAt: string;
    user: { id: string; name: string; email: string };
  }>;
  fileCount: number;
  folderCount: number;
  eventCount: number;
  storage: { usedBytes: string; limitBytes: string; readyFileBytes: string };
}

interface AdminStorageInventory {
  summary: { readyFileCount: number; readyBytes: string };
  largestUsers: Array<{ userId: string; name: string; email: string; readyFileCount: number; usedBytes: string }>;
  largestWorkspaces: Array<{
    workspaceId: string;
    name: string;
    owner: { id: string; name: string; email: string };
    readyFileCount: number;
    usedBytes: string;
  }>;
  mimeTypes: Array<{ mimeType: string; readyFileCount: number; usedBytes: string }>;
}

interface AdminEvent {
  id: string;
  name: string;
  date: string;
  createdAt: string;
  status: "ACTIVE" | "DELETING";
  gallerySetting: "PRIVATE" | "LINK_PUBLIC" | "PASSCODE";
  owner: { id: string; name: string; email: string };
  workspace: { id: string; name: string } | null;
}

interface AdminAnalytics {
  range: { from: string; to: string; endExclusive: boolean; timezone: string };
  registrationsByDay: Array<{ day: string; count: number }>;
  subscriptionDistribution: Array<{ plan: "FREE" | "PRO" | "BUSINESS"; count: number }>;
  notComputed: string[];
}

interface AdminAuditRecord {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; email: string; name: string } | null;
}

interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: "ALL" | "FREE" | "PRO" | "BUSINESS";
  target: "AUDIENCE" | "SIGNUP_WINDOW" | "SELECTED";
  signupWindowMinutes: number | null;
  emailEnabled: boolean;
  createdAt: string;
  recipientCount: number;
  emailDelivery: Record<string, number>;
}

interface AdminAnnouncementRecipient {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface AdminUploadMonitoring {
  totals: {
    readyFiles: number;
    readyBytes: string;
    scanUploads: number;
    staleProcessingRecords: number;
  };
  byStatus: Record<"UPLOADING" | "READY" | "DELETING", number>;
  bySource: Record<"STANDARD" | "SCAN" | "EVENT_MEDIA", number>;
  mimeTypes: Array<{ mimeType: string; readyFileCount: number; readyBytes: string }>;
  uploads: {
    items: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: string;
      status: "UPLOADING" | "READY" | "DELETING";
      uploadSource: "STANDARD" | "SCAN" | "EVENT_MEDIA";
      createdAt: string;
      uploader: { id: string; name: string; email: string } | null;
      workspace: { id: string; name: string } | null;
      event: { id: string; name: string } | null;
    }>;
    page: PageResult<unknown>["page"];
  };
  notTracked: string[];
}

interface AdminSystemHealth {
  checkedAt: string;
  status: "healthy" | "degraded";
  checks: {
    database: "healthy" | "unavailable";
    objectStorage: { status: "healthy" | "unavailable" | "not-configured"; driver: string };
    email: "healthy" | "unavailable" | "not-configured";
  };
  integrations: {
    backups: "not-integrated";
    OCR: "not-integrated";
    malwareScanning: "not-integrated";
  };
}

interface AdminSupportTicket {
  id: string;
  subject: string;
  category: "ACCOUNT" | "BILLING" | "FILES" | "EVENTS" | "OTHER";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "OPEN" | "PENDING" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string };
  assignedAdmin: { id: string; name: string; email: string } | null;
  messageCount: number;
}

interface AdminSupportTicketDetails extends Omit<AdminSupportTicket, "messageCount"> {
  messages: Array<{
    id: string;
    body: string;
    internalNote: boolean;
    createdAt: string;
    author: { id: string; name: string; email: string; role: "USER" | "ADMIN" };
  }>;
}

interface AdminSupportAgent {
  id: string;
  name: string;
  email: string;
}

const roleLabels: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  USER_MANAGEMENT_ADMIN: "User Management",
  FINANCE_ADMIN: "Finance",
  SUPPORT_ADMIN: "Support",
  MARKETING_ADMIN: "Marketing",
  OPERATIONS_ADMIN: "Operations",
  SECURITY_ADMIN: "Security",
};

const unavailableMetricLabels: Record<string, string> = {
  MRR: "Monthly recurring revenue (MRR)",
  DAU: "Daily active users",
  churn: "Churn",
};

function canViewUsers(role: AdminRole) {
  return ["SUPER_ADMIN", "USER_MANAGEMENT_ADMIN", "SUPPORT_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function canViewBusinesses(role: AdminRole) {
  return ["SUPER_ADMIN", "SUPPORT_ADMIN", "OPERATIONS_ADMIN"].includes(role);
}

function canViewAudit(role: AdminRole) {
  return role === "SUPER_ADMIN" || role === "SECURITY_ADMIN";
}

function canViewStorage(role: AdminRole) {
  return ["SUPER_ADMIN", "OPERATIONS_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function canViewEvents(role: AdminRole) {
  return ["SUPER_ADMIN", "SUPPORT_ADMIN", "OPERATIONS_ADMIN"].includes(role);
}

function canViewAnalytics(role: AdminRole) {
  return ["SUPER_ADMIN", "FINANCE_ADMIN"].includes(role);
}

function canViewBilling(role: AdminRole) {
  return ["SUPER_ADMIN", "FINANCE_ADMIN"].includes(role);
}

function canManagePlatformAdmins(role: AdminRole) {
  return role === "SUPER_ADMIN";
}

function canManageAnnouncements(role: AdminRole) {
  return ["SUPER_ADMIN", "MARKETING_ADMIN"].includes(role);
}

function canViewSupportTickets(role: AdminRole) {
  return ["SUPER_ADMIN", "SUPPORT_ADMIN"].includes(role);
}

function canViewUploadMonitoring(role: AdminRole) {
  return ["SUPER_ADMIN", "OPERATIONS_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function canManageUserStatus(role: AdminRole) {
  return ["SUPER_ADMIN", "USER_MANAGEMENT_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function canRevokeUserSessions(role: AdminRole) {
  return ["SUPER_ADMIN", "USER_MANAGEMENT_ADMIN", "SUPPORT_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function canManageUserCredentials(role: AdminRole) {
  return ["SUPER_ADMIN", "USER_MANAGEMENT_ADMIN", "SECURITY_ADMIN"].includes(role);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function formatBytes(raw: string) {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** unit;
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorText(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return "Your administrator role does not have permission to view this section.";
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function AdminPageState({ title, error, retry }: { title: string; error: unknown; retry: () => void }) {
  return (
    <section className="admin-state-card" role="alert">
      <CircleAlert size={20} aria-hidden="true" />
      <div><h2>{title}</h2><p>{errorText(error)}</p></div>
      {!(error instanceof ApiError && error.status === 403) && <button className="admin-button admin-button-secondary" onClick={retry}>Try again</button>}
    </section>
  );
}

function PageLoading({ label }: { label: string }) {
  return <div className="admin-page-loading"><span className="loader" />{label}</div>;
}

function AdminRouteBlocked() {
  return (
    <section className="admin-state-card">
      <ShieldCheck size={20} aria-hidden="true" />
      <div><h2>Section not available for your role</h2><p>This section requires a different platform-admin permission. Contact a Super Admin if you believe you need access.</p></div>
      <Link to="/admin" className="admin-button admin-button-secondary">Return to dashboard</Link>
    </section>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone = "green" }: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "green" | "navy" | "gold";
}) {
  return (
    <article className={`admin-stat-card admin-stat-${tone}`}>
      <div className="admin-stat-top"><span>{label}</span><span className="admin-stat-icon"><Icon size={18} /></span></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function AdminOverview({ canReadUsers, canReadStorage, canReadEvents, canReadAnalytics }: {
  canReadUsers: boolean;
  canReadStorage: boolean;
  canReadEvents: boolean;
  canReadAnalytics: boolean;
}) {
  const query = useQuery({ queryKey: ["admin-overview"], queryFn: () => apiRequest<Overview>("/admin/overview") });
  if (query.isPending) return <PageLoading label="Loading platform overview…" />;
  if (query.isError) return <AdminPageState title="Overview could not load" error={query.error} retry={() => void query.refetch()} />;
  const { counts, recentRegistrations } = query.data;
  const verificationRate = counts.users ? Math.round((counts.verifiedUsers / counts.users) * 100) : 0;

  return (
    <div className="admin-page-content">
      <header className="admin-page-heading">
        <div><span className="admin-eyebrow">PLATFORM OVERVIEW</span><h1>Good to see you.</h1><p>Live totals from the IMARA account, workspace, file, and event records.</p></div>
        <div className="admin-overview-actions">
          <span className="admin-live-chip"><i /> Database snapshot</span>
          {canReadUsers && <Link to="/admin/users">View customers <ArrowRight size={13} /></Link>}
          {canReadStorage && <Link to="/admin/storage">Review storage <ArrowRight size={13} /></Link>}
          {canReadEvents && <Link to="/admin/events">Review events <ArrowRight size={13} /></Link>}
          {canReadAnalytics && <Link to="/admin/analytics">Open analytics <ArrowRight size={13} /></Link>}
        </div>
      </header>

      <section className="admin-stat-grid" aria-label="Platform totals">
        <StatCard label="Registered accounts" value={formatNumber(counts.users)} detail={`${formatNumber(counts.verifiedUsers)} email verified · ${verificationRate}%`} icon={Users} />
        <StatCard label="Business workspaces" value={formatNumber(counts.workspaces)} detail={`${formatNumber(counts.members)} membership records`} icon={Building2} tone="navy" />
        <StatCard label="Ready files" value={formatNumber(counts.files)} detail={`${formatBytes(counts.storageBytes)} recorded file data`} icon={FileStack} />
        <StatCard label="Events & galleries" value={formatNumber(counts.events)} detail={`${formatNumber(counts.eventMedia)} guest media uploads`} icon={Activity} tone="gold" />
      </section>

      <div className="admin-overview-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">SUBSCRIPTIONS</span><h2>Plans by account</h2></div><Link to="/pricing">Pricing details <ArrowRight size={14} /></Link></div>
          <div className="admin-plan-list">
            {(["FREE", "PRO", "BUSINESS"] as const).map((plan) => {
              const share = counts.users ? Math.round((counts.plans[plan] / counts.users) * 100) : 0;
              return <div className="admin-plan-row" key={plan}>
                <div className="admin-plan-meta"><span><i className={`admin-plan-dot admin-plan-${plan.toLowerCase()}`} />{plan}</span><strong>{formatNumber(counts.plans[plan])}<small> accounts</small></strong></div>
                <div className="admin-progress"><span className={`admin-progress-${plan.toLowerCase()}`} style={{ width: `${share}%` }} /></div>
              </div>;
            })}
          </div>
          <p className="admin-panel-note">Counts reflect current subscription records. Verified one-time receipts are available under Payments &amp; revenue; automatic renewals and MRR are not inferred.</p>
        </section>

        <section className="admin-panel admin-storage-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">FILE OPERATIONS</span><h2>Recorded storage</h2></div><HardDrive size={19} /></div>
          <div className="admin-storage-total">{formatBytes(counts.storageBytes)}</div>
          <p>Size total for ready file records, including event uploads.</p>
          <div className="admin-storage-split"><span>Event media <strong>{formatBytes(counts.eventMediaStorageBytes)}</strong></span><span>{formatNumber(counts.eventMedia)} items</span></div>
          <div className="admin-storage-split"><span>Business staff records</span><strong>{formatNumber(counts.members)}</strong></div>
          <p className="admin-panel-note">Storage is calculated from database file sizes, not a live object-store health check.</p>
        </section>
      </div>

      <section className="admin-panel admin-recent-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">LATEST ACCOUNTS</span><h2>Recent registrations</h2></div>
          {canReadUsers && <Link to="/admin/users">View directory <ArrowRight size={14} /></Link>}
        </div>
        {recentRegistrations.length === 0 ? <div className="admin-empty-state"><Users size={20} /><strong>No accounts yet</strong><span>New registrations will appear here.</span></div> : (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>Account</th><th>Email</th><th>Registered</th><th /></tr></thead>
            <tbody>{recentRegistrations.map((account) => <tr key={account.id}>
              <td><strong>{account.name}</strong></td><td>{account.email}</td><td>{formatDate(account.createdAt)}</td>
              <td><Link aria-label={`View user directory for ${account.name}`} to={`/admin/users?q=${encodeURIComponent(account.email)}`}><ArrowRight size={15} /></Link></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <p className="admin-data-footnote"><CheckCircle2 size={14} /> Verified payment receipts, support tickets, and live service health are available in their dedicated admin sections. This overview does not estimate MRR, churn, or user activity that the platform does not record.</p>
    </div>
  );
}

function useDirectory<T>(endpoint: string, key: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q")?.trim() ?? "";
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (q) query.set("q", q);
  const result = useQuery({
    queryKey: [key, page, q],
    queryFn: () => apiRequest<PageResult<T>>(`${endpoint}?${query.toString()}`),
  });
  function search(term: string) {
    const next = new URLSearchParams();
    if (term) next.set("q", term);
    setSearchParams(next);
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next);
  }
  return { page, q, result, search, changePage };
}

function SearchableDirectoryHeader({ eyebrow, title, description, initialValue, placeholder, onSearch }: {
  eyebrow: string;
  title: string;
  description: string;
  initialValue: string;
  placeholder: string;
  onSearch: (term: string) => void;
}) {
  return <header className="admin-page-heading admin-directory-heading">
    <div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    <form className="admin-search-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      onSearch(String(data.get("search") ?? "").trim());
    }}>
      <label className="admin-search-field"><Search size={16} /><input name="search" defaultValue={initialValue} placeholder={placeholder} /><button type="submit">Search</button></label>
    </form>
  </header>;
}

function AdminPagination({ page, onChange }: { page: PageResult<unknown>["page"]; onChange: (page: number) => void }) {
  return <div className="admin-pagination">
    <span>{page.totalItems ? `${formatNumber((page.page - 1) * page.pageSize + 1)}–${formatNumber(Math.min(page.page * page.pageSize, page.totalItems))} of ${formatNumber(page.totalItems)}` : "0 results"}</span>
    <div><button type="button" className="admin-button admin-button-secondary" disabled={page.page <= 1} onClick={() => onChange(page.page - 1)}><ChevronLeft size={15} /> Previous</button>
      <span>Page {page.page} of {Math.max(1, page.totalPages)}</span>
      <button type="button" className="admin-button admin-button-secondary" disabled={page.page >= page.totalPages} onClick={() => onChange(page.page + 1)}>Next <ChevronRight size={15} /></button></div>
  </div>;
}

function AdminUsers() {
  const { q, result, search, changePage } = useDirectory<AdminUser>("/admin/users", "admin-users");
  if (result.isPending) return <PageLoading label="Loading customer directory…" />;
  if (result.isError) return <AdminPageState title="Customer directory could not load" error={result.error} retry={() => void result.refetch()} />;
  const { items, page: pagination } = result.data;
  return <div className="admin-page-content">
    <SearchableDirectoryHeader eyebrow="CUSTOMERS" title="All users" description="Search account metadata, plan and account status. Open an account for audited controls." initialValue={q} placeholder="Search by name or email" onSearch={search} />
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">ACCOUNT DIRECTORY</span><h2>{countLabel(pagination.totalItems, "account")}</h2></div><span className="admin-readonly-chip"><ShieldCheck size={13} /> Private files never shown</span></div>
      {items.length === 0 ? <div className="admin-empty-state"><Search size={20} /><strong>No matching accounts</strong><span>Try a different name, email, or search term.</span></div> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>User</th><th>Plan</th><th>Verification</th><th>Status</th><th>Joined</th><th /></tr></thead>
        <tbody>{items.map((user) => <tr key={user.id}>
          <td><strong>{user.name}</strong><small>{user.email}</small><small className="admin-id">ID · {user.id}</small></td>
          <td><span className={`admin-plan-badge admin-plan-badge-${(user.subscription?.plan ?? "FREE").toLowerCase()}`}>{user.subscription?.plan ?? "No plan"}</span></td>
          <td><span className={`admin-verify-badge ${user.emailVerified ? "is-verified" : "is-unverified"}`}>{user.emailVerified ? "Verified" : "Unverified"}</span></td>
          <td><span className={`admin-account-status ${user.accountStatus === "ACTIVE" ? "is-active" : "is-suspended"}`}>{user.accountStatus === "ACTIVE" ? "Active" : "Suspended"}</span></td>
          <td>{formatDate(user.createdAt)}</td>
          <td><Link className="admin-row-action" to={`/admin/users/${user.id}`}>Details <ArrowRight size={13} /></Link></td>
        </tr>)}</tbody>
      </table></div>}
      <AdminPagination page={pagination} onChange={changePage} />
    </section>
  </div>;
}

function AdminBusinesses() {
  const { q, result, search, changePage } = useDirectory<AdminBusiness>("/admin/businesses", "admin-businesses");
  if (result.isPending) return <PageLoading label="Loading business directory…" />;
  if (result.isError) return <AdminPageState title="Business directory could not load" error={result.error} retry={() => void result.refetch()} />;
  const { items, page } = result.data;
  return <div className="admin-page-content">
    <SearchableDirectoryHeader eyebrow="CUSTOMERS" title="Business workspaces" description="Workspace owners, membership totals and recorded file storage. Select a workspace to inspect its access metadata." initialValue={q} placeholder="Search workspace or owner" onSearch={search} />
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">WORKSPACE DIRECTORY</span><h2>{countLabel(page.totalItems, "workspace")}</h2></div><span className="admin-readonly-chip"><ShieldCheck size={13} /> No document content</span></div>
      {items.length === 0 ? <div className="admin-empty-state"><Building2 size={20} /><strong>No matching workspaces</strong><span>Try another workspace or owner search.</span></div> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Business</th><th>Owner</th><th>Members</th><th>Recorded storage</th><th>Created</th><th /></tr></thead>
        <tbody>{items.map((business) => <tr key={business.id}>
          <td><strong>{business.name}</strong><small className="admin-id">ID · {business.id}</small></td>
          <td><strong>{business.owner.name}</strong><small>{business.owner.email}</small></td>
          <td>{formatNumber(business.memberCount)}</td>
          <td><strong>{formatBytes(business.storage.usedBytes)}</strong><small>of {formatBytes(business.storage.limitBytes)}</small></td>
          <td>{formatDate(business.createdAt)}</td>
          <td><Link className="admin-row-action" to={`/admin/businesses/${business.id}`}>Details <ArrowRight size={13} /></Link></td>
        </tr>)}</tbody>
      </table></div>}
      <AdminPagination page={page} onChange={changePage} />
    </section>
  </div>;
}

function AdminUserDetail({ role }: { role: AdminRole }) {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [mutationNotice, setMutationNotice] = useState("");
  const query = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => apiRequest<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  const statusChange = useMutation({
    mutationFn: (status: "ACTIVE" | "SUSPENDED") => apiRequest<{ status: "ACTIVE" | "SUSPENDED"; revokedSessionCount: number }>(
      `/admin/users/${encodeURIComponent(id)}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
    onSuccess: async ({ status, revokedSessionCount }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
      setMutationNotice(status === "SUSPENDED"
        ? `Account suspended. ${revokedSessionCount} active session${revokedSessionCount === 1 ? "" : "s"} revoked.`
        : "Account reactivated. The user must sign in again to start a new session.");
    },
  });
  const sessionRevoke = useMutation({
    mutationFn: (sessionId: string) => apiRequest<void>(
      `/admin/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    ),
    onSuccess: async () => {
      setMutationNotice("Session revoked. The account must sign in again on that device.");
      await queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] });
    },
  });
  const passwordReset = useMutation({
    mutationFn: () => apiRequest<{ message: string }>(
      `/admin/users/${encodeURIComponent(id)}/password-reset`,
      { method: "POST" },
    ),
    onSuccess: ({ message }) => setMutationNotice(message),
  });
  const verificationResend = useMutation({
    mutationFn: () => apiRequest<{ sent: boolean; message: string }>(
      `/admin/users/${encodeURIComponent(id)}/verification-email`,
      { method: "POST" },
    ),
    onSuccess: ({ message }) => setMutationNotice(message),
  });
  if (query.isPending) return <PageLoading label="Loading customer account metadata…" />;
  if (query.isError) return <AdminPageState title="Customer details could not load" error={query.error} retry={() => void query.refetch()} />;
  const account = query.data;
  const canChangeStatus = canManageUserStatus(role);
  const canRevokeSessions = canRevokeUserSessions(role);

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div>
        <Link className="admin-back-link" to="/admin/users">← All users</Link>
        <span className="admin-eyebrow">CUSTOMER ACCOUNT</span>
        <h1>{account.name}</h1>
        <p>{account.email} · Joined {formatDate(account.createdAt)}</p>
      </div>
      <span className={`admin-account-status ${account.accountStatus === "ACTIVE" ? "is-active" : "is-suspended"}`}>{account.accountStatus === "ACTIVE" ? "Active account" : "Suspended account"}</span>
    </header>

    {mutationNotice && <p className="admin-action-notice" role="status">{mutationNotice}</p>}
    {statusChange.isError && <p className="admin-action-error" role="alert">{errorText(statusChange.error)}</p>}
    {sessionRevoke.isError && <p className="admin-action-error" role="alert">{errorText(sessionRevoke.error)}</p>}
    {passwordReset.isError && <p className="admin-action-error" role="alert">{errorText(passwordReset.error)}</p>}
    {verificationResend.isError && <p className="admin-action-error" role="alert">{errorText(verificationResend.error)}</p>}

    <section className="admin-stat-grid" aria-label="Customer account summary">
      <StatCard label="Subscription" value={account.subscription?.plan ?? "No plan"} detail={account.paymentHistory === null ? "Billing details restricted" : account.paymentHistory[0] ? `Latest payment ${account.paymentHistory[0].status.toLowerCase()}` : "No recorded payments"} icon={UserRound} />
      <StatCard label="Files" value={formatNumber(account.activity.fileCount)} detail={`${formatBytes(account.activity.readyFileBytes)} ready file data`} icon={FileStack} tone="navy" />
      <StatCard label="Events" value={formatNumber(account.activity.eventCount)} detail="Created by this account" icon={Activity} tone="gold" />
      <StatCard label="Active sessions" value={formatNumber(account.activity.activeSessionCount)} detail="Revocation requires permission" icon={Clock3} />
    </section>

    <div className="admin-overview-grid">
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">ACCOUNT</span><h2>Profile and access</h2></div><ShieldCheck size={18} /></div>
        <dl className="admin-detail-list">
          <div><dt>Email</dt><dd>{account.email}</dd></div>
          <div><dt>Email verification</dt><dd>{account.emailVerified ? "Verified" : "Not verified"}</dd></div>
          <div><dt>Account type</dt><dd>{account.role === "ADMIN" ? "Platform administrator" : account.businesses.length || account.memberships.length ? "Business member" : "Personal account"}</dd></div>
          <div><dt>Account ID</dt><dd className="admin-id">{account.id}</dd></div>
        </dl>
        {canChangeStatus && account.role !== "ADMIN" && <button
          className={`admin-button ${account.accountStatus === "ACTIVE" ? "admin-button-danger" : "admin-button-primary"}`}
          disabled={statusChange.isPending}
          type="button"
          onClick={() => {
            const status = account.accountStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
            const action = status === "SUSPENDED" ? "Suspend this account? All active sessions will be revoked." : "Reactivate this account? Existing sessions remain revoked.";
            if (window.confirm(action)) statusChange.mutate(status);
          }}
        >
          {statusChange.isPending ? "Saving…" : account.accountStatus === "ACTIVE" ? <><Ban size={14} /> Suspend account</> : <><RotateCcw size={14} /> Reactivate account</>}
        </button>}
        {canManageUserCredentials(role) && account.role !== "ADMIN" && <button
          className="admin-button admin-button-secondary"
          disabled={passwordReset.isPending}
          type="button"
          onClick={() => {
            if (window.confirm(`Send a password reset code to ${account.email}?`)) passwordReset.mutate();
          }}
        >
          {passwordReset.isPending ? "Sending…" : <><Mail size={14} /> Send password reset code</>}
        </button>}
        {canManageUserCredentials(role) && account.role !== "ADMIN" && !account.emailVerified && <button
          className="admin-button admin-button-secondary"
          disabled={verificationResend.isPending}
          type="button"
          onClick={() => {
            if (window.confirm(`Send an email verification code to ${account.email}?`)) verificationResend.mutate();
          }}
        >
          {verificationResend.isPending ? "Sending…" : <><Mail size={14} /> Resend verification code</>}
        </button>}
        {account.role === "ADMIN" && <p className="admin-panel-note">Platform administrator accounts are not suspended from customer controls.</p>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">STORAGE</span><h2>Recorded account usage</h2></div><HardDrive size={18} /></div>
        <div className="admin-storage-total">{formatBytes(account.subscription?.storageUsedBytes ?? account.activity.readyFileBytes)}</div>
        <p>Stored file metadata total; this view does not expose documents or file contents.</p>
        <div className="admin-storage-split"><span>Quota</span><strong>{formatBytes(account.subscription?.storageLimitBytes ?? "0")}</strong></div>
        <div className="admin-storage-split"><span>Reserved for uploads</span><strong>{formatBytes(account.subscription?.storageReservedBytes ?? "0")}</strong></div>
      </section>
    </div>

    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">BUSINESS WORKSPACES</span><h2>{formatNumber(account.businesses.length)} owned</h2></div></div>
      {account.businesses.length ? <div className="admin-related-list">{account.businesses.map((business) => <Link key={business.id} to={`/admin/businesses/${business.id}`} className="admin-related-row">
        <span className="admin-related-icon"><Building2 size={16} /></span>
        <span><strong>{business.name}</strong><small>{countLabel(business.memberCount, "member")} · {countLabel(business.fileCount, "file")}</small></span>
        <span>{formatBytes(business.storage.usedBytes)} <ArrowRight size={14} /></span>
      </Link>)}</div> : <div className="admin-empty-state"><Building2 size={20} /><strong>No owned workspaces</strong><span>This account does not own a business workspace.</span></div>}
      {account.memberships.length > 0 && <div className="admin-membership-list">
        <h3>Active workspace memberships</h3>
        {account.memberships.map((membership) => <div key={`${membership.workspace.id}-${membership.role}`} className="admin-membership-row">
          <span>{membership.workspace.name}</span><strong>{membership.role}</strong><small>Joined {formatDate(membership.joinedAt)}</small>
        </div>)}
      </div>}
    </section>

    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">SESSIONS</span><h2>Active sign-ins</h2></div><span className="admin-readonly-chip"><ShieldCheck size={13} /> Tokens never displayed</span></div>
      {account.activeSessions.length ? <div className="admin-session-list">{account.activeSessions.map((session) => <div className="admin-session-row" key={session.id}>
        <span className="admin-related-icon"><Clock3 size={15} /></span>
        <span><strong>{session.userAgent || "Unknown device"}</strong><small>Last active {formatDate(session.lastSeenAt)} · Started {formatDate(session.createdAt)}</small></span>
        {canRevokeSessions && <button className="admin-button admin-button-secondary" type="button" disabled={sessionRevoke.isPending} onClick={() => {
          if (window.confirm("Revoke this sign-in session? The device will need to sign in again.")) sessionRevoke.mutate(session.id);
        }}>Revoke</button>}
      </div>)}</div> : <div className="admin-empty-state"><Clock3 size={20} /><strong>No active sessions</strong><span>There are no current sign-ins for this account.</span></div>}
      <div className="admin-membership-list">
        <h3>Recent login history</h3>
        {account.loginHistory.length ? account.loginHistory.map((login) => <div className="admin-membership-row" key={login.id}>
          <span>{login.userAgent || "Unknown device"}</span><strong>{login.status}</strong><small>Signed in {formatDate(login.createdAt)} · Last active {formatDate(login.lastSeenAt)}</small>
        </div>) : <p className="admin-panel-note">No sign-in history is recorded for this account.</p>}
      </div>
    </section>
    {account.paymentHistory && <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">BILLING</span><h2>Payment history</h2></div><Banknote size={18} /></div>
      {account.paymentHistory.length ? <div className="admin-related-list">{account.paymentHistory.map((payment) => <div className="admin-related-row" key={payment.id}>
        <span className="admin-related-icon"><CreditCard size={16} /></span>
        <span><strong>{payment.plan} · {adminCurrency(payment.amountMinor, payment.currency)}</strong><small>{payment.status} · Started {formatDate(payment.createdAt)}</small></span>
        <span>{payment.paidAt ? `Paid ${formatDate(payment.paidAt)}` : "Not paid"}</span>
      </div>)}</div> : <div className="admin-empty-state"><Banknote size={20} /><strong>No payment attempts</strong><span>No payment records are associated with this customer.</span></div>}
    </section>}
    {account.supportHistory && <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">SUPPORT</span><h2>Support history</h2></div><LifeBuoy size={18} /></div>
      <div className="admin-stat-grid">
        <StatCard label="Total tickets" value={formatNumber(account.supportHistory.total)} detail="Created by this customer" icon={LifeBuoy} />
        <StatCard label="Open" value={formatNumber(account.supportHistory.OPEN)} detail="Awaiting resolution" icon={CircleAlert} />
        <StatCard label="Pending" value={formatNumber(account.supportHistory.PENDING)} detail="In progress" icon={Clock3} />
        <StatCard label="Resolved" value={formatNumber(account.supportHistory.RESOLVED)} detail="Closed requests" icon={CheckCircle2} />
      </div>
      {account.supportHistory.total > 0 && <Link className="admin-back-link" to={`/admin/support-tickets?q=${encodeURIComponent(account.email)}`}>View this customer's tickets <ArrowRight size={14} /></Link>}
    </section>}
  </div>;
}

function AdminBusinessDetail({ role }: { role: AdminRole }) {
  const { id = "" } = useParams();
  const query = useQuery({
    queryKey: ["admin-business-detail", id],
    queryFn: () => apiRequest<AdminBusinessDetail>(`/admin/businesses/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
  if (query.isPending) return <PageLoading label="Loading business workspace metadata…" />;
  if (query.isError) return <AdminPageState title="Business details could not load" error={query.error} retry={() => void query.refetch()} />;
  const business = query.data;

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><Link className="admin-back-link" to="/admin/businesses">← Business workspaces</Link><span className="admin-eyebrow">BUSINESS WORKSPACE</span><h1>{business.name}</h1><p>Created {formatDate(business.createdAt)} · Workspace metadata only</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> No document content</span>
    </header>
    <section className="admin-stat-grid" aria-label="Business workspace summary">
      <StatCard label="Owner" value={business.owner.name} detail={business.owner.email} icon={UserRound} />
      <StatCard label="Members" value={formatNumber(business.members.length)} detail="Non-removed memberships" icon={Users} tone="navy" />
      <StatCard label="Files / folders" value={`${formatNumber(business.fileCount)} / ${formatNumber(business.folderCount)}`} detail="Metadata counts only" icon={FolderOpen} />
      <StatCard label="Events" value={formatNumber(business.eventCount)} detail="Events linked to workspace folders" icon={Activity} tone="gold" />
    </section>
    <section className="admin-overview-grid">
      <div className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">STORAGE</span><h2>Recorded workspace usage</h2></div><HardDrive size={18} /></div>
        <div className="admin-storage-total">{formatBytes(business.storage.usedBytes)}</div>
        <div className="admin-storage-split"><span>Quota</span><strong>{formatBytes(business.storage.limitBytes)}</strong></div>
        <div className="admin-storage-split"><span>Ready file records</span><strong>{formatBytes(business.storage.readyFileBytes)}</strong></div>
        <p className="admin-panel-note">This is recorded database usage, not a live object-storage or backup health check.</p>
      </div>
      <div className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">SUBSCRIPTION</span><h2>Billing data unavailable</h2></div></div>
        <p className="admin-detail-copy">The workspace schema has no separate subscription or payment-provider record. No billing status, renewal date or revenue is inferred here.</p>
      </div>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">TEAM ACCESS</span><h2>{countLabel(business.members.length, "member")}</h2></div><span className="admin-readonly-chip"><ShieldCheck size={13} /> Inspect only</span></div>
      {business.members.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Member</th><th>Workspace role</th><th>Access status</th><th>Joined</th></tr></thead>
        <tbody>{business.members.map((member) => <tr key={member.id}>
          <td>{canViewUsers(role) ? <Link to={`/admin/users/${member.user.id}`}><strong>{member.displayName || member.user.name}</strong></Link> : <strong>{member.displayName || member.user.name}</strong>}<small>{member.user.email}</small></td>
          <td>{member.role}</td><td><span className={`admin-account-status ${member.status === "ACTIVE" ? "is-active" : "is-suspended"}`}>{member.status}</span></td><td>{formatDate(member.joinedAt)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty-state"><Users size={20} /><strong>No workspace members</strong><span>No current membership records are available.</span></div>}
    </section>
    <p className="admin-data-footnote"><FileText size={14} /> Workspace access, member roles and storage metadata are visible. Private documents, file names and contents are not.</p>
  </div>;
}

function AdminStorageInventory({ role }: { role: AdminRole }) {
  const query = useQuery({
    queryKey: ["admin-storage-inventory"],
    queryFn: () => apiRequest<AdminStorageInventory>("/admin/storage-inventory"),
  });
  if (query.isPending) return <PageLoading label="Loading storage inventory…" />;
  if (query.isError) return <AdminPageState title="Storage inventory could not load" error={query.error} retry={() => void query.refetch()} />;
  const inventory = query.data;

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">OPERATIONS</span><h1>Storage inventory</h1><p>Ready file records, usage by account and MIME type. This does not inspect file contents or live object-storage health.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Audited metadata view</span>
    </header>
    <section className="admin-stat-grid" aria-label="Storage summary">
      <StatCard label="Ready files" value={formatNumber(inventory.summary.readyFileCount)} detail="Files with READY status" icon={FileStack} />
      <StatCard label="Recorded file data" value={formatBytes(inventory.summary.readyBytes)} detail="Database-reported file sizes" icon={HardDrive} tone="navy" />
      <StatCard label="File types" value={formatNumber(inventory.mimeTypes.length)} detail="Distinct MIME types recorded" icon={FileText} tone="gold" />
      <StatCard label="Largest account samples" value={`${inventory.largestUsers.length + inventory.largestWorkspaces.length}`} detail="Up to 10 users and 10 workspaces" icon={Users} />
    </section>
    <div className="admin-overview-grid">
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">FILE UPLOADERS</span><h2>Largest uploader accounts</h2></div></div>
        {inventory.largestUsers.length ? <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Account</th><th>Ready files</th><th>Uploaded file data</th></tr></thead>
          <tbody>{inventory.largestUsers.map((entry) => <tr key={entry.userId}>
            <td>{canViewUsers(role) ? <Link className="admin-table-entity-link" to={`/admin/users/${entry.userId}`}><strong>{entry.name}</strong></Link> : <strong>{entry.name}</strong>}<small>{entry.email}</small></td>
            <td>{formatNumber(entry.readyFileCount)}</td><td><strong>{formatBytes(entry.usedBytes)}</strong></td>
          </tr>)}</tbody>
        </table></div> : <div className="admin-empty-state"><Users size={20} /><strong>No ready files recorded</strong><span>Usage appears when ready files exist.</span></div>}
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">BUSINESS USAGE</span><h2>Largest workspaces</h2></div></div>
        {inventory.largestWorkspaces.length ? <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Workspace and owner</th><th>Ready files</th><th>Recorded usage</th></tr></thead>
          <tbody>{inventory.largestWorkspaces.map((entry) => <tr key={entry.workspaceId}>
            <td>{canViewBusinesses(role) ? <Link className="admin-table-entity-link" to={`/admin/businesses/${entry.workspaceId}`}><strong>{entry.name}</strong></Link> : <strong>{entry.name}</strong>}<small>{entry.owner.name} · {entry.owner.email}</small></td>
            <td>{formatNumber(entry.readyFileCount)}</td><td><strong>{formatBytes(entry.usedBytes)}</strong></td>
          </tr>)}</tbody>
        </table></div> : <div className="admin-empty-state"><Building2 size={20} /><strong>No workspace files recorded</strong><span>Workspace usage appears when ready files exist.</span></div>}
      </section>
    </div>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">FILE TYPES</span><h2>Ready files by MIME type</h2></div><span className="admin-readonly-chip"><ShieldCheck size={13} /> No filenames returned</span></div>
      {inventory.mimeTypes.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>MIME type</th><th>File count</th><th>Recorded usage</th></tr></thead>
        <tbody>{inventory.mimeTypes.map((entry) => <tr key={entry.mimeType}><td><code className="admin-action-code">{entry.mimeType}</code></td><td>{formatNumber(entry.readyFileCount)}</td><td><strong>{formatBytes(entry.usedBytes)}</strong></td></tr>)}</tbody>
      </table></div> : <div className="admin-empty-state"><FileText size={20} /><strong>No file types recorded</strong><span>There are no ready file records to classify.</span></div>}
      <p className="admin-panel-note">Failed uploads, backup state and object-store capacity are not represented in the current data model.</p>
      <p className="admin-panel-note">Uploader totals may include workspace and event files, so they can overlap workspace totals and do not represent personal quota usage.</p>
    </section>
  </div>;
}

function AdminUploadMonitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q")?.trim() ?? "";
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (q) params.set("q", q);
  const query = useQuery({
    queryKey: ["admin-upload-monitoring", page, q],
    queryFn: () => apiRequest<AdminUploadMonitoring>(`/admin/upload-monitoring?${params.toString()}`),
  });
  if (query.isPending) return <PageLoading label="Loading upload operations…" />;
  if (query.isError) return <AdminPageState title="Upload monitoring could not load" error={query.error} retry={() => void query.refetch()} />;
  const metrics = query.data;
  function search(term: string) {
    const next = new URLSearchParams();
    if (term) next.set("q", term);
    setSearchParams(next);
  }
  function changePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setSearchParams(next);
  }

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">OPERATIONS</span><h1>Upload monitoring</h1><p>Recent file uploads, uploader accounts, current upload states, and file-type aggregates from persisted records.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Metadata only</span>
    </header>
    <section className="admin-stat-grid" aria-label="Upload operations summary">
      <StatCard label="Ready files" value={formatNumber(metrics.totals.readyFiles)} detail={formatBytes(metrics.totals.readyBytes)} icon={FileStack} />
      <StatCard label="Scan uploads" value={formatNumber(metrics.totals.scanUploads)} detail="Completed scan-to-upload records" icon={FileText} tone="navy" />
      <StatCard label="In progress" value={formatNumber(metrics.byStatus.UPLOADING)} detail="Upload reservations not yet finalized" icon={RotateCcw} tone="gold" />
      <StatCard label="Stale processing" value={formatNumber(metrics.totals.staleProcessingRecords)} detail="Upload/delete records older than one hour" icon={CircleAlert} />
    </section>
    <div className="admin-overview-grid">
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">CURRENT RECORDS</span><h2>File lifecycle status</h2></div></div>
        <div className="admin-plan-list">
          {Object.entries(metrics.byStatus).map(([status, count]) => <div className="admin-plan-row" key={status}>
            <div className="admin-plan-meta"><span>{status}</span><strong>{formatNumber(count)}</strong></div>
          </div>)}
        </div>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">UPLOAD SOURCES</span><h2>Recorded file origins</h2></div></div>
        <div className="admin-plan-list">
          {Object.entries(metrics.bySource).map(([source, count]) => <div className="admin-plan-row" key={source}>
            <div className="admin-plan-meta"><span>{source.replace("_", " ")}</span><strong>{formatNumber(count)}</strong></div>
          </div>)}
        </div>
      </section>
    </div>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">READY FILES</span><h2>Uploads by file type</h2></div></div>
      {metrics.mimeTypes.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>MIME type</th><th>Ready files</th><th>Recorded data</th></tr></thead>
        <tbody>{metrics.mimeTypes.map((row) => <tr key={row.mimeType}>
          <td><code className="admin-action-code">{row.mimeType}</code></td>
          <td>{formatNumber(row.readyFileCount)}</td>
          <td><strong>{formatBytes(row.readyBytes)}</strong></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty-state"><FileText size={20} /><strong>No ready uploads</strong><span>File types will appear after files are uploaded.</span></div>}
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">UPLOAD LOG</span><h2>Recent uploads</h2></div></div>
      <form className="admin-search-form" onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        search(String(data.get("search") ?? "").trim());
      }}>
        <label className="admin-search-field"><Search size={16} /><input name="search" defaultValue={q} placeholder="Search filename, uploader, workspace, or event" /><button type="submit">Search</button></label>
      </form>
      {metrics.uploads.items.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>File</th><th>Uploader</th><th>Workspace / event</th><th>Source</th><th>Status</th><th>Size</th><th>Uploaded</th></tr></thead>
        <tbody>{metrics.uploads.items.map((upload) => <tr key={upload.id}>
          <td><strong>{upload.originalName}</strong><br /><small>{upload.mimeType}</small></td>
          <td>{upload.uploader ? <><strong>{upload.uploader.name}</strong><br /><small>{upload.uploader.email}</small></> : "Guest (identity not recorded)"}</td>
          <td>{upload.workspace?.name ?? upload.event?.name ?? "Personal"}</td>
          <td>{upload.uploadSource.replace("_", " ")}</td>
          <td>{upload.status}</td>
          <td>{formatBytes(upload.sizeBytes)}</td>
          <td>{formatDate(upload.createdAt)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty-state"><FileStack size={20} /><strong>No matching uploads</strong><span>Try a different filename, uploader, workspace, or event.</span></div>}
      <AdminPagination page={metrics.uploads.page} onChange={changePage} />
      <p className="admin-panel-note">Event-gallery uploads are anonymous in the current data model, so their guest uploader identity is not recorded. This log shows available file metadata only.</p>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">NOT INTEGRATED</span><h2>Unavailable operational signals</h2></div></div>
      <ul className="admin-unavailable-list">{metrics.notTracked.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="admin-panel-note">These signals are not represented in IMARA's current upload and processing records; no estimates are shown.</p>
    </section>
  </div>;
}

function AdminSystemHealth() {
  const query = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: () => apiRequest<AdminSystemHealth>("/admin/system-health"),
    refetchInterval: 60_000,
  });
  if (query.isPending) return <PageLoading label="Checking platform services…" />;
  if (query.isError) return <AdminPageState title="Platform health could not load" error={query.error} retry={() => void query.refetch()} />;
  const health = query.data;
  const checks = [
    { name: "Database", status: health.checks.database, detail: "Read-only connectivity probe" },
    { name: "Object storage", status: health.checks.objectStorage.status, detail: health.checks.objectStorage.driver },
    { name: "SMTP email", status: health.checks.email, detail: "Connection verification; credentials are not exposed" },
  ];

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">PLATFORM OPERATIONS</span><h1>System health</h1><p>Live database, object-storage and SMTP checks. No secret values are returned.</p></div>
      <span className={`admin-health-chip ${health.status === "healthy" ? "is-healthy" : "is-degraded"}`}>{health.status}</span>
    </header>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">SERVICE CHECKS</span><h2>Connected services</h2></div><button className="admin-button admin-button-secondary" type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? "Checking…" : "Refresh"}</button></div>
      <div className="admin-health-list">{checks.map((check) => <article className="admin-health-row" key={check.name}>
        <div><strong>{check.name}</strong><small>{check.detail}</small></div>
        <span className={`admin-health-chip ${check.status === "healthy" ? "is-healthy" : check.status === "unavailable" ? "is-degraded" : "is-unknown"}`}>{check.status}</span>
      </article>)}</div>
      <p className="admin-panel-note">Last checked {formatDate(health.checkedAt)}. A status of not configured means the integration is not configured in the API environment.</p>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">NOT CONNECTED</span><h2>Unavailable services</h2></div></div>
      <ul className="admin-unavailable-list">
        <li>Backups: {health.integrations.backups}</li>
        <li>OCR processing: {health.integrations.OCR}</li>
        <li>Malware scanning: {health.integrations.malwareScanning}</li>
      </ul>
      <p className="admin-panel-note">IMARA does not currently have these provider integrations or persisted health signals; the dashboard does not estimate their status.</p>
    </section>
  </div>;
}

function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: () => apiRequest<PageResult<AdminAnnouncement>>("/admin/announcements?page=1&pageSize=50"),
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AdminAnnouncement["audience"]>("ALL");
  const [target, setTarget] = useState<AdminAnnouncement["target"]>("AUDIENCE");
  const [signupWindowMinutes, setSignupWindowMinutes] = useState(1440);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<AdminAnnouncementRecipient[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedRecipientSearch(recipientSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [recipientSearch]);
  useEffect(() => {
    setPreviewOpen(false);
  }, [audience, target, signupWindowMinutes, selectedRecipients]);
  const recipientQuery = useQuery({
    queryKey: ["admin-announcement-recipients", target, audience, signupWindowMinutes, debouncedRecipientSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: target === "SELECTED" ? "20" : "1" });
      if (target === "AUDIENCE") params.set("audience", audience);
      if (target === "SIGNUP_WINDOW") params.set("createdWithinMinutes", String(signupWindowMinutes));
      if (target === "SELECTED") params.set("q", debouncedRecipientSearch);
      return apiRequest<PageResult<AdminAnnouncementRecipient>>(`/admin/announcements/recipients?${params.toString()}`);
    },
    enabled: target !== "SELECTED" || debouncedRecipientSearch.length >= 2,
  });
  const selectedRecipientIds = new Set(selectedRecipients.map((recipient) => recipient.id));
  const recipientCount = target === "SELECTED"
    ? selectedRecipients.length
    : recipientQuery.data?.page.totalItems ?? 0;
  const recipientSearchPending = target === "SELECTED"
    && recipientSearch.trim() !== debouncedRecipientSearch;
  const recipientFilterLoading = target === "SELECTED"
    ? recipientSearchPending || (debouncedRecipientSearch.length >= 2 && recipientQuery.isFetching)
    : recipientQuery.isFetching;
  const canPreview = target === "SELECTED"
    ? selectedRecipients.length > 0
    : Boolean(recipientQuery.data && !recipientQuery.isError);
  const sendAnnouncement = useMutation({
    mutationFn: () => apiRequest<AdminAnnouncement>("/admin/announcements", {
      method: "POST",
      body: JSON.stringify({
        title,
        body,
        audience: target === "AUDIENCE" ? audience : "ALL",
        target,
        ...(target === "SIGNUP_WINDOW" ? { signupWindowMinutes } : {}),
        ...(target === "SELECTED" ? { userIds: selectedRecipients.map(({ id }) => id) } : {}),
        emailEnabled,
      }),
    }),
    onSuccess: async (created) => {
      setTitle("");
      setBody("");
      setSelectedRecipients([]);
      setRecipientSearch("");
      setDebouncedRecipientSearch("");
      setPreviewOpen(false);
      setActionError("");
      setNotice(`Announcement queued for ${formatNumber(created.recipientCount)} active accounts.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (error) => {
      setNotice("");
      setActionError(error instanceof Error ? error.message : "The announcement could not be queued.");
    },
  });
  const retryEmail = useMutation({
    mutationFn: (id: string) => apiRequest<{ queuedRecipientCount: number }>(`/admin/announcements/${encodeURIComponent(id)}/retry-email`, { method: "POST" }),
    onSuccess: async ({ queuedRecipientCount }) => {
      setNotice(`Queued ${formatNumber(queuedRecipientCount)} failed email deliveries for retry.`);
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: (error) => {
      setNotice("");
      setActionError(error instanceof Error ? error.message : "Failed email deliveries could not be retried.");
    },
  });
  if (query.isPending) return <PageLoading label="Loading announcement history…" />;
  if (query.isError) return <AdminPageState title="Announcements could not load" error={query.error} retry={() => void query.refetch()} />;
  const announcements = query.data.items;
  const failedEmailCount = (item: AdminAnnouncement) => item.emailDelivery.FAILED ?? 0;
  const audienceLabel = (item: AdminAnnouncement) => {
    if (item.target === "SELECTED") return "Selected customers";
    if (item.target === "SIGNUP_WINDOW") {
      const minutes = item.signupWindowMinutes ?? 0;
      const duration = minutes < 60 ? `${minutes} minutes` : minutes % 1440 === 0
        ? `${minutes / 1440} days`
        : minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
      return `Signed up within ${duration}`;
    }
    return item.audience === "ALL" ? "All active customers" : `${item.audience} plan`;
  };
  const currentTargetLabel = target === "AUDIENCE"
    ? audience === "ALL" ? "All active customers" : `${audience} plan`
    : target === "SIGNUP_WINDOW"
      ? `Signed up within ${signupWindowMinutes < 60 ? `${signupWindowMinutes} minutes` : signupWindowMinutes % 1440 === 0 ? `${signupWindowMinutes / 1440} days` : `${signupWindowMinutes / 60} hours`}`
      : `${selectedRecipients.length} selected customers`;

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">CUSTOMER COMMUNICATIONS</span><h1>Announcements</h1><p>Preview and send platform updates to active customer accounts. In-app delivery is recorded immediately; SMTP emails are queued and tracked.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Audited send actions</span>
    </header>
    {notice && <p className="admin-action-notice" role="status">{notice}</p>}
    {actionError && <p className="admin-signout-error" role="alert">{actionError}</p>}
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">COMPOSE</span><h2>New announcement</h2></div><Megaphone size={18} /></div>
      <form className="admin-announcement-form" onSubmit={(event) => { event.preventDefault(); setPreviewOpen(true); }}>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <label><span>Who should receive this?</span><select value={target} onChange={(event) => {
          setTarget(event.target.value as AdminAnnouncement["target"]);
          setPreviewOpen(false);
        }}>
          <option value="AUDIENCE">Customer audience or plan</option>
          <option value="SIGNUP_WINDOW">New signups</option>
          <option value="SELECTED">Choose customers individually</option>
        </select></label>
        {target === "AUDIENCE" && <label><span>Customer audience</span><select value={audience} onChange={(event) => setAudience(event.target.value as AdminAnnouncement["audience"])}>
          <option value="ALL">All active customers</option><option value="FREE">Free plan</option><option value="PRO">Pro plan</option><option value="BUSINESS">Business plan</option>
        </select></label>}
        {target === "SIGNUP_WINDOW" && <label><span>Signed up within</span><select value={signupWindowMinutes} onChange={(event) => setSignupWindowMinutes(Number(event.target.value))}>
          <option value={30}>Last 30 minutes</option>
          <option value={60}>Last hour</option>
          <option value={1440}>Last 24 hours</option>
          <option value={10080}>Last 7 days</option>
          <option value={43200}>Last 30 days</option>
        </select></label>}
        {target === "SELECTED" && <div className="admin-recipient-picker">
          <label className="admin-recipient-search"><span>Find a customer</span><div><Search size={14} /><input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search by name or email" autoComplete="off" /></div></label>
          {selectedRecipients.length > 0 && <div className="admin-selected-recipients" aria-live="polite">
            <strong>{selectedRecipients.length} selected</strong>
            {selectedRecipients.map((recipient) => <button key={recipient.id} type="button" onClick={() => setSelectedRecipients((current) => current.filter(({ id }) => id !== recipient.id))} aria-label={`Remove ${recipient.name}`}>
              {recipient.name}<span aria-hidden="true">×</span>
            </button>)}
          </div>}
          {debouncedRecipientSearch.length < 2
            ? <p className="admin-recipient-hint">Enter at least two characters to find active customers.</p>
            : recipientQuery.isError
              ? <p className="admin-signout-error" role="alert">{recipientQuery.error instanceof Error ? recipientQuery.error.message : "Customers could not be loaded."}</p>
              : recipientFilterLoading
                ? <p className="admin-recipient-hint">Searching active customers…</p>
                : recipientQuery.data?.items.length
                  ? <div className="admin-recipient-results" aria-label="Customer search results">
                    {recipientQuery.data.items.map((recipient) => {
                      const checked = selectedRecipientIds.has(recipient.id);
                      return <label className="admin-recipient-option" key={recipient.id}>
                        <input type="checkbox" checked={checked} onChange={(event) => setSelectedRecipients((current) =>
                          event.target.checked
                            ? [...current, recipient]
                            : current.filter(({ id }) => id !== recipient.id))}
                          disabled={!checked && selectedRecipients.length >= 500} />
                        <span><strong>{recipient.name}</strong><small>{recipient.email}</small></span>
                        <time dateTime={recipient.createdAt}>{formatDate(recipient.createdAt)}</time>
                      </label>;
                    })}
                    {selectedRecipients.length >= 500 && <small className="admin-recipient-hint">The maximum of 500 recipients has been reached.</small>}
                    {recipientQuery.data.page.totalItems > recipientQuery.data.items.length && <small className="admin-recipient-hint">Showing the first {recipientQuery.data.items.length} matches. Refine your search to find a specific customer.</small>}
                  </div>
                  : <p className="admin-recipient-hint">No active customers match that search.</p>}
        </div>}
        {target !== "SELECTED" && <div className="admin-recipient-count" aria-live="polite">
          <Users size={15} />
          {recipientFilterLoading ? <span>Counting eligible customers…</span>
            : recipientQuery.isError ? <span role="alert">Recipient count is unavailable. Try again before previewing.</span>
              : <span><strong>{formatNumber(recipientCount)}</strong> active customer{recipientCount === 1 ? "" : "s"} match this filter.</span>}
        </div>}
        <label className="admin-announcement-body"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={6} required /></label>
        <label className="admin-checkbox-label"><input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} /><span>Also email recipients using configured SMTP</span></label>
        {emailEnabled && <p className="admin-panel-note">Email delivery is asynchronous. Status and failed deliveries are tracked below; SMTP must be configured on the API.</p>}
        <button className="admin-button admin-button-primary" type="submit" disabled={!canPreview || recipientFilterLoading || recipientCount === 0}>
          <Mail size={14} /> Preview {recipientCount ? `${formatNumber(recipientCount)} recipient${recipientCount === 1 ? "" : "s"}` : "announcement"}
        </button>
      </form>
      {previewOpen && <div className="admin-announcement-preview" aria-label="Announcement preview">
        <span className="admin-eyebrow">PREVIEW · {currentTargetLabel.toUpperCase()}</span>
        <h3>{title}</h3>
        <p>{body}</p>
        <p className="admin-panel-note">Recipients: {formatNumber(recipientCount)} active customer{recipientCount === 1 ? "" : "s"}. Delivery: in-app{emailEnabled ? " and email" : ""}.</p>
        <div className="admin-form-actions">
          <button type="button" className="admin-button admin-button-secondary" onClick={() => setPreviewOpen(false)}>Continue editing</button>
          <button type="button" className="admin-button admin-button-primary" disabled={sendAnnouncement.isPending || recipientCount === 0} onClick={() => sendAnnouncement.mutate()}>
            {sendAnnouncement.isPending ? "Queueing…" : "Send announcement"}
          </button>
        </div>
      </div>}
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">DELIVERY HISTORY</span><h2>Sent announcements</h2></div></div>
      {!announcements.length ? <div className="admin-empty-state"><Megaphone size={20} /><strong>No announcements yet</strong><span>Confirmed announcements and their delivery status will appear here.</span></div> : (
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Announcement</th><th>Target</th><th>Recipients</th><th>Email delivery</th><th>Created</th><th /></tr></thead>
          <tbody>{announcements.map((item) => <tr key={item.id}>
            <td><strong>{item.title}</strong><small>{item.body.slice(0, 100)}{item.body.length > 100 ? "…" : ""}</small></td>
            <td>{audienceLabel(item)}</td><td>{formatNumber(item.recipientCount)}</td>
            <td>{item.emailEnabled ? <span>{formatNumber(item.emailDelivery.SENT ?? 0)} sent · {formatNumber(item.emailDelivery.PENDING ?? 0)} pending · {formatNumber(failedEmailCount(item))} failed</span> : "Not requested"}</td>
            <td>{formatDate(item.createdAt)}</td>
            <td>{item.emailEnabled && failedEmailCount(item) > 0 && <button className="admin-row-action" type="button" disabled={retryEmail.isPending} onClick={() => retryEmail.mutate(item.id)}>Retry failed <RotateCcw size={13} /></button>}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>
  </div>;
}

function AdminSupportTickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  const query = useQuery({
    queryKey: ["admin-support-tickets", page, q, status, priority],
    queryFn: () => apiRequest<PageResult<AdminSupportTicket>>(`/admin/support-tickets?${params.toString()}`),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ["q", "status", "priority"]) {
      const value = String(form.get(field) ?? "").trim();
      if (value) next.set(field, value);
    }
    setSearchParams(next);
  }

  if (query.isPending) return <PageLoading label="Loading support tickets…" />;
  if (query.isError) return <AdminPageState title="Support ticket queue could not load" error={query.error} retry={() => void query.refetch()} />;
  const { items, page: pagination } = query.data;
  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">CUSTOMER SUPPORT</span><h1>Support tickets</h1><p>Review customer conversations, assign a support agent, and track priority and resolution status.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Ticket access audited</span>
    </header>
    <section className="admin-panel">
      <form className="admin-events-filters" onSubmit={applyFilters}>
        <label><span>Customer or subject</span><input name="q" defaultValue={q} placeholder="Search tickets" /></label>
        <label><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="OPEN">Open</option><option value="PENDING">Pending</option><option value="RESOLVED">Resolved</option></select></label>
        <label><span>Priority</span><select name="priority" defaultValue={priority}><option value="">All priorities</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
        <button className="admin-button admin-button-primary" type="submit"><Search size={14} /> Apply</button>
      </form>
      {!items.length ? <div className="admin-empty-state"><Users size={20} /><strong>No matching tickets</strong><span>Customer requests matching these filters will appear here.</span></div> : <div className="admin-table-wrap"><table className="admin-table admin-support-table">
        <thead><tr><th>Ticket</th><th>Customer</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Updated</th><th /></tr></thead>
        <tbody>{items.map((ticket) => <tr key={ticket.id}>
          <td><strong>{ticket.subject}</strong><small>{ticket.category} · {formatNumber(ticket.messageCount)} messages</small></td>
          <td><strong>{ticket.customer.name}</strong><small>{ticket.customer.email}</small></td>
          <td>{ticket.priority}</td><td><span className={`admin-account-status ${ticket.status === "RESOLVED" ? "" : "is-active"}`}>{ticket.status}</span></td>
          <td>{ticket.assignedAdmin?.name ?? "Unassigned"}</td><td>{formatDate(ticket.updatedAt)}</td>
          <td><Link className="admin-row-action" to={`/admin/support-tickets/${ticket.id}`}>Open <ArrowRight size={13} /></Link></td>
        </tr>)}</tbody>
      </table></div>}
      <AdminPagination page={pagination} onChange={(nextPage) => {
        const next = new URLSearchParams(searchParams);
        if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
        setSearchParams(next);
      }} />
    </section>
  </div>;
}

function AdminSupportTicketDetail({ identity }: { identity: AdminIdentity }) {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AdminSupportTicketDetails["status"]>("OPEN");
  const [priority, setPriority] = useState<AdminSupportTicketDetails["priority"]>("NORMAL");
  const [assignedAdminId, setAssignedAdminId] = useState("");
  const [body, setBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const query = useQuery({
    queryKey: ["admin-support-ticket", id],
    queryFn: () => apiRequest<AdminSupportTicketDetails>(`/admin/support-tickets/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["admin-support-agents"],
    queryFn: () => apiRequest<AdminSupportAgent[]>("/admin/support-agents"),
  });
  useEffect(() => {
    if (!query.data) return;
    setStatus(query.data.status);
    setPriority(query.data.priority);
    setAssignedAdminId(query.data.assignedAdmin?.id ?? "");
  }, [query.data]);
  const updateTicket = useMutation({
    mutationFn: () => apiRequest(`/admin/support-tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, priority, assignedAdminId: assignedAdminId || null }),
    }),
    onSuccess: async () => {
      setNotice("Ticket settings saved.");
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support-ticket", id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] }),
      ]);
    },
    onError: (error) => {
      setNotice("");
      setActionError(error instanceof Error ? error.message : "Ticket settings could not be saved.");
    },
  });
  const addMessage = useMutation({
    mutationFn: () => apiRequest(`/admin/support-tickets/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, internalNote }),
    }),
    onSuccess: async () => {
      setBody("");
      setNotice(internalNote ? "Internal note added." : "Reply sent to the customer’s in-app support conversation.");
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support-ticket", id] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] }),
      ]);
    },
    onError: (error) => {
      setNotice("");
      setActionError(error instanceof Error ? error.message : "The support message could not be saved.");
    },
  });
  if (query.isPending) return <PageLoading label="Loading support conversation…" />;
  if (query.isError) return <AdminPageState title="Support ticket could not load" error={query.error} retry={() => void query.refetch()} />;
  const ticket = query.data;

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><Link className="admin-back-link" to="/admin/support-tickets">← Support tickets</Link><span className="admin-eyebrow">CUSTOMER SUPPORT</span><h1>{ticket.subject}</h1><p>{ticket.customer.name} · {ticket.customer.email} · Opened {formatDate(ticket.createdAt)}</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Conversation audited</span>
    </header>
    {notice && <p className="admin-action-notice" role="status">{notice}</p>}
    {actionError && <p className="admin-signout-error" role="alert">{actionError}</p>}
    <div className="admin-overview-grid">
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">TICKET SETTINGS</span><h2>Assignment and status</h2></div></div>
        <form className="admin-ticket-settings" onSubmit={(event) => { event.preventDefault(); updateTicket.mutate(); }}>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as AdminSupportTicketDetails["status"])}><option value="OPEN">Open</option><option value="PENDING">Pending</option><option value="RESOLVED">Resolved</option></select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as AdminSupportTicketDetails["priority"])}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          <label><span>Assigned support agent{ticket.assignedAdmin?.id === identity.id ? " (you)" : ""}</span><select value={assignedAdminId} onChange={(event) => setAssignedAdminId(event.target.value)} disabled={agentsQuery.isPending || agentsQuery.isError}>
            <option value="">Unassigned</option>{(agentsQuery.data ?? []).map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.email}</option>)}
          </select></label>
          {agentsQuery.isError && <p className="admin-panel-note" role="alert">Support agents could not load. <button className="text-button" type="button" onClick={() => void agentsQuery.refetch()}>Try again</button></p>}
          <button className="admin-button admin-button-primary" type="submit" disabled={updateTicket.isPending}>{updateTicket.isPending ? "Saving…" : "Save ticket settings"}</button>
        </form>
        <p className="admin-panel-note">Ticket created {formatDate(ticket.createdAt)} · Last updated {formatDate(ticket.updatedAt)}.</p>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">CUSTOMER PROFILE</span><h2>{ticket.customer.name}</h2></div></div>
        <dl className="admin-detail-list"><div><dt>Email</dt><dd>{ticket.customer.email}</dd></div><div><dt>Category</dt><dd>{ticket.category}</dd></div><div><dt>Priority</dt><dd>{ticket.priority}</dd></div><div><dt>Assigned</dt><dd>{ticket.assignedAdmin?.name ?? "Unassigned"}</dd></div></dl>
        <Link className="admin-button admin-button-secondary" to={`/admin/users/${ticket.customer.id}`}>View account metadata</Link>
      </section>
    </div>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">CONVERSATION</span><h2>{formatNumber(ticket.messages.length)} messages and notes</h2></div></div>
      <div className="admin-ticket-thread">{ticket.messages.map((entry) => <article className={`admin-ticket-message${entry.internalNote ? " is-internal" : ""}`} key={entry.id}>
        <div><strong>{entry.internalNote ? "Internal note" : entry.author.role === "ADMIN" ? entry.author.name : ticket.customer.name}</strong><time>{formatDate(entry.createdAt)}</time></div>
        <p>{entry.body}</p>
      </article>)}</div>
      <form className="admin-ticket-reply" onSubmit={(event) => { event.preventDefault(); addMessage.mutate(); }}>
        <label htmlFor="admin-ticket-reply">{internalNote ? "Internal note" : "Reply to customer"}</label>
        <textarea id="admin-ticket-reply" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={4} required />
        <label className="admin-checkbox-label"><input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} /><span>Internal note (hidden from customer)</span></label>
        <button className="admin-button admin-button-primary" type="submit" disabled={addMessage.isPending}>{addMessage.isPending ? "Saving…" : internalNote ? "Add internal note" : "Send reply"}</button>
      </form>
    </section>
  </div>;
}

function AdminEvents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? "";
  const gallerySetting = searchParams.get("gallerySetting") ?? "";
  const params = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (gallerySetting) params.set("gallerySetting", gallerySetting);
  const query = useQuery({
    queryKey: ["admin-events", page, q, status, gallerySetting],
    queryFn: () => apiRequest<PageResult<AdminEvent>>(`/admin/events?${params.toString()}`),
  });

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ["q", "status", "gallerySetting"]) {
      const value = String(form.get(field) ?? "").trim();
      if (value) next.set(field, value);
    }
    setSearchParams(next);
  }

  if (query.isPending) return <PageLoading label="Loading event directory…" />;
  if (query.isError) return <AdminPageState title="Event directory could not load" error={query.error} retry={() => void query.refetch()} />;
  const { items, page: pagination } = query.data;
  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">EVENT OPERATIONS</span><h1>Events and galleries</h1><p>Search event metadata, stored lifecycle status, gallery access mode and organiser. No guest media or private content is exposed.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Read only</span>
    </header>
    <section className="admin-panel">
      <form className="admin-events-filters" onSubmit={applyFilters}>
        <label><span>Event name</span><input name="q" defaultValue={q} placeholder="Search events" /></label>
        <label><span>Stored status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DELETING">Deleting</option></select></label>
        <label><span>Gallery access</span><select name="gallerySetting" defaultValue={gallerySetting}><option value="">All access settings</option><option value="PRIVATE">Private</option><option value="LINK_PUBLIC">Link access</option><option value="PASSCODE">Passcode</option></select></label>
        <button className="admin-button admin-button-primary" type="submit"><Search size={14} /> Apply</button>
      </form>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">EVENT DIRECTORY</span><h2>{countLabel(pagination.totalItems, "event")}</h2></div></div>
      {items.length ? <div className="admin-table-wrap"><table className="admin-table admin-events-table">
        <thead><tr><th>Event</th><th>Organiser</th><th>Workspace</th><th>Event date</th><th>Status</th><th>Gallery access</th></tr></thead>
        <tbody>{items.map((event) => <tr key={event.id}>
          <td><strong>{event.name}</strong><small className="admin-id">ID · {event.id}</small></td>
          <td><strong>{event.owner.name}</strong><small>{event.owner.email}</small></td>
          <td>{event.workspace?.name ?? "Personal event"}</td>
          <td>{formatDate(event.date)}</td>
          <td><span className={`admin-account-status ${event.status === "ACTIVE" ? "is-active" : "is-suspended"}`}>{event.status === "ACTIVE" ? "Active" : "Deleting"}</span></td>
          <td>{event.gallerySetting === "LINK_PUBLIC" ? "Link access" : event.gallerySetting === "PASSCODE" ? "Passcode" : "Private"}</td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty-state"><CalendarDays size={20} /><strong>No matching events</strong><span>Try changing the search or filters.</span></div>}
      <AdminPagination page={pagination} onChange={(nextPage) => {
        const next = new URLSearchParams(searchParams);
        if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
        setSearchParams(next);
      }} />
      <p className="admin-panel-note">The event schema records ACTIVE and DELETING only. Completion and cancellation are not inferred from dates.</p>
    </section>
  </div>;
}

function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      return apiRequest<AdminAnalytics>(`/admin/analytics?${params.toString()}`);
    },
  });
  if (query.isPending) return <PageLoading label="Loading verified platform analytics…" />;
  if (query.isError) return <AdminPageState title="Analytics could not load" error={query.error} retry={() => void query.refetch()} />;
  const analytics = query.data;
  const registrations = analytics.registrationsByDay;
  const maxRegistrations = Math.max(1, ...registrations.map((point) => point.count));
  const chartPoints = registrations.map((point, index) => {
    const x = registrations.length < 2 ? 360 : 18 + index * (684 / (registrations.length - 1));
    const y = 176 - point.count / maxRegistrations * 142;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const totalSubscriptions = analytics.subscriptionDistribution.reduce((total, item) => total + item.count, 0);

  function exportRegistrations() {
    const csv = ["day,registrations", ...registrations.map(({ day, count }) => `${day},${count}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `imara-registrations-${days}-days.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">GROWTH &amp; PRODUCT</span><h1>Platform analytics</h1><p>Database-backed user registrations and subscription records. Revenue, daily active users and churn are not available in connected data.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Database facts only</span>
    </header>
    <section className="admin-panel">
      <div className="admin-panel-heading admin-analytics-panel-heading">
        <div><span className="admin-eyebrow">NEW ACCOUNTS</span><h2>Registrations by day</h2></div>
        <div className="admin-range-actions" aria-label="Analytics date range">
          {[7, 30, 90].map((range) => <button key={range} type="button" className={days === range ? "is-selected" : ""} aria-pressed={days === range} onClick={() => setDays(range)}>{range} days</button>)}
          <button type="button" className="admin-export-button" onClick={exportRegistrations}><Download size={13} /> CSV</button>
        </div>
      </div>
      <div className="admin-chart-wrap">
        <svg viewBox="0 0 720 210" role="img" aria-label={`Daily registrations during the selected ${days}-day range`} preserveAspectRatio="none">
          {[34, 81, 128, 176].map((y) => <line key={y} x1="18" x2="702" y1={y} y2={y} className="admin-chart-gridline" />)}
          {registrations.length > 1 && <polyline points={chartPoints} className="admin-chart-line" />}
          {registrations.map((point, index) => {
            if (registrations.length > 40 && index % Math.ceil(registrations.length / 30) !== 0 && index !== registrations.length - 1) return null;
            const x = registrations.length < 2 ? 360 : 18 + index * (684 / (registrations.length - 1));
            const y = 176 - point.count / maxRegistrations * 142;
            return <circle key={point.day} cx={x} cy={y} r={registrations.length > 40 ? 2 : 3.5} className="admin-chart-point"><title>{point.day}: {point.count} registrations</title></circle>;
          })}
        </svg>
        <div className="admin-chart-axis"><span>{registrations[0]?.day ?? "No data"}</span><span>{registrations[registrations.length - 1]?.day ?? ""}</span></div>
      </div>
      <p className="admin-panel-note">Dates are UTC. The selected range uses an exclusive end time; the CSV contains the daily counts shown above.</p>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">SUBSCRIPTION RECORDS</span><h2>Distribution by stored plan</h2></div><span className="admin-readonly-chip">{countLabel(totalSubscriptions, "record")}</span></div>
      <div className="admin-analytics-plan-grid">
        {analytics.subscriptionDistribution.map(({ plan, count }) => <article className="admin-analytics-plan" key={plan}>
          <span className={`admin-plan-dot admin-plan-${plan.toLowerCase()}`} />
          <span><strong>{plan}</strong><small>subscription records</small></span>
          <b>{formatNumber(count)}</b>
        </article>)}
      </div>
      <p className="admin-panel-note">Plan records do not establish payment status or active subscription lifecycle.</p>
    </section>
    <section className="admin-unavailable-metrics" aria-label="Unavailable analytics">
      <strong>Not computed from current systems</strong>
      {analytics.notComputed.map((metric) => <span key={metric}>{unavailableMetricLabels[metric] ?? metric}</span>)}
    </section>
  </div>;
}

function AdminAuditLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q") ?? "";
  const action = searchParams.get("action") ?? "";
  const resourceType = searchParams.get("resourceType") ?? "";
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (q) query.set("q", q);
  if (action) query.set("action", action);
  if (resourceType) query.set("resourceType", resourceType);
  const result = useQuery({
    queryKey: ["admin-audit-logs", page, q, action, resourceType],
    queryFn: () => apiRequest<PageResult<AdminAuditRecord>>(`/admin/audit-logs?${query.toString()}`),
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ["q", "action", "resourceType"]) {
      const value = String(form.get(field) ?? "").trim();
      if (value) next.set(field, value);
    }
    setSearchParams(next);
  }

  if (result.isPending) return <PageLoading label="Loading security audit history…" />;
  if (result.isError) return <AdminPageState title="Audit history could not load" error={result.error} retry={() => void result.refetch()} />;
  const { items, page: pagination } = result.data;
  return <div className="admin-page-content">
    <header className="admin-page-heading">
      <div><span className="admin-eyebrow">SECURITY &amp; GOVERNANCE</span><h1>Platform audit log</h1><p>Records of administrator access to the first-stage overview and directories.</p></div>
      <span className="admin-readonly-chip"><ShieldCheck size={13} /> Security role required</span>
    </header>
    <section className="admin-panel">
      <form className="admin-audit-filters" onSubmit={submitSearch}>
        <label><span>Search actor, action, or resource</span><input name="q" defaultValue={q} placeholder="Search audit records" /></label>
        <label><span>Action</span><input name="action" defaultValue={action} placeholder="e.g. admin.users.read" /></label>
        <label><span>Resource type</span><input name="resourceType" defaultValue={resourceType} placeholder="e.g. user" /></label>
        <button className="admin-button admin-button-primary" type="submit"><Search size={15} /> Apply filters</button>
      </form>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">ACCESS RECORDS</span><h2>{countLabel(pagination.totalItems, "entry", "entries")}</h2></div></div>
      {items.length === 0 ? <div className="admin-empty-state"><Activity size={20} /><strong>No audit entries match</strong><span>Admin reads are recorded before the requested data is returned.</span></div> : <div className="admin-table-wrap"><table className="admin-table admin-audit-table">
        <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Resource</th><th>Origin</th></tr></thead>
        <tbody>{items.map((entry) => <tr key={entry.id}>
          <td>{formatDate(entry.createdAt)}</td>
          <td><strong>{entry.actor?.name ?? "Deleted account"}</strong><small>{entry.actor?.email ?? entry.actorId ?? "Unknown actor"}</small></td>
          <td><span className="admin-action-code">{entry.action}</span></td>
          <td><span>{entry.resourceType}</span><small>{entry.resourceId ?? "Platform-wide"}</small></td>
          <td><span>{entry.ipAddress ?? "Not recorded"}</span><small title={entry.userAgent ?? undefined}>{entry.userAgent ?? "No user agent"}</small></td>
        </tr>)}</tbody>
      </table></div>}
      <AdminPagination page={pagination} onChange={(nextPage) => {
        const next = new URLSearchParams(searchParams);
        if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
        setSearchParams(next);
      }} />
    </section>
  </div>;
}

export function AdminDashboard({ identity, onSignOut, signingOut, signOutError }: {
  identity: AdminIdentity;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError?: string;
}) {
  const role = identity.platformAdminRole;
  const links = [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, visible: true, end: true },
    { to: "/admin/users", label: "All users", icon: Users, visible: canViewUsers(role) },
    { to: "/admin/businesses", label: "Businesses", icon: Building2, visible: canViewBusinesses(role) },
    { to: "/admin/storage", label: "Storage", icon: Database, visible: canViewStorage(role) },
    { to: "/admin/uploads", label: "Uploads", icon: FileStack, visible: canViewUploadMonitoring(role) },
    { to: "/admin/system-health", label: "System health", icon: Activity, visible: canViewUploadMonitoring(role) },
    { to: "/admin/events", label: "Events", icon: CalendarDays, visible: canViewEvents(role) },
    { to: "/admin/announcements", label: "Announcements", icon: Megaphone, visible: canManageAnnouncements(role) },
    { to: "/admin/support-tickets", label: "Support tickets", icon: LifeBuoy, visible: canViewSupportTickets(role) },
    { to: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumnIncreasing, visible: canViewAnalytics(role) },
    { to: "/admin/audit-logs", label: "Audit log", icon: Activity, visible: canViewAudit(role) },
    { to: "/admin/plans", label: "Plan catalogue", icon: CreditCard, visible: canViewBilling(role) },
    { to: "/admin/subscriptions", label: "Subscriptions", icon: Users, visible: canViewBilling(role) },
    { to: "/admin/payments", label: "Payments & revenue", icon: Banknote, visible: canViewBilling(role) },
    { to: "/admin/settings", label: "Settings & access", icon: Settings, visible: canManagePlatformAdmins(role) },
    { to: "/admin/roles", label: "Admin roles", icon: ShieldCheck, visible: canManagePlatformAdmins(role) },
  ].filter((item) => item.visible);

  return (
    <main className="admin-dashboard">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand-lockup"><BrandMark /><BrandWordmark /> <i>ADMIN</i></Link>
        <div className="admin-sidebar-label">PLATFORM</div>
        <nav className="admin-side-nav" aria-label="Platform administration">
          {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-side-link${isActive ? " is-active" : ""}`}>
            <Icon size={17} /><span>{label}</span>{label === "Overview" && <ArrowDownRight className="admin-side-arrow" size={14} />}
          </NavLink>)}
        </nav>
        <div className="admin-sidebar-note"><ShieldCheck size={16} /><span>Every platform data view is checked by the API against your administrator role.</span></div>
        <Link to="/" className="admin-back-public">← Visit public website</Link>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-topbar-caption">PLATFORM ADMINISTRATION</span><strong>IMARA control room</strong></div>
          <div className="admin-user-chip">
            <span className="admin-user-avatar">{identity.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
            <span><strong>{identity.name}</strong><small>{roleLabels[role]}</small></span>
            <button type="button" onClick={onSignOut} disabled={signingOut} aria-label="Sign out of admin dashboard" title="Sign out"><LogOut size={16} /></button>
          </div>
        </header>
        {signOutError && <p className="admin-signout-error" role="alert">{signOutError}</p>}
        <div className="admin-main-content">
          <Routes>
            <Route index element={<AdminOverview canReadUsers={canViewUsers(role)} canReadStorage={canViewStorage(role)} canReadEvents={canViewEvents(role)} canReadAnalytics={canViewAnalytics(role)} />} />
            <Route path="users" element={canViewUsers(role) ? <AdminUsers /> : <AdminRouteBlocked />} />
            <Route path="users/:id" element={canViewUsers(role) ? <AdminUserDetail role={role} /> : <AdminRouteBlocked />} />
            <Route path="businesses" element={canViewBusinesses(role) ? <AdminBusinesses /> : <AdminRouteBlocked />} />
            <Route path="businesses/:id" element={canViewBusinesses(role) ? <AdminBusinessDetail role={role} /> : <AdminRouteBlocked />} />
            <Route path="storage" element={canViewStorage(role) ? <AdminStorageInventory role={role} /> : <AdminRouteBlocked />} />
            <Route path="uploads" element={canViewUploadMonitoring(role) ? <AdminUploadMonitoring /> : <AdminRouteBlocked />} />
            <Route path="system-health" element={canViewUploadMonitoring(role) ? <AdminSystemHealth /> : <AdminRouteBlocked />} />
            <Route path="announcements" element={canManageAnnouncements(role) ? <AdminAnnouncements /> : <AdminRouteBlocked />} />
            <Route path="support-tickets" element={canViewSupportTickets(role) ? <AdminSupportTickets /> : <AdminRouteBlocked />} />
            <Route path="support-tickets/:id" element={canViewSupportTickets(role) ? <AdminSupportTicketDetail identity={identity} /> : <AdminRouteBlocked />} />
            <Route path="events" element={canViewEvents(role) ? <AdminEvents /> : <AdminRouteBlocked />} />
            <Route path="analytics" element={canViewAnalytics(role) ? <AdminAnalytics /> : <AdminRouteBlocked />} />
            <Route path="audit-logs" element={canViewAudit(role) ? <AdminAuditLogs /> : <AdminRouteBlocked />} />
            <Route path="plans" element={canViewBilling(role) ? <PlanManagementPage /> : <AdminRouteBlocked />} />
            <Route path="subscriptions" element={canViewBilling(role) ? <SubscriptionManagementPage /> : <AdminRouteBlocked />} />
            <Route path="payments" element={canViewBilling(role) ? <PaymentManagementPage /> : <AdminRouteBlocked />} />
            <Route path="settings" element={canManagePlatformAdmins(role) ? <PlatformSettingsPage canManageRoles={canManagePlatformAdmins(role)} /> : <AdminRouteBlocked />} />
            <Route path="roles" element={canManagePlatformAdmins(role) ? <AdminRolesPage currentUserId={identity.id} /> : <AdminRouteBlocked />} />
            <Route path="*" element={<AdminRouteBlocked />} />
          </Routes>
        </div>
      </section>
    </main>
  );
}
