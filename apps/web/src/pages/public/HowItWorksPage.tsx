
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  LockKeyhole,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  Upload,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";
import { MarketingCTA, useHashScroll } from "./MarketingContent";

const eventImages = {
  main: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1100&q=85",
  guests: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=700&q=85",
  dinner: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=700&q=85",
  party: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=700&q=85",
};

const steps = [
  {
    number: "01",
    label: "PERSONAL FILE MANAGEMENT",
    icon: FolderPlus,
    title: "Bring your documents into one organised space.",
    description:
      "Upload documents from your device, create folders and subfolders, and search by file name when you need something. Preview supported formats, download files, and edit supported documents where your plan allows.",
    points: [
      "Upload documents from your device",
      "Create folders and subfolders",
      "Search and preview supported files",
      "Rename, move, download, and manage files",
    ],
  },
  {
    number: "02",
    label: "BUSINESS WORKSPACE",
    icon: UsersRound,
    title: "Invite your team. Control which folders they can access.",
    description:
      "Create a business workspace and invite teammates by email. Assign workspace roles and set folder permissions for the work each person needs to do.",
    points: [
      "Invite staff by email",
      "Assign workspace roles",
      "Control folder-level access",
      "Update or remove member permissions",
    ],
  },
  {
    number: "03",
    label: "EVENT CREATION",
    icon: QrCode,
    title: "Set up your event and generate its QR code.",
    description:
      "Enter your event name and date, choose how people can access the finished gallery, and generate a dedicated QR code for guest uploads. Download or print the code for your event.",
    points: [
      "Add your event name and date",
      "Choose private, link, or passcode gallery access",
      "Generate a unique guest-upload QR code",
      "Download or print the code",
    ],
  },
  {
    number: "04",
    label: "GUEST PHOTO & VIDEO COLLECTION",
    icon: Smartphone,
    title: "Let everyone contribute their own memories.",
    description:
      "Guests scan the event QR code and open the mobile capture page in their browser. They can take photos or videos, or select existing media from their phones, then upload directly to the event collection.",
    points: [
      "Scan the event QR code",
      "Open the guest camera page",
      "Capture or select photos and videos",
      "Upload to the event's shared collection",
    ],
  },
];

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.8px] text-[#168D34]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#20AD43]" />
      {children}
    </span>
  );
}

