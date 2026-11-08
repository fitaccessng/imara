import { FolderOpen, Image, QrCode, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";
import { ReadAloudButton } from "./MarketingContent";

export function AboutPage() {
  return (
    <PageShell
      eyebrow="About IMARA"
      title="A practical home for business files and event memories"
      description="Use IMARA to organise files in a Digital Drive, share business folders with teammates, and collect photos and videos through event QR galleries."
    >
      <div className="marketing-page">
        <div className="about-lead">
          <p>IMARA supports two distinct kinds of work. Keep your everyday documents in folders and manage access for invited business teammates. For an event, create a QR code that lets guests contribute the photos and videos they capture on their own phones.</p>
          <ReadAloudButton text="IMARA includes a Digital Drive for uploading, organising, searching, viewing and downloading files. Business workspaces let owners invite teammates and control folder permissions. Event organisers can create a QR code that opens a guest camera page, where attendees upload photos and videos to a shared event collection." />
        </div>
        <div className="about-pillars">
          <article><FolderOpen size={22} /><h2>Digital Drive</h2><p>Upload files, build nested folders, search, preview supported documents and download them when needed.</p></article>
          <article><UsersRound size={22} /><h2>Team folder access</h2><p>Invite workspace members and decide which folders they can see and what actions they can take.</p></article>
          <article><QrCode size={22} /><h2>Event QR codes</h2><p>Create an event with its date and gallery privacy, then download or print its guest-upload code.</p></article>
          <article><Image size={22} /><h2>Shared event galleries</h2><p>Let guests upload the photos and videos they take, then revisit the collected media in the event gallery.</p></article>
        </div>
        <p className="marketing-disclaimer">Feature access varies by plan and file type. Review the current <Link to="/features">feature details</Link> and <Link to="/pricing">plan comparison</Link> before choosing a workflow.</p>
      </div>
    </PageShell>
  );
}

export default AboutPage;
