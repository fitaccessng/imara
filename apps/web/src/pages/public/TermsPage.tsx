import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

export function TermsPage() {
  return (
    <PageShell
      eyebrow="Using IMARA"
      title="Service terms overview"
      description="A plain-language description of the current product model, not a complete legal agreement."
    >
      <div className="marketing-page legal-summary">
        <section>
          <h2>Your account and content</h2>
          <p>Use an account you are authorised to access. You are responsible for choosing appropriate workspace members and permissions, and for ensuring that the content you upload may be stored and shared through the service.</p>
        </section>
        <section>
          <h2>Plans and feature access</h2>
          <p>Storage, staff, active-event, scanning and editing limits depend on the subscription plan and file support. The service may block a new action when it reaches a limit; it does not remove existing content solely to make room.</p>
        </section>
        <section>
          <h2>Current payment availability</h2>
          <p>The website presents Free, PRO and BUSINESS pricing, but online subscription checkout is not currently available. A displayed price does not mean a payment has been processed.</p>
        </section>
        <section className="legal-caveat">
          <h2>Formal terms</h2>
          <p>This summary does not contain a complete agreement covering warranties, liability, termination, dispute handling or governing law. Organisations should obtain and review the complete service terms before relying on IMARA for business-critical records.</p>
        </section>
        <p className="marketing-footnote">See the <Link to="/pricing">plan comparison</Link> for current allowances and the <Link to="/faq">FAQ</Link> for product limitations.</p>
      </div>
    </PageShell>
  );
}

export default TermsPage;
