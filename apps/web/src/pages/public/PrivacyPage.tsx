import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

export function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy information"
      title="What IMARA handles to provide the service"
      description="A plain-language overview of the account and workspace information used by IMARA. It is not a complete privacy notice."
    >
      <div className="marketing-page legal-summary">
        <section>
          <h2>Information in your account</h2>
          <p>When you register, IMARA processes account details such as your name and email address to create and authenticate your account. Email verification may be required.</p>
        </section>
        <section>
          <h2>Files and workspace activity</h2>
          <p>Files, folders, workspace memberships, role assignments and folder permissions are processed to provide storage and collaboration features. Storage use and subscription entitlements are used to apply plan limits.</p>
        </section>
        <section>
          <h2>How to manage access</h2>
          <p>Use your account and workspace controls to manage files and team access. Workspace owners and administrators should review member roles and folder permissions before placing restricted business content in a shared workspace.</p>
        </section>
        <section className="legal-caveat">
          <h2>Important details not covered here</h2>
          <p>This overview does not specify retention periods, backup schedules, processing locations, subprocessors or a complete data-rights process. Do not treat it as a substitute for a full privacy notice or your organisation’s review before uploading sensitive records.</p>
        </section>
        <p className="marketing-footnote">For product access controls, see <Link to="/security">Security &amp; access</Link>. For the current product scope, see <Link to="/features">Features</Link>.</p>
      </div>
    </PageShell>
  );
}

export default PrivacyPage;
