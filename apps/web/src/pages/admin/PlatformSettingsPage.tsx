import { ArrowRight, CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminManagementHeader } from "./AdminManagementCommon";

export function PlatformSettingsPage({ canManageRoles }: { canManageRoles: boolean }) {
  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="PLATFORM · CONFIGURATION"
        title="Settings & access"
        description="Manage the persisted plan catalogue and administrator access policies from their audited control pages."
      />
      <div className="admin-settings-grid">
        <section className="admin-panel">
          <div className="admin-settings-icon"><CreditCard size={19} /></div>
          <span className="admin-eyebrow">BILLING</span>
          <h2>Plan catalogue</h2>
          <p>Update monthly pricing, storage allowances, and product entitlements. Storage changes are synchronized to existing subscriptions and owned workspaces.</p>
          <Link className="admin-button admin-button-secondary" to="/admin/plans">Manage plans <ArrowRight size={14} /></Link>
        </section>
        <section className="admin-panel">
          <div className="admin-settings-icon"><ShieldCheck size={19} /></div>
          <span className="admin-eyebrow">ACCESS CONTROL</span>
          <h2>Administrator roles</h2>
          <p>Review the permission matrix and assign approved roles or suspend administrator profiles. Access changes are recorded in the platform audit log.</p>
          {canManageRoles
            ? <Link className="admin-button admin-button-secondary" to="/admin/roles">Manage access <ArrowRight size={14} /></Link>
            : <span className="admin-readonly-chip"><ShieldCheck size={13} /> Super Admin access required</span>}
        </section>
      </div>
      <p className="admin-data-footnote"><ShieldCheck size={14} /> Payment credentials and service endpoints remain deployment configuration; they are not editable from the admin interface.</p>
    </div>
  );
}

export default PlatformSettingsPage;