function DriveVisual() {
  const files = [
    {
      name: "Business Documents",
      detail: "12 items",
      type: "folder",
      color: "text-amber-500",
    },
    {
      name: "Project Proposal.pdf",
      detail: "2.4 MB",
      type: "pdf",
      color: "text-red-500",
    },
    {
      name: "Brand Guidelines",
      detail: "8 items",
      type: "folder",
      color: "text-amber-500",
    },
    {
      name: "Annual Report.docx",
      detail: "1.8 MB",
      type: "doc",
      color: "text-blue-500",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_18px_55px_rgba(16,43,70,0.09)]">
      <div className="flex items-center justify-between border-b border-[#EDF0F3] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#20AD43] text-xs font-bold text-white">
            i
          </span>
          <span className="text-xs font-bold text-[#102B46]">IMARA Drive</span>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-semibold text-[#168D34]">
          <Check size={12} /> Synced
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] text-[#9AA7B5]">MY WORKSPACE / FILES</p>
            <h3 className="mt-1 text-lg font-bold text-[#102B46]">My Drive</h3>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#20AD43] px-3 py-2 text-[10px] font-bold text-white"
          >
            <Upload size={13} /> Upload
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E7ECF0] bg-[#FAFBFC] px-3 py-2.5">
          <Search size={14} className="text-[#9AA7B5]" />
          <span className="text-[10px] text-[#9AA7B5]">
            Search files and folders...
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#526678]">
            Recently accessed
          </span>
          <span className="text-[9px] text-[#9AA7B5]">Name · Modified</span>
        </div>

        <div className="mt-2 divide-y divide-[#F0F2F5]">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex min-w-0 items-center gap-3 py-3"
            >
              {file.type === "folder" ? (
                <Folder size={19} className={file.color} />
              ) : (
                <FileText size={19} className={file.color} />
              )}
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#34495B] sm:text-xs">
                {file.name}
              </span>
              <span className="hidden text-[9px] text-[#9AA7B5] sm:block">
                {file.detail}
              </span>
              <ChevronRight size={13} className="text-[#B0BAC4]" />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#F3FAF4] p-3">
          <ShieldCheck size={16} className="shrink-0 text-[#20AD43]" />
          <p className="text-[9px] leading-4 text-[#526678]">
            Your files stay organised in your IMARA workspace.
          </p>
        </div>
      </div>
    </div>
  );
}

function SharingVisual() {
  const members = [
    {
      name: "Sarah Johnson",
      email: "sarah@company.com",
      initials: "SJ",
      permission: "Can edit",
      color: "bg-[#FCE8D8] text-[#B86A32]",
    },
    {
      name: "David Williams",
      email: "david@company.com",
      initials: "DW",
      permission: "Can view",
      color: "bg-[#E6EDFF] text-[#526DB4]",
    },
    {
      name: "Amaka Okoro",
      email: "amaka@company.com",
      initials: "AO",
      permission: "Can edit",
      color: "bg-[#E5F5E9] text-[#258B45]",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_18px_55px_rgba(16,43,70,0.09)]">
      <div className="flex items-center justify-between border-b border-[#EDF0F3] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            BUSINESS WORKSPACE
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Project Alpha
          </h3>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
          <UsersRound size={17} />
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3 rounded-xl border border-[#E8EDF1] bg-[#FAFBFC] p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF2D9] text-amber-600">
            <Folder size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#102B46]">
              Project Alpha
            </p>
            <p className="mt-1 text-[9px] text-[#718096]">
              Shared folder · 18 files
            </p>
          </div>
          <LockKeyhole size={15} className="text-[#20AD43]" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-bold text-[#102B46]">
            Folder members
          </span>
          <span className="text-[9px] text-[#9AA7B5]">3 members</span>
        </div>

        <div className="mt-3 space-y-4">
          {members.map((member) => (
            <div key={member.email} className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${member.color}`}
              >
                {member.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[#34495B]">
                  {member.name}
                </p>
                <p className="truncate text-[9px] text-[#9AA7B5]">
                  {member.email}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#F2F5F7] px-2 py-1 text-[9px] font-semibold text-[#526678]">
                {member.permission}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#B8DCC1] bg-[#F5FBF6] py-3 text-[10px] font-bold text-[#168D34]">
          <UsersRound size={14} /> Invite another teammate
        </div>
      </div>
    </div>
  );
}

function EventVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-[0_18px_55px_rgba(16,43,70,0.09)]">
      <div className="relative h-[190px] overflow-hidden sm:h-[225px]">
        <img
          src={eventImages.main}
          alt="Outdoor wedding celebration"
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#102B46]/85 via-[#102B46]/10 to-transparent" />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[9px] font-bold text-[#168D34]">
          EVENT PREVIEW
        </span>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-[9px] font-semibold uppercase tracking-[1.5px] text-white/75">
            A day to remember
          </p>
          <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            The Wedding Celebration
          </h3>
          <p className="mt-2 flex items-center gap-2 text-[10px] text-white/80">
            <span>24 October, 2026</span>
            <span className="h-1 w-1 rounded-full bg-white/70" />
            <span>Private event</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 p-4 sm:p-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            GUEST UPLOAD ACCESS
          </p>
          <p className="mt-1 text-sm font-bold text-[#102B46]">
            Your event QR code
          </p>
          <p className="mt-1 max-w-[210px] text-[10px] leading-5 text-[#718096]">
            Give guests one code to open the event's upload page.
          </p>
        </div>
        <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-xl border border-[#E5EAF0] bg-[#FAFBFC] text-[#102B46]">
          <QrCode size={48} strokeWidth={1.6} />
          <span className="mt-1 text-[8px] font-bold text-[#526678]">
            EVENT QR
          </span>
        </div>
      </div>

      <div className="mx-4 mb-4 flex items-center justify-between rounded-lg bg-[#F3FAF4] px-3 py-3 sm:mx-5 sm:mb-5">
        <span className="flex items-center gap-2 text-[10px] font-semibold text-[#168D34]">
          <Check size={13} /> Guest upload page ready
        </span>
        <span className="text-[9px] text-[#718096]">Share code</span>
      </div>
    </div>
  );
}

function GuestJourneyVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[0_24px_65px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between border-b border-[#EDF0F3] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#9AA7B5]">
            EVENT COLLECTION
          </p>
          <h3 className="mt-1 text-sm font-bold text-[#102B46]">
            Wedding memories
          </h3>
        </div>
        <span className="rounded-full bg-[#EAF8EE] px-2.5 py-1.5 text-[9px] font-bold text-[#168D34]">
          Shared gallery
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
        <div className="relative col-span-2 h-[165px] overflow-hidden rounded-xl sm:h-[210px]">
          <img
            src={eventImages.main}
            alt="Wedding celebration"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-3 left-3 text-white">
            <p className="text-[9px] text-white/75">EVENT PHOTOS</p>
            <p className="mt-1 text-lg font-bold">Moments worth keeping</p>
          </div>
        </div>
        <div className="h-[110px] overflow-hidden rounded-xl sm:h-[135px]">
          <img
            src={eventImages.guests}
            alt="Guests celebrating together"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="h-[110px] overflow-hidden rounded-xl sm:h-[135px]">
          <img
            src={eventImages.dinner}
            alt="Wedding dinner arrangement"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-4 sm:px-5 sm:pb-5">
        <div>
          <p className="text-[10px] font-bold text-[#102B46]">
            Guest contributions
          </p>
          <p className="mt-1 text-[9px] text-[#718096]">
            Photos and videos in one event collection
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
          <ImageIcon size={17} />
        </span>
      </div>
    </div>
  );
}

function WorkflowStep({
  step,
}: {
  step: (typeof steps)[number];
}) {
  const Icon = step.icon;

  return (
    <article className="relative grid gap-5 border-b border-[#E8EDF1] py-8 last:border-b-0 sm:grid-cols-[72px_1fr] sm:gap-7 sm:py-10">
      <div className="flex items-start gap-4 sm:block">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF8EE] text-[#168D34]">
          <Icon size={21} />
        </span>
        <span className="pt-2 text-[11px] font-extrabold tracking-[1.5px] text-[#20AD43] sm:mt-4 sm:block">
          STEP {step.number}
        </span>
      </div>

      <div className="min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-[1.7px] text-[#8A99A8]">
          {step.label}
        </span>
        <h3 className="mt-2 max-w-[650px] text-xl font-bold leading-snug tracking-[-0.6px] text-[#102B46] sm:text-2xl">
          {step.title}
        </h3>
        <p className="mt-3 max-w-[720px] text-sm leading-7 text-[#718096]">
          {step.description}
        </p>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {step.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-xs leading-5 text-[#526678]"
            >
              <Check
                size={15}
                className="mt-0.5 shrink-0 text-[#20AD43]"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function HowItWorksPage() {
  useHashScroll();

  return (
    <PageShell
      eyebrow="HOW IMARA WORKS"
      title="See how IMARA works, step by step."
      description="Organise your documents, manage team access, and collect event photos and videos through one simple QR-powered process."
    >
      <div className="space-y-16 pb-8 sm:space-y-20">
        {/* Introduction */}
        <section className="grid gap-7 rounded-2xl border border-[#E5EAF0] bg-[#F7F9FC] p-5 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div className="max-w-[700px]">
            <SectionLabel>FOUR CLEAR STEPS</SectionLabel>
            <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-[-1px] text-[#102B46] sm:text-3xl">
              From uploading your first file to collecting every event memory.
            </h2>
            <p className="mt-4 max-w-[650px] text-sm leading-7 text-[#718096]">
              IMARA brings together document storage, business folder sharing,
              event creation, and guest photo and video collection. Follow
              each workflow below to see how it works.
            </p>
          </div>

          <Link
            to="/register"
            className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-lg bg-[#20AD43] px-5 text-sm font-bold text-white transition hover:bg-[#199438] lg:self-center"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </section>

        {/* Workflow steps */}
        <section>
          <div className="mb-5 max-w-[650px]">
            <SectionLabel>THE IMARA WORKFLOW</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
              Four things you can do.
            </h2>
          </div>

          <div>
            {steps.map((step) => (
              <WorkflowStep
                key={step.number}
                step={step}
              />
            ))}
          </div>
        </section>

        {/* Digital Drive and sharing visuals */}
        <section className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="order-2 lg:order-1">
            <DriveVisual />
          </div>
          <div className="order-1 lg:order-2">
            <SectionLabel>YOUR DIGITAL DRIVE</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-1px] text-[#102B46] sm:text-3xl">
              Find the document you need without searching through scattered folders.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#718096]">
              Keep documents in named folders, organise them into subfolders,
              and use search to return to files. Open supported formats,
              download documents, and use editing features where available
              on your plan.
            </p>
            <Link
              to="/features#digital-drive"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#168D34] hover:gap-3"
            >
              Explore Digital Drive <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionLabel>TEAM FOLDER ACCESS</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-1px] text-[#102B46] sm:text-3xl">
              Give each teammate access to the folders they need.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#718096]">
              Invite people into your business workspace and manage their
              folder permissions. Choose who can view, upload, edit supported
              files, or download shared content.
            </p>
            <Link
              to="/features#file-sharing"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#168D34] hover:gap-3"
            >
              Explore file sharing <ArrowRight size={16} />
            </Link>
          </div>
          <SharingVisual />
        </section>

        {/* Event QR journey */}
        <section
          id="event-journey"
          className="relative overflow-hidden rounded-3xl bg-[#102B46] px-5 py-10 sm:px-9 sm:py-14 lg:px-12 lg:py-16"
        >
          <div className="absolute -right-32 -top-32 h-[380px] w-[380px] rounded-full bg-[#20AD43]/10 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
            <div>
              <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.8px] text-[#8FE2A2]">
                <QrCode size={15} /> THE QR GALLERY JOURNEY
              </span>

              <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-[-1.3px] text-white sm:text-4xl">
                Everyone captures the event differently. Keep it all together.
              </h2>

              <p className="mt-5 text-sm leading-7 text-white/65">
                Your event QR code opens a dedicated mobile capture page.
                Guests contribute their own photos and videos, while the
                organiser manages the event collection and gallery access.
              </p>

              <div className="mt-8 space-y-6">
                <div className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm font-bold text-[#8FE2A2]">
                    01
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Create your event
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      Add the event details and choose gallery privacy.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm font-bold text-[#8FE2A2]">
                    02
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Share the QR code
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      Download or print the code so guests can scan it.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-sm font-bold text-[#8FE2A2]">
                    03
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Collect everyone's photos and videos
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-white/55">
                      Guests upload from their phones into the event collection.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                to="/features#shared-gallery"
                className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#20AD43] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#199438]"
              >
                Explore the shared gallery <ArrowRight size={16} />
              </Link>
            </div>

            <GuestJourneyVisual />
          </div>
        </section>

        {/* Event creation visual */}
        <section className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="order-2 lg:order-1">
            <EventVisual />
          </div>

          <div className="order-1 lg:order-2">
            <SectionLabel>EVENT SETUP</SectionLabel>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-[-1px] text-[#102B46] sm:text-3xl">
              One event page. One QR code. One shared collection.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#718096]">
              Create an event, choose how its gallery can be viewed, and
              generate the guest-upload QR code. Put the code on invitations,
              event signage, or tables so attendees can contribute.
            </p>
            <Link
              to="/features#event-qr"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#168D34] hover:gap-3"
            >
              Explore event creation <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        {/* Scanner */}
        <section className="grid gap-6 rounded-2xl border border-[#E5EAF0] bg-[#F7F9FC] p-5 sm:p-8 md:grid-cols-[auto_1fr_auto] md:items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#20AD43] shadow-sm">
            <ScanLine size={25} />
          </span>

          <div>
            <SectionLabel>DOCUMENT SCANNING</SectionLabel>
            <h2 className="mt-2 text-xl font-bold text-[#102B46] sm:text-2xl">
              Turn paper documents into PDFs.
            </h2>
            <p className="mt-2 max-w-[700px] text-sm leading-6 text-[#718096]">
              On eligible plans, use the document scanner to capture pages,
              review and reorder them, and save the result as a PDF in your
              Digital Drive. This scanner is for paperwork, separate from
              the event camera used for guest photos and videos.
            </p>
          </div>

          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#168D34] hover:gap-3"
          >
            See plan access <ArrowUpRight size={16} />
          </Link>
        </section>

        {/* CTA */}
        <MarketingCTA
          title="Ready to put IMARA to work?"
          description="Create your account to organise documents, invite your business team, or start collecting event memories."
        />

        <div className="flex justify-center">
          <Link
            to="/features"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#718096] transition hover:text-[#168D34]"
          >
            See all IMARA features <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

export default HowItWorksPage;
