import { useState } from "react";
import {
  ArrowUpRight,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileSignature,
  FileText,
  FolderOpen,
  HelpCircle,
  KeyRound,
  MessageCircle,
  Search,
  ScanLine,
  ShieldCheck,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";
import "./docs.css";

interface DocGroup {
  title: string;
  icon: LucideIcon;
  points: string[];
}

interface DocSection {
  id: string;
  number: string;
  title: string;
  intro: string;
  groups: DocGroup[];
  note?: string;
}

const sections: DocSection[] = [
  {
    id: "getting-started",
    number: "01",
    title: "Getting started",
    intro:
      "IMARA brings personal file organization, business collaboration and event media collection together in one account.",
    groups: [
      {
        title: "Create and secure your account",
        icon: KeyRound,
        points: [
          "Register with your name, email address and password, then complete email verification when prompted.",
          "Use the sign-in page to access your account. If you forget your password, request a reset link from Forgot password.",
          "Use Account settings to review your profile and available account controls. Sign out when you finish on a shared device.",
        ],
      },
      {
        title: "Choose the right workspace",
        icon: FolderOpen,
        points: [
          "Your personal area is for your own files and folders.",
          "A business workspace is a separate shared space. Create one or accept a teammate’s invitation before opening its files and team tools.",
          "Use the sidebar to move between Overview, files, events, account settings and, once set up, business workspace tools.",
        ],
      },
    ],
  },
  {
    id: "digital-drive",
    number: "02",
    title: "Digital Drive & file tools",
    intro:
      "Store documents in folders, find them by name, and use the file actions available for each item and plan.",
    groups: [
      {
        title: "Upload and organize",
        icon: FolderOpen,
        points: [
          "Upload supported files from your device to your personal files or to an accessible business workspace folder.",
          "Create folders and nested subfolders to reflect projects, teams or filing needs.",
          "Open a folder to view its contents. In business workspaces, the actions available to you depend on your role and folder permissions.",
        ],
      },
      {
        title: "Find, review and edit files",
        icon: Search,
        points: [
          "Search by file or folder name to locate stored items.",
          "Preview supported file formats in the browser and download a copy when you need to use another application.",
          "Edit supported document formats on eligible paid plans. Editing is format-dependent; an unsupported file can still be downloaded and opened in a compatible application.",
        ],
      },
      {
        title: "Favourites and Recycle Bin",
        icon: Star,
        points: [
          "Mark a file or folder as a favourite to find it again in Favourites; remove the mark whenever you like.",
          "Deleted files move to the Recycle Bin, where you can restore them or permanently delete them.",
          "A permanent deletion cannot be undone. Review the selected file before confirming that action.",
        ],
      },
    ],
  },
  {
    id: "document-scanner",
    number: "03",
    title: "Document scanner",
    intro:
      "Turn paper pages or page images into a PDF from the browser, then save the finished document to your files.",
    groups: [
      {
        title: "Capture and prepare pages",
        icon: ScanLine,
        points: [
          "Open the scanner and capture pages with a device camera or add supported images from your device.",
          "Review and reorder pages, and use the available page tools to prepare a readable document.",
          "A scan can contain up to 100 pages. The PDF upload limit is 25 MB; reduce the page count or use smaller images if the file exceeds it.",
        ],
      },
      {
        title: "Preview and save",
        icon: FileText,
        points: [
          "Preview the assembled PDF, choose a name and save it to My Files or a selected folder.",
          "An unfinished scan draft is kept in this browser on this device while you move around the app. Clear it when you no longer need it.",
          "Scan-to-upload is included on eligible paid plans; check the current plan comparison for availability.",
        ],
      },
    ],
    note:
      "The scanner creates PDFs from captured pages. Do not rely on it for automatic text recognition or OCR.",
  },
  {
    id: "business-workspaces",
    number: "04",
    title: "Business workspaces & access",
    intro:
      "A business workspace gives a team a shared place for files, members and collaboration tools, with access configured by role and folder.",
    groups: [
      {
        title: "Create a workspace and invite teammates",
        icon: Users,
        points: [
          "Create a workspace with a name, or accept an invitation to join an existing one.",
          "Open Shared files and create a shared folder before uploading team documents. Create nested folders inside an existing folder when you need more structure.",
          "Owners and administrators can invite people by email, assign a workspace role, and update or remove membership.",
          "When inviting a manager or staff member, select the folders they can access and choose whether access applies to subfolders. You can also adjust folder permissions later.",
          "Staff capacity depends on the subscription. Invited teammates need to join the workspace before they can use its shared resources.",
        ],
      },
      {
        title: "Roles and folder permissions",
        icon: ShieldCheck,
        points: [
          "Workspace roles include Owner, Admin, Manager and Staff. Management capabilities differ by role.",
          "Workspace administrators can grant or restrict supported folder actions, including viewing, uploading, editing supported files, downloading, moving and managing contents.",
          "Folder permissions can apply to subfolders. Check a member’s access before placing sensitive files in a shared folder.",
        ],
      },
      {
        title: "Shared workspace files",
        icon: FolderOpen,
        points: [
          "Workspace files are accessed through the workspace and its folder permissions, rather than a public link to an individual file.",
          "Use the workspace selector if you belong to more than one business workspace.",
          "Workspace tools such as team chat, signatures, approvals and reminders are available after a business workspace is set up.",
        ],
      },
    ],
  },
  {
    id: "team-tools",
    number: "05",
    title: "Team chat & work coordination",
    intro:
      "Keep team conversations and repeatable business workflows connected to the workspace where work happens.",
    groups: [
      {
        title: "Team chat",
        icon: MessageCircle,
        points: [
          "Use the shared workspace room for conversations visible to workspace members.",
          "Start a direct conversation with an individual workspace member.",
          "Attach a reference to an accessible workspace file in a message so teammates can find the relevant item.",
        ],
      },
      {
        title: "Signatures",
        icon: FileSignature,
        points: [
          "Create a request from an accessible workspace PDF and select the members who need to sign.",
          "Choose sequential signing or let signers sign in any order. An optional due date helps set expectations.",
          "Eligible signers can type their account name or draw a mark, review the PDF, and explicitly consent before signing. Completed requests provide a signed PDF copy.",
          "The workflow records signer actions and consent, but IMARA does not claim that a signature has qualified electronic-signature or legal status.",
        ],
      },
      {
        title: "Approvals",
        icon: CheckCircle2,
        points: [
          "Workspace administrators can build reusable approval templates with one or more review stages.",
          "A stage can be sequential (one approver) or parallel (selected reviewers act together). Submit requests with context, a deadline and accessible workspace files.",
          "Reviewers can approve, decline or request changes with a decision note. Requesters can revise and resubmit when changes are requested.",
          "Follow assigned reviewers and the decision history from the approval desk.",
        ],
      },
      {
        title: "Reminders",
        icon: BellRing,
        points: [
          "Create a dated reminder, add details and assign it to yourself or an active workspace member.",
          "Choose a one-time, daily, weekly or monthly recurrence. Mark a reminder done or cancel it when plans change.",
          "In-app notifications are delivered for reminders; an email alert can also be selected where available.",
        ],
      },
    ],
  },
  {
    id: "events",
    number: "06",
    title: "Events & QR galleries",
    intro:
      "Collect the photos and videos guests take on their own phones in one event collection.",
    groups: [
      {
        title: "Set up an event",
        icon: CalendarDays,
        points: [
          "Create an event with its name and date, then choose how viewers can access its gallery: private, by link or with a passcode.",
          "IMARA creates a unique guest-upload QR code and capture link for the event. Download or print the code for invitations, signs or tables.",
          "Event capacity and the storage used by guest uploads depend on your plan.",
        ],
      },
      {
        title: "Invite guests to contribute",
        icon: Users,
        points: [
          "Guests scan the QR code with a phone to open the upload page in their browser; they do not need to install the IMARA app.",
          "Guests can select photos or videos already on their device, or use the browser camera to capture media.",
          "Uploads are added to that event’s collection. The organiser and permitted gallery viewers can revisit the collected media.",
        ],
      },
    ],
  },
  {
    id: "announcements",
    number: "07",
    title: "Announcements & notifications",
    intro:
      "Keep an eye on platform announcements and workspace updates from their respective notification areas.",
    groups: [
      {
        title: "Platform announcements",
        icon: BellRing,
        points: [
          "Open Announcements from the personal navigation to read platform updates.",
          "An unread count appears in the sidebar when announcements are waiting to be read.",
        ],
      },
      {
        title: "Workspace notifications",
        icon: BellRing,
        points: [
          "Workspace notifications are associated with a business workspace and can be marked as read.",
          "Reminder notifications are delivered in-app; optional email alerts can be selected when creating a reminder.",
        ],
      },
    ],
  },
  {
    id: "plans",
    number: "08",
    title: "Plans, capacity & limits",
    intro:
      "Plan entitlements control storage and selected capabilities. The service checks eligible actions against your account’s plan.",
    groups: [
      {
        title: "Published plan capacities",
        icon: CreditCard,
        points: [
          "The current plan comparison lists Free with 5 GB storage, up to 3 staff and 3 active events.",
          "Pro is listed with 15 GB storage, up to 10 staff and 10 active events. Document editing and scan-to-upload are included.",
          "Business is listed with 25 GB storage, up to 30 staff and 20 active events. Document editing and scan-to-upload are included.",
          "Plan prices and terms can change. Visit Pricing for the current figures and renewal details before choosing a plan.",
        ],
      },
      {
        title: "When you reach a limit",
        icon: Clock3,
        points: [
          "IMARA blocks an action that exceeds an account’s plan allowance and explains the limit.",
          "Existing files, staff and events are not automatically deleted just to make room.",
          "Storage, staff, active-event, scanning and editing eligibility may differ by plan. The Pricing page is the source for current published capacity.",
        ],
      },
    ],
  },
  {
    id: "privacy-and-boundaries",
    number: "09",
    title: "Privacy, safety & product boundaries",
    intro:
      "Understand who can access content and which capabilities IMARA does not currently promise.",
    groups: [
      {
        title: "Access and account safety",
        icon: ShieldCheck,
        points: [
          "Sign-in and email verification establish account access. Workspace membership and folder permissions control access to business files.",
          "Review roles and folder permissions before sharing sensitive business content, and remove access when it is no longer needed.",
          "Event gallery privacy is configured separately as private, link-accessible or passcode-protected.",
        ],
      },
      {
        title: "Known limitations",
        icon: HelpCircle,
        points: [
          "Personal-drive files do not currently have public share links. Share business files through workspace membership and folder access.",
          "Document editing is limited to supported formats and eligible plans. Download files that cannot be edited in the browser.",
          "The document scanner should not be relied on for OCR or automatic text recognition.",
          "Product access controls are not a security certification or guarantee. IMARA does not claim end-to-end encryption, a specific backup or retention schedule, or regulatory compliance.",
        ],
      },
    ],
    note:
      "Review your organisation’s policies and requirements before storing restricted, regulated or especially sensitive records.",
  },
];

function normalized(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function DocsPage() {
  const [query, setQuery] = useState("");

  const search = normalized(query.trim());

  const visibleSections = sections.flatMap((section) => {
    const sectionMatches =
      !search ||
      normalized(
        `${section.title} ${section.intro} ${section.note ?? ""}`,
      ).includes(search);

    const groups = section.groups.flatMap((group) => {
      const groupMatches =
        !search ||
        normalized(`${group.title} ${group.points.join(" ")}`).includes(
          search,
        );

      if (sectionMatches || groupMatches) {
        const points =
          sectionMatches || !search
            ? group.points
            : group.points.filter((point) =>
                normalized(point).includes(search),
              );

        return [{ ...group, points }];
      }

      return [];
    });

    return groups.length || sectionMatches
      ? [{ ...section, groups }]
      : [];
  });

  return (
    <PageShell
      eyebrow="IMARA FIELD GUIDE"
      title="Documentation"
      description="A practical guide to IMARA’s files, workspaces, team tools, event galleries, plans and product boundaries."
    >
      <div className="imara-docs">
        <section className="docs-cover">
          <div className="docs-cover-copy">
            <span className="docs-cover-index">
              <BookOpen size={14} />
              PRODUCT MANUAL
              <i />
              UPDATED FOR THE CURRENT APP
            </span>

            <h2>
              One guide.
              <br />
              <em>Everyday clarity.</em>
            </h2>

            <p>
              Learn what each part of IMARA does, how to get started, and
              where plan limits or access settings apply.
            </p>

            <div className="docs-cover-links">
              <Link to="/register">
                Create an account <ArrowUpRight size={14} />
              </Link>

              <Link to="/pricing">
                Compare plans <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          <div className="docs-cover-art" aria-hidden="true">
            <span className="docs-cover-ring docs-cover-ring-one" />
            <span className="docs-cover-ring docs-cover-ring-two" />

            <div>
              <BookOpen size={38} strokeWidth={1.2} />
              <i />
              <i />
            </div>

            <span>
              IMARA
              <br />
              FIELD NOTES · 01
            </span>
          </div>

          <div className="docs-cover-footer">
            <span>THE DIGITAL DRIVE</span>
            <span>BUSINESS WORKSPACES</span>
            <span>EVENT GALLERIES</span>
          </div>
        </section>

        <div className="docs-toolbar">
          <label className="docs-search">
            <Search size={16} />

            <span className="sr-only">Search documentation</span>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search features, workflows, limits…"
            />
          </label>

          <span className="docs-section-count">
            {search
              ? `${visibleSections.length} ${
                  visibleSections.length === 1 ? "section" : "sections"
                } found`
              : `${sections.length} chapters`}
          </span>
        </div>

        <div className="docs-layout">
          <nav
            className="docs-toc"
            aria-label="Documentation contents"
          >
            <span className="docs-toc-label">IN THIS GUIDE</span>

            {sections.map((section) => {
              const isVisible = visibleSections.some(
                (visible) => visible.id === section.id,
              );

              return (
                <a
                  key={section.id}
                  className={
                    !isVisible && search ? "docs-toc-hidden" : ""
                  }
                  href={`#${section.id}`}
                >
                  <span>{section.number}</span>
                  {section.title}
                </a>
              );
            })}

            <Link className="docs-toc-help" to="/help">
              Need quick help? <ArrowUpRight size={13} />
            </Link>
          </nav>

          <div className="docs-chapters" aria-live="polite">
            {visibleSections.length ? (
              visibleSections.map((section) => (
                <section
                  className="docs-chapter"
                  id={section.id}
                  key={section.id}
                >
                  <header className="docs-chapter-heading">
                    <span>
                      {section.number} <i>/</i> THE GUIDE
                    </span>

                    <h2>{section.title}</h2>

                    <p>{section.intro}</p>
                  </header>

                  <div className="docs-card-grid">
                    {section.groups.map((group) => {
                      const Icon = group.icon;

                      return (
                        <article
                          className="docs-card"
                          key={group.title}
                        >
                          <div className="docs-card-heading">
                            <span>
                              <Icon
                                size={17}
                                strokeWidth={1.7}
                              />
                            </span>

                            <h3>{group.title}</h3>
                          </div>

                          <ul>
                            {group.points.map((point, index) => (
                              <li key={point}>
                                <span className="docs-point-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      );
                    })}
                  </div>

                  {section.note && (
                    <aside className="docs-note">
                      <ShieldCheck size={16} />
                      <p>{section.note}</p>
                    </aside>
                  )}
                </section>
              ))
            ) : (
              <div className="docs-no-results">
                <Search size={20} />

                <strong>
                  No guide sections match “{query}”
                </strong>

                <p>
                  Try a feature name such as files, scanner, workspace,
                  events or plans.
                </p>

                <button
                  type="button"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>

        <section className="docs-next">
          <div>
            <span className="docs-toc-label">KEEP EXPLORING</span>

            <h2>Want the short version?</h2>

            <p>
              Browse quick-start help or read answers to common
              questions.
            </p>
          </div>

          <div>
            <Link to="/help">
              Help centre <ArrowUpRight size={15} />
            </Link>

            <Link to="/faq">
              Frequently asked questions <ArrowUpRight size={15} />
            </Link>

            <Link to="/security">
              Security & access <ArrowUpRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export default DocsPage;