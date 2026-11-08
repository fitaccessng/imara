import { ArrowRight, FilePlus2, FolderPlus, Image, QrCode, ScanLine, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

const guides = [
  {
    icon: FilePlus2,
    title: "Upload a file",
    description: "Open your personal files or business workspace, choose the destination folder and upload a supported file from your device.",
  },
  {
    icon: FolderPlus,
    title: "Organise folders",
    description: "Create a folder, add subfolders and use clear names so you can find documents later with workspace search.",
  },
  {
    icon: ScanLine,
    title: "Scan pages to PDF",
    description: "Open the scanner, capture and review pages, give the PDF a name and upload it. This feature requires an eligible plan.",
  },
  {
    icon: UsersRound,
    title: "Manage a team",
    description: "Invite staff from your business workspace, assign a role and review folder permissions before adding sensitive content.",
  },
  {
    icon: QrCode,
    title: "Create an event QR",
    description: "Add the event name and date, choose gallery access, then download or print the unique guest-upload code.",
  },
  {
    icon: Image,
    title: "Collect event photos and videos",
    description: "Guests scan the event QR, capture or select media on their phone, and upload it to that event’s shared collection.",
  },
];

export function HelpCenterPage() {
  return (
    <PageShell
      eyebrow="Help centre"
      title="Get started with the tasks you came to do"
      description="Short guides for your Digital Drive, business folder access, document scanning, and QR-powered event galleries."
    >
      <div className="marketing-page">
        <div className="help-guide-grid">
          {guides.map(({ icon: Icon, title, description }) => (
            <article key={title} className="capability-card">
              <span className="capability-icon"><Icon size={20} aria-hidden="true" /></span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="help-next-steps">
          <Link to="/faq">Read common questions <ArrowRight size={15} /></Link>
          <Link to="/features">See all product features <ArrowRight size={15} /></Link>
          <Link to="/pricing">Check plan limits <ArrowRight size={15} /></Link>
        </div>
        <p className="marketing-footnote">For account-specific help, sign in and review your workspace settings. This site does not currently have a connected support ticket form.</p>
      </div>
    </PageShell>
  );
}

export default HelpCenterPage;
