import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

const questions = [
  {
    question: "How much storage does the Free plan include?",
    answer: "The Free plan includes 5GB of storage. PRO includes 15GB and BUSINESS includes 25GB. Current prices and limits are listed on the pricing page.",
  },
  {
    question: "Can I edit documents in IMARA?",
    answer: "Some supported documents can be edited on eligible paid plans. Editing availability depends on the file format; files that cannot be edited in the browser can be downloaded and changed in a compatible app.",
  },
  {
    question: "Can I scan paper documents?",
    answer: "The browser scanner can capture pages and save them as a PDF in your workspace on eligible paid plans. It does not promise automatic text recognition.",
  },
  {
    question: "How do I add staff to a business workspace?",
    answer: "A workspace owner or administrator invites staff by email, assigns a workspace role, and grants the member access to specific folders with permissions such as viewing, uploading, editing supported files, or downloading. Staff limits depend on the plan.",
  },
  {
    question: "How does the event QR gallery work?",
    answer: "An organiser creates an event with a name and date. IMARA generates a guest-upload QR code. Guests scan it to open the event camera page, capture a photo or video or choose media from their phone, then upload it to that event’s collection.",
  },
  {
    question: "Who can view the photos and videos in an event gallery?",
    answer: "The organiser can manage and view the event collection. For other viewers, the organiser chooses whether the gallery stays private, is available by link, or requires a passcode. Gallery uploads count against the event’s available storage.",
  },
  {
    question: "What happens when I reach a plan limit?",
    answer: "IMARA blocks the new action and explains the limit. Existing files, staff and events are not automatically deleted to make room.",
  },
  {
    question: "Can I share a stored file with an external link?",
    answer: "Personal-drive files do not currently have public share links. Business workspaces let owners and administrators invite teammates and grant folder-level access. Event galleries have separate private, link, or passcode viewing settings.",
  },
  {
    question: "Can I buy a subscription from this website?",
    answer: "The current site displays plan details. Online subscription checkout is not available yet, so the upgrade flow may direct you to review plans rather than complete a payment.",
  },
];

export function FAQPage() {
  return (
    <PageShell
      eyebrow="Frequently asked questions"
      title="Clear answers about files, teams and plans"
      description="Find out what IMARA supports today, how plan limits work and where to go next."
    >
      <div className="marketing-page">
        <div className="faq-list">
          {questions.map(({ question, answer }) => (
            <details key={question} className="faq-item">
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <p className="marketing-footnote">Plan limits can change. Check the <Link to="/pricing">pricing page</Link> for current details.</p>
      </div>
    </PageShell>
  );
}

export default FAQPage;
