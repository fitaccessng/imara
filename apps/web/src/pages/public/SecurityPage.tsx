import { KeyRound, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

const controls = [
  {
    icon: KeyRound,
    title: "Account sign-in",
    description: "IMARA uses account authentication and email verification to establish who is signing in.",
  },
  {
    icon: UsersRound,
    title: "Workspace roles",
    description: "Business workspaces distinguish owners, administrators, managers and staff, with different management capabilities.",
  },
  {
    icon: LockKeyhole,
    title: "Folder permissions",
    description: "Workspace administrators can grant or restrict supported actions on folders and their subfolders.",
  },
  {
    icon: ShieldCheck,
    title: "Plan-aware actions",
    description: "The service checks subscription entitlements on the server for actions such as scanning, staff invitations and storage.",
  },
];

export function SecurityPage() {
  return (
    <PageShell
      eyebrow="Security & access"
      title="Access controls built into everyday file work"
      description="IMARA provides account, workspace and folder-level controls. Configure them to match the way your organisation handles documents."
    >
      <div className="marketing-page">
        <div className="security-grid">
          {controls.map(({ icon: Icon, title, description }) => (
            <article key={title} className="capability-card">
              <span className="capability-icon"><Icon size={20} aria-hidden="true" /></span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <aside className="security-caveat">
          <strong>Know what is—and is not—being promised.</strong>
          <p>This page describes product controls, not a security certification or guarantee. It does not claim end-to-end encryption, a particular backup or retention schedule, or regulatory compliance. Review your organisation’s requirements before uploading sensitive records.</p>
        </aside>
        <Link className="marketing-secondary-link" to="/features">Explore file and team features <span aria-hidden="true">→</span></Link>
      </div>
    </PageShell>
  );
}

export default SecurityPage;
