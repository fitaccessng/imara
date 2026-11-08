import { Eye, Keyboard, Volume2 } from "lucide-react";
import { PageShell } from "../PageShell";

export function AccessibilityPage() {
  return (
    <PageShell
      eyebrow="Accessibility"
      title="Use IMARA with the tools that work for you"
      description="We aim to make the website easier to navigate and understand, while continuing to improve its accessibility."
    >
      <div className="marketing-page">
        <div className="accessibility-list">
          <article><Keyboard size={22} /><div><h2>Keyboard navigation</h2><p>Interactive controls can be reached with a keyboard, and focused controls receive a visible outline.</p></div></article>
          <article><Eye size={22} /><div><h2>Readable page structure</h2><p>Public pages use headings, descriptive links and text labels to make the information easier to scan.</p></div></article>
          <article><Volume2 size={22} /><div><h2>Optional read-aloud</h2><p>Marketing pages offer a user-triggered read-aloud control when your browser supports speech synthesis. It never starts automatically.</p></div></article>
        </div>
        <p className="marketing-disclaimer">Accessibility support can vary by page, browser and assistive technology. This page is not a claim of formal accessibility certification.</p>
      </div>
    </PageShell>
  );
}

export default AccessibilityPage;
