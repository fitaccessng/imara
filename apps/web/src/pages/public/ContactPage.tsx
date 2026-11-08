import { ArrowRight, CircleHelp, CreditCard, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

export function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact & next steps"
      title="Find the right place to get help"
      description="Choose the resource that matches your question. We do not publish an unverified support email or offer a contact form that is not connected."
    >
      <div className="marketing-page">
        <div className="contact-options">
          <article>
            <CircleHelp size={22} />
            <h2>Product questions</h2>
            <p>Read answers about storage, scanning, editing, staff access and what is currently available.</p>
            <Link to="/faq">Browse FAQs <ArrowRight size={15} /></Link>
          </article>
          <article>
            <CreditCard size={22} />
            <h2>Plans and limits</h2>
            <p>Compare the Free, PRO and BUSINESS allowances before choosing a plan.</p>
            <Link to="/pricing">Compare plans <ArrowRight size={15} /></Link>
          </article>
          <article>
            <UserRound size={22} />
            <h2>Account access</h2>
            <p>Sign in to manage your profile, business workspace, team members and available account settings.</p>
            <Link to="/login">Sign in <ArrowRight size={15} /></Link>
          </article>
        </div>
        <p className="contact-notice" role="note">A direct support inbox and contact form are not configured on this website yet. We have not added a placeholder form that would appear to send a message but deliver nothing.</p>
      </div>
    </PageShell>
  );
}

export default ContactPage;
