import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import {
  AdminManagementError,
  AdminManagementHeader,
  AdminManagementLoading,
  AdminManagementPagination,
  adminDate,
  type AdminPageMetadata,
} from "./AdminManagementCommon";

type AdminRole =
  | "SUPER_ADMIN"
  | "USER_MANAGEMENT_ADMIN"
  | "FINANCE_ADMIN"
  | "SUPPORT_ADMIN"
  | "MARKETING_ADMIN"
  | "OPERATIONS_ADMIN"
  | "SECURITY_ADMIN";
type AdminStatus = "ACTIVE" | "SUSPENDED";

interface AdminProfile {
  userId: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
  user: { name: string; email: string };
}

interface RolePermission {
  role: AdminRole;
  permissions: string[];
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

function isAdminRole(value: string): value is AdminRole {
  return Object.keys(roleLabels).some((role) => role === value);
}

function isAdminStatus(value: string): value is AdminStatus {
  return value === "ACTIVE" || value === "SUSPENDED";
}

function AdminProfileRow({
  profile,
  currentUserId,
}: {
  profile: AdminProfile;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(profile.role);
  const [status, setStatus] = useState(profile.status);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setRole(profile.role);
    setStatus(profile.status);
  }, [profile.role, profile.status]);
  const update = useMutation({
    mutationFn: () => apiRequest<AdminProfile>(`/admin/platform-admins/${encodeURIComponent(profile.userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role, status }),
    }),
    onSuccess: async () => {
      setNotice("Administrator access updated and recorded in the audit log.");
      await queryClient.invalidateQueries({ queryKey: ["admin-platform-admins"] });
    },
  });
  const isSelf = profile.userId === currentUserId;

  return (
    <tr>
      <td><strong>{profile.user.name}{isSelf ? " · You" : ""}</strong><small>{profile.user.email}</small><small className="admin-id">ID · {profile.userId}</small></td>
      <td>
        <select aria-label={`Role for ${profile.user.name}`} value={role} disabled={isSelf || update.isPending} onChange={(event) => { if (isAdminRole(event.target.value)) { setRole(event.target.value); setNotice(""); update.reset(); } }}>
          {Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </td>
      <td><span className={`admin-account-status${status === "ACTIVE" ? " is-active" : " is-suspended"}`}>{status.toLowerCase()}</span></td>
      <td>{adminDate(profile.createdAt)}</td>
      <td>
        <select aria-label={`Status for ${profile.user.name}`} value={status} disabled={isSelf || update.isPending} onChange={(event) => { if (isAdminStatus(event.target.value)) { setStatus(event.target.value); setNotice(""); update.reset(); } }}>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </td>
      <td>
        <button className="admin-button admin-button-secondary" type="button" disabled={isSelf || update.isPending || (role === profile.role && status === profile.status)} onClick={() => update.mutate()}>
          <Save size={13} />{update.isPending ? "Saving…" : "Save"}
        </button>
        {isSelf && <small className="admin-inline-note">Self-access changes are blocked</small>}
        {notice && <small className="admin-inline-success" role="status">{notice}</small>}
        {update.isError && <small className="admin-inline-error" role="alert">{update.error.message}</small>}
      </td>
    </tr>
  );
}

export function AdminRolesPage({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const profiles = useQuery({
    queryKey: ["admin-platform-admins", search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (search) params.set("q", search);
      return apiRequest<{ items: AdminProfile[]; page: AdminPageMetadata }>(`/admin/platform-admins?${params}`);
    },
  });
  const permissions = useQuery({
    queryKey: ["admin-platform-admin-permissions"],
    queryFn: () => apiRequest<{ roles: RolePermission[]; availablePermissions: string[] }>("/admin/platform-admins/permissions"),
  });

  if (profiles.isPending || permissions.isPending) return <AdminManagementLoading label="Loading administrator access…" />;
  if (profiles.isError) return <AdminManagementError title="Administrator directory could not load" error={profiles.error} retry={() => void profiles.refetch()} />;
  if (permissions.isError) return <AdminManagementError title="Role permissions could not load" error={permissions.error} retry={() => void permissions.refetch()} />;

  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="SETTINGS · ACCESS CONTROL"
        title="Admin roles & permissions"
        description="Assign a fixed platform role or suspend administrator access. Every change is audited; permission sets are enforced by the API."
      />
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><span className="admin-eyebrow">ADMINISTRATORS</span><h2>{profiles.data.page.totalItems} platform admins</h2></div>
          <span className="admin-readonly-chip"><ShieldCheck size={13} /> Super Admin only</span>
        </div>
        <form className="admin-audit-filters admin-admin-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchText.trim()); setPage(1); }}>
          <label><span>Search administrators</span><input name="q" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Name or email" /></label>
          <span />
          <span />
          <button className="admin-button admin-button-secondary" type="submit">Search</button>
        </form>
        {profiles.data.items.length === 0 ? (
          <div className="admin-empty-state"><ShieldCheck size={20} /><strong>No platform admins found</strong><span>Only accounts with provisioned administrator profiles appear here.</span></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-role-table">
              <thead><tr><th>Administrator</th><th>Role</th><th>Access status</th><th>Added</th><th>Set status</th><th>Action</th></tr></thead>
              <tbody>{profiles.data.items.map((profile) => <AdminProfileRow key={profile.userId} profile={profile} currentUserId={currentUserId} />)}</tbody>
            </table>
          </div>
        )}
        <AdminManagementPagination page={profiles.data.page} onChange={setPage} />
      </section>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">PERMISSION MATRIX</span><h2>Fixed role capabilities</h2></div></div>
        <div className="admin-permission-grid">
          {permissions.data.roles.map(({ role, permissions: grants }) => (
            <article key={role}>
              <h3>{roleLabels[role]}</h3>
              <p>{grants.length} permission{grants.length === 1 ? "" : "s"}</p>
              {grants.length === permissions.data.availablePermissions.length
                ? <span className="admin-permission-all">All platform permissions</span>
                : <ul>{grants.map((permission) => <li key={permission}>{permission.replace(/^admin\./, "").replace(/\./g, " · ")}</li>)}</ul>}
            </article>
          ))}
        </div>
        <p className="admin-panel-note">Permission sets are intentionally fixed in code. Changing an administrator’s role takes effect on the next API request; suspending access blocks further platform-admin requests.</p>
      </section>
    </div>
  );
}

export default AdminRolesPage;
